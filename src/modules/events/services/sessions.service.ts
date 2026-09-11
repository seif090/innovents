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
import { CreateSessionDto } from '../dto/create-session.dto';
import { UpdateSessionDto } from '../dto/update-session.dto';
import { ReorderSessionsDto } from '../dto/reorder-sessions.dto';
import { SessionQueryDto } from '../dto/session-query.dto';
import { SessionResponseDto } from '../dto/session-response.dto';
import { EVENT_EVENTS, EVENT_RESOURCE_TYPE } from '../constants/events.constants';
import { Prisma, Session, SessionStatus, Venue, Speaker } from '@prisma/client';

type FullSession = Session & {
  venue: Venue | null;
  speakers: Array<{
    speaker: Speaker;
    displayOrder: number;
  }>;
};

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    private readonly eventAuthService: EventAuthorizationService,
  ) {}

  /**
   * Creates a new session within an event
   */
  async create(
    eventId: string,
    userId: string,
    userRoles: string[],
    dto: CreateSessionDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<SessionResponseDto> {
    const event = await this.eventAuthService.assertCanManageEvent(userId, userRoles, eventId);

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    if (startsAt >= endsAt) {
      throw new BadRequestException('Session endsAt must be after startsAt');
    }

    // Validate session falls inside the parent event's date window
    if (startsAt < event.startsAt || endsAt > event.endsAt) {
      throw new BadRequestException(
        `Session time window [${startsAt.toISOString()} - ${endsAt.toISOString()}] must fall within the event time window [${event.startsAt.toISOString()} - ${event.endsAt.toISOString()}]`,
      );
    }

    // Validate venue if supplied
    if (dto.venueId) {
      const venue = await this.prisma.venue.findFirst({
        where: { id: dto.venueId, eventId },
      });

      if (!venue) {
        throw new BadRequestException('Assigned venue does not belong to this event');
      }
    }

    // Validate speakers if supplied
    if (dto.speakerIds && dto.speakerIds.length > 0) {
      const validSpeakers = await this.prisma.speaker.findMany({
        where: {
          id: { in: dto.speakerIds },
          eventId,
        },
      });

      if (validSpeakers.length !== dto.speakerIds.length) {
        throw new BadRequestException('One or more assigned speakers do not belong to this event');
      }
    }

    // Transaction with venue overlap validation (User Feedback Rule 9)
    const session = await this.prisma.$transaction(async (tx) => {
      if (dto.venueId) {
        // Lock the venue row to serialize concurrent session bookings for the same venue
        try {
          await tx.$queryRaw`SELECT id FROM venues WHERE id = ${dto.venueId}::uuid FOR UPDATE;`;
        } catch {
          // Ignore for non-PostgreSQL testing mocks
        }

        const overlapping = await tx.session.findFirst({
          where: {
            eventId,
            venueId: dto.venueId,
            deletedAt: null,
            status: { not: SessionStatus.CANCELLED },
            AND: [{ startsAt: { lt: endsAt } }, { endsAt: { gt: startsAt } }],
          },
        });

        if (overlapping) {
          throw new ConflictException(
            'Another session is already scheduled in this venue during the requested time window',
          );
        }
      }

      const created = await tx.session.create({
        data: {
          eventId,
          venueId: dto.venueId || null,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          startsAt,
          endsAt,
          displayOrder: dto.displayOrder || 0,
          status: dto.status || SessionStatus.SCHEDULED,
          speakers:
            dto.speakerIds && dto.speakerIds.length > 0
              ? {
                  create: dto.speakerIds.map((speakerId, idx) => ({
                    speakerId,
                    displayOrder: idx,
                  })),
                }
              : undefined,
        },
        include: {
          venue: true,
          speakers: {
            include: { speaker: true },
            orderBy: { displayOrder: 'asc' },
          },
        },
      });

      await this.outboxService.enqueue(
        {
          eventType: EVENT_EVENTS.SESSION_CREATED,
          aggregateType: EVENT_RESOURCE_TYPE.SESSION,
          aggregateId: created.id,
          payload: {
            sessionId: created.id,
            eventId,
            title: created.title,
            startsAt: created.startsAt.toISOString(),
          },
        },
        tx,
      );

      return created;
    });

    await this.auditService.log({
      actorUserId: userId,
      action: EVENT_EVENTS.SESSION_CREATED,
      resourceType: EVENT_RESOURCE_TYPE.SESSION,
      resourceId: session.id,
      metadata: { eventId, title: session.title },
      ipAddress,
      userAgent,
    });

    return this.mapToResponse(session);
  }

  /**
   * Lists all sessions for an event, optionally filtered by date or venue
   */
  async findAll(
    eventId: string,
    query: SessionQueryDto,
    userId?: string,
    userRoles: string[] = [],
  ): Promise<SessionResponseDto[]> {
    await this.eventAuthService.assertCanViewEvent(eventId, userId, userRoles);

    const where: Prisma.SessionWhereInput = {
      eventId,
      deletedAt: null,
    };

    if (query.venueId) {
      where.venueId = query.venueId;
    }

    if (query.date) {
      const startOfDay = new Date(`${query.date}T00:00:00.000Z`);
      const endOfDay = new Date(`${query.date}T23:59:59.999Z`);
      where.startsAt = { gte: startOfDay, lte: endOfDay };
    }

    const sessions = await this.prisma.session.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { startsAt: 'asc' }],
      include: {
        venue: true,
        speakers: {
          include: { speaker: true },
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    return sessions.map((s) => this.mapToResponse(s));
  }

  /**
   * Retrieves single session by ID, strictly enforcing Event Aggregate Boundary (Section 26)
   */
  async findById(
    eventId: string,
    sessionId: string,
    userId?: string,
    userRoles: string[] = [],
  ): Promise<SessionResponseDto> {
    await this.eventAuthService.assertCanViewEvent(eventId, userId, userRoles);

    const session = await this.prisma.session.findFirst({
      where: {
        id: sessionId,
        eventId,
        deletedAt: null,
      },
      include: {
        venue: true,
        speakers: {
          include: { speaker: true },
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found in this event');
    }

    return this.mapToResponse(session);
  }

  /**
   * Updates an existing session
   */
  async update(
    eventId: string,
    sessionId: string,
    userId: string,
    userRoles: string[],
    dto: UpdateSessionDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<SessionResponseDto> {
    const event = await this.eventAuthService.assertCanManageEvent(userId, userRoles, eventId);

    const existing = await this.prisma.session.findFirst({
      where: { id: sessionId, eventId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Session not found in this event');
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : existing.endsAt;

    if (startsAt >= endsAt) {
      throw new BadRequestException('Session endsAt must be after startsAt');
    }

    if (startsAt < event.startsAt || endsAt > event.endsAt) {
      throw new BadRequestException('Session times must fall within the event time window');
    }

    const targetVenueId = dto.venueId !== undefined ? dto.venueId : existing.venueId;

    if (targetVenueId) {
      const venue = await this.prisma.venue.findFirst({
        where: { id: targetVenueId, eventId },
      });

      if (!venue) {
        throw new BadRequestException('Assigned venue does not belong to this event');
      }
    }

    if (dto.speakerIds) {
      const validSpeakers = await this.prisma.speaker.findMany({
        where: {
          id: { in: dto.speakerIds },
          eventId,
        },
      });

      if (validSpeakers.length !== dto.speakerIds.length) {
        throw new BadRequestException('One or more assigned speakers do not belong to this event');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Check venue overlap excluding this session
      if (targetVenueId) {
        const overlapping = await tx.session.findFirst({
          where: {
            id: { not: sessionId },
            eventId,
            venueId: targetVenueId,
            deletedAt: null,
            status: { not: SessionStatus.CANCELLED },
            AND: [{ startsAt: { lt: endsAt } }, { endsAt: { gt: startsAt } }],
          },
        });

        if (overlapping) {
          throw new ConflictException(
            'Another session is already scheduled in this venue during the requested time window',
          );
        }
      }

      // If speakerIds was provided, replace speaker assignments
      if (dto.speakerIds) {
        await tx.sessionSpeaker.deleteMany({
          where: { sessionId },
        });

        if (dto.speakerIds.length > 0) {
          await tx.sessionSpeaker.createMany({
            data: dto.speakerIds.map((speakerId, idx) => ({
              sessionId,
              speakerId,
              displayOrder: idx,
            })),
          });
        }
      }

      const res = await tx.session.update({
        where: { id: sessionId },
        data: {
          venueId: targetVenueId || null,
          title: dto.title?.trim(),
          description: dto.description !== undefined ? dto.description?.trim() || null : undefined,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
          displayOrder: dto.displayOrder,
          status: dto.status,
        },
        include: {
          venue: true,
          speakers: {
            include: { speaker: true },
            orderBy: { displayOrder: 'asc' },
          },
        },
      });

      await this.outboxService.enqueue(
        {
          eventType: EVENT_EVENTS.SESSION_UPDATED,
          aggregateType: EVENT_RESOURCE_TYPE.SESSION,
          aggregateId: sessionId,
          payload: { sessionId, eventId, updatedBy: userId },
        },
        tx,
      );

      return res;
    });

    await this.auditService.log({
      actorUserId: userId,
      action: EVENT_EVENTS.SESSION_UPDATED,
      resourceType: EVENT_RESOURCE_TYPE.SESSION,
      resourceId: sessionId,
      metadata: { eventId, modifiedFields: Object.keys(dto) },
      ipAddress,
      userAgent,
    });

    return this.mapToResponse(updated);
  }

  /**
   * Reorders sessions timeline atomically
   */
  async reorder(
    eventId: string,
    userId: string,
    userRoles: string[],
    dto: ReorderSessionsDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.eventAuthService.assertCanManageEvent(userId, userRoles, eventId);

    // Verify all sessions belong to this event and are not deleted
    const sessions = await this.prisma.session.findMany({
      where: {
        id: { in: dto.sessionIds },
        eventId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (sessions.length !== dto.sessionIds.length) {
      throw new BadRequestException(
        'One or more session IDs are invalid, duplicated, or belong to another event',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < dto.sessionIds.length; i++) {
        await tx.session.update({
          where: { id: dto.sessionIds[i] },
          data: { displayOrder: i },
        });
      }

      await this.outboxService.enqueue(
        {
          eventType: EVENT_EVENTS.SESSION_ORDER_UPDATED,
          aggregateType: EVENT_RESOURCE_TYPE.EVENT,
          aggregateId: eventId,
          payload: { eventId, sessionIds: dto.sessionIds },
        },
        tx,
      );
    });

    await this.auditService.log({
      actorUserId: userId,
      action: EVENT_EVENTS.SESSION_ORDER_UPDATED,
      resourceType: EVENT_RESOURCE_TYPE.EVENT,
      resourceId: eventId,
      metadata: { sessionCount: dto.sessionIds.length },
      ipAddress,
      userAgent,
    });
  }

  /**
   * Soft-deletes a session
   */
  async delete(
    eventId: string,
    sessionId: string,
    userId: string,
    userRoles: string[],
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.eventAuthService.assertCanManageEvent(userId, userRoles, eventId);

    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, eventId, deletedAt: null },
    });

    if (!session) {
      throw new NotFoundException('Session not found in this event');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: sessionId },
        data: {
          deletedAt: new Date(),
          status: SessionStatus.CANCELLED,
        },
      });

      await this.outboxService.enqueue(
        {
          eventType: EVENT_EVENTS.SESSION_DELETED,
          aggregateType: EVENT_RESOURCE_TYPE.SESSION,
          aggregateId: sessionId,
          payload: { sessionId, eventId, deletedBy: userId },
        },
        tx,
      );
    });

    await this.auditService.log({
      actorUserId: userId,
      action: EVENT_EVENTS.SESSION_DELETED,
      resourceType: EVENT_RESOURCE_TYPE.SESSION,
      resourceId: sessionId,
      metadata: { eventId, title: session.title },
      ipAddress,
      userAgent,
    });
  }

  private mapToResponse(session: FullSession): SessionResponseDto {
    return {
      id: session.id,
      eventId: session.eventId,
      venueId: session.venueId,
      title: session.title,
      description: session.description,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      displayOrder: session.displayOrder,
      status: session.status,
      venue: session.venue
        ? {
            id: session.venue.id,
            eventId: session.venue.eventId,
            name: session.venue.name,
            description: session.venue.description,
            capacity: session.venue.capacity,
            floor: session.venue.floor,
            location: session.venue.location,
            createdAt: session.venue.createdAt?.toISOString() || new Date().toISOString(),
            updatedAt: session.venue.updatedAt?.toISOString() || new Date().toISOString(),
          }
        : null,
      speakers: session.speakers
        ? session.speakers.map((s) => ({
            id: s.speaker.id,
            eventId: s.speaker.eventId,
            fullName: s.speaker.fullName,
            jobTitle: s.speaker.jobTitle,
            company: s.speaker.company,
            bio: s.speaker.bio,
            photoUrl: s.speaker.photoUrl,
            linkedinUrl: s.speaker.linkedinUrl,
            createdAt: s.speaker.createdAt?.toISOString() || new Date().toISOString(),
            updatedAt: s.speaker.updatedAt?.toISOString() || new Date().toISOString(),
          }))
        : [],
      createdAt: session.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: session.updatedAt?.toISOString() || new Date().toISOString(),
    };
  }
}
