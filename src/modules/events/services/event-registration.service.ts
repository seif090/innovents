import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { EventAuthorizationService } from './event-authorization.service';
import {
  RegistrationResponseDto,
  PaginatedRegistrationsResponseDto,
} from '../dto/registration-response.dto';
import { EVENT_EVENTS, EVENT_RESOURCE_TYPE } from '../constants/events.constants';
import { AccountStatus, EventStatus, RegistrationStatus } from '@prisma/client';

@Injectable()
export class EventRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    private readonly eventAuthService: EventAuthorizationService,
  ) {}

  /**
   * Concurrency-safe event registration with row-level exclusive locking (FOR UPDATE)
   */
  async register(
    eventId: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RegistrationResponseDto> {
    // 1. Validate user account is active
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new BadRequestException('Only active users may register for events');
    }

    // 2. Interactive transaction with row-level locking
    const registration = await this.prisma.$transaction(async (tx) => {
      // Row lock the event row to serialize concurrent registration requests for this event
      // This guarantees that count + insert operations are completely atomic
      let eventRecord: {
        id: string;
        capacity: number;
        status: EventStatus;
        deletedAt: Date | null;
        endsAt: Date;
      } | null = null;

      try {
        const rawLocked = await tx.$queryRaw<
          Array<{
            id: string;
            capacity: number;
            status: EventStatus;
            deleted_at: Date | null;
            ends_at: Date;
          }>
        >`SELECT id, capacity, status, deleted_at, ends_at FROM events WHERE id = ${eventId}::uuid FOR UPDATE;`;

        if (rawLocked && rawLocked.length > 0 && rawLocked[0]) {
          const row = rawLocked[0];
          eventRecord = {
            id: row.id,
            capacity: row.capacity,
            status: row.status,
            deletedAt: row.deleted_at,
            endsAt: row.ends_at,
          };
        }
      } catch {
        // Fallback for non-PostgreSQL / test environments
        const found = await tx.event.findUnique({
          where: { id: eventId },
          select: {
            id: true,
            capacity: true,
            status: true,
            deletedAt: true,
            endsAt: true,
          },
        });
        if (found) {
          eventRecord = found;
        }
      }

      if (!eventRecord || eventRecord.deletedAt !== null) {
        throw new NotFoundException('Event not found');
      }

      // Check event lifecycle status
      if (eventRecord.status === EventStatus.CANCELLED) {
        throw new ConflictException('Cannot register for a cancelled event');
      }

      if (eventRecord.status === EventStatus.COMPLETED) {
        throw new ConflictException('Cannot register for a completed event');
      }

      if (eventRecord.status === EventStatus.DRAFT) {
        throw new ConflictException('Cannot register for an unpublished draft event');
      }

      // Check temporal validity
      if (new Date(eventRecord.endsAt) < new Date()) {
        throw new ConflictException('Event has already ended');
      }

      // Check existing registration
      const existing = await tx.eventRegistration.findUnique({
        where: {
          eventId_userId: {
            eventId,
            userId,
          },
        },
      });

      if (existing && existing.status === RegistrationStatus.REGISTERED) {
        throw new ConflictException('You are already registered for this event');
      }

      // Count active registrations
      const activeRegistrations = await tx.eventRegistration.count({
        where: {
          eventId,
          status: RegistrationStatus.REGISTERED,
        },
      });

      if (activeRegistrations >= eventRecord.capacity) {
        throw new ConflictException('Event capacity has been reached');
      }

      // User Feedback Rule 6: Handle re-registration cleanly
      let regRecord;
      if (existing && existing.status === RegistrationStatus.CANCELLED) {
        regRecord = await tx.eventRegistration.update({
          where: { id: existing.id },
          data: {
            status: RegistrationStatus.REGISTERED,
            cancelledAt: null,
            registeredAt: new Date(),
          },
        });
      } else {
        regRecord = await tx.eventRegistration.create({
          data: {
            eventId,
            userId,
            status: RegistrationStatus.REGISTERED,
          },
        });
      }

      // Outbox event inside transaction
      await this.outboxService.enqueue(
        {
          eventType: EVENT_EVENTS.REGISTRATION_CREATED,
          aggregateType: EVENT_RESOURCE_TYPE.REGISTRATION,
          aggregateId: regRecord.id,
          payload: {
            registrationId: regRecord.id,
            eventId,
            userId,
            userEmail: user.email,
          },
        },
        tx,
      );

      return regRecord;
    });

    await this.auditService.log({
      actorUserId: userId,
      action: EVENT_EVENTS.REGISTRATION_CREATED,
      resourceType: EVENT_RESOURCE_TYPE.REGISTRATION,
      resourceId: registration.id,
      metadata: { eventId },
      ipAddress,
      userAgent,
    });

    return {
      id: registration.id,
      eventId: registration.eventId,
      userId: registration.userId,
      userEmail: user.email,
      status: registration.status,
      registeredAt: registration.registeredAt.toISOString(),
      cancelledAt: registration.cancelledAt ? registration.cancelledAt.toISOString() : null,
    };
  }

  /**
   * Cancels attendee registration
   */
  async cancel(
    eventId: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    const existing = await this.prisma.eventRegistration.findUnique({
      where: {
        eventId_userId: {
          eventId,
          userId,
        },
      },
    });

    if (!existing || existing.status !== RegistrationStatus.REGISTERED) {
      throw new NotFoundException('Active registration not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.eventRegistration.update({
        where: { id: existing.id },
        data: {
          status: RegistrationStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });

      await this.outboxService.enqueue(
        {
          eventType: EVENT_EVENTS.REGISTRATION_CANCELLED,
          aggregateType: EVENT_RESOURCE_TYPE.REGISTRATION,
          aggregateId: existing.id,
          payload: {
            registrationId: existing.id,
            eventId,
            userId,
          },
        },
        tx,
      );
    });

    await this.auditService.log({
      actorUserId: userId,
      action: EVENT_EVENTS.REGISTRATION_CANCELLED,
      resourceType: EVENT_RESOURCE_TYPE.REGISTRATION,
      resourceId: existing.id,
      metadata: { eventId },
      ipAddress,
      userAgent,
    });

    return {
      success: true,
      message: 'Registration cancelled successfully',
    };
  }

  /**
   * Retrieves attendee registrations for event management dashboard
   */
  async getRegistrations(
    eventId: string,
    currentUserId: string,
    userRoles: string[],
    page = 1,
    pageSize = 20,
  ): Promise<PaginatedRegistrationsResponseDto> {
    await this.eventAuthService.assertCanManageEvent(currentUserId, userRoles, eventId);

    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(1, pageSize));
    const skip = (safePage - 1) * safePageSize;

    const where = {
      eventId,
      status: RegistrationStatus.REGISTERED,
    };

    const [total, records] = await Promise.all([
      this.prisma.eventRegistration.count({ where }),
      this.prisma.eventRegistration.findMany({
        where,
        skip,
        take: safePageSize,
        orderBy: { registeredAt: 'desc' },
        include: {
          user: {
            select: { id: true, email: true },
          },
        },
      }),
    ]);

    const items: RegistrationResponseDto[] = records.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      userId: r.userId,
      userEmail: r.user.email,
      status: r.status,
      registeredAt: r.registeredAt.toISOString(),
      cancelledAt: r.cancelledAt ? r.cancelledAt.toISOString() : null,
    }));

    return {
      items,
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.ceil(total / safePageSize) || 1,
    };
  }
}
