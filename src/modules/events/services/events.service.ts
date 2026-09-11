import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { EventAuthorizationService } from './event-authorization.service';
import { CreateEventDto } from '../dto/create-event.dto';
import { UpdateEventDto } from '../dto/update-event.dto';
import { EventQueryDto } from '../dto/event-query.dto';
import { EventResponseDto, PaginatedEventsResponseDto } from '../dto/event-response.dto';
import { AssignOrganizerDto, OrganizerResponseDto } from '../dto/assign-organizer.dto';
import { EVENT_EVENTS, EVENT_RESOURCE_TYPE } from '../constants/events.constants';
import {
  AccountStatus,
  Event,
  EventStatus,
  EventVisibility,
  Prisma,
  RegistrationStatus,
} from '@prisma/client';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    private readonly eventAuthService: EventAuthorizationService,
  ) {}

  /**
   * Creates a new Event in DRAFT status
   */
  async create(
    ownerId: string,
    dto: CreateEventDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<EventResponseDto> {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    if (startsAt >= endsAt) {
      throw new BadRequestException('Event endsAt must be after startsAt');
    }

    // Verify creator account is ACTIVE
    const owner = await this.prisma.user.findFirst({
      where: { id: ownerId, deletedAt: null },
    });

    if (!owner || owner.status !== AccountStatus.ACTIVE) {
      throw new BadRequestException('Event owner account must be active');
    }

    const event = await this.prisma.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          ownerId,
          name: dto.name.trim(),
          type: dto.type,
          shortDescription: dto.shortDescription.trim(),
          description: dto.description.trim(),
          startsAt,
          endsAt,
          venueName: dto.venueName.trim(),
          address: dto.address.trim(),
          city: dto.city.trim(),
          country: dto.country.trim(),
          capacity: dto.capacity,
          coverImageUrl: dto.coverImageUrl.trim(),
          logoUrl: dto.logoUrl.trim(),
          mainVideoUrl: dto.mainVideoUrl.trim(),
          tags: dto.tags,
          officialLanguages: dto.officialLanguages,
          visibility: dto.visibility || EventVisibility.PUBLIC,
          ticketType: dto.ticketType || 'FREE',
          websiteUrl: dto.websiteUrl?.trim() || null,
          isHybrid: dto.isHybrid ?? false,
          status: EventStatus.DRAFT,
        },
      });

      await this.outboxService.enqueue(
        {
          eventType: EVENT_EVENTS.EVENT_CREATED,
          aggregateType: EVENT_RESOURCE_TYPE.EVENT,
          aggregateId: created.id,
          payload: {
            eventId: created.id,
            name: created.name,
            ownerId: created.ownerId,
            startsAt: created.startsAt.toISOString(),
          },
        },
        tx,
      );

      return created;
    });

    await this.auditService.log({
      actorUserId: ownerId,
      action: EVENT_EVENTS.EVENT_CREATED,
      resourceType: EVENT_RESOURCE_TYPE.EVENT,
      resourceId: event.id,
      metadata: { name: event.name, capacity: event.capacity },
      ipAddress,
      userAgent,
    });

    return this.mapToResponse(event, 0);
  }

  /**
   * Public discovery / search with bounded pagination
   */
  async findAll(
    query: EventQueryDto,
    _userId?: string,
    userRoles: string[] = [],
  ): Promise<PaginatedEventsResponseDto> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const skip = (page - 1) * pageSize;

    const where: Prisma.EventWhereInput = {
      deletedAt: null,
    };

    // Public callers see only PUBLISHED or ONGOING events with PUBLIC visibility
    const isPrivileged = userRoles.includes('ADMIN');
    if (!isPrivileged) {
      where.visibility = EventVisibility.PUBLIC;
      where.status = query.status
        ? query.status
        : { in: [EventStatus.PUBLISHED, EventStatus.ONGOING] };
    } else if (query.status) {
      where.status = query.status;
    }

    if (query.city) {
      where.city = { contains: query.city, mode: 'insensitive' };
    }

    if (query.country) {
      where.country = { contains: query.country, mode: 'insensitive' };
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.ticketType) {
      where.ticketType = query.ticketType;
    }

    if (query.tag) {
      where.tags = { has: query.tag };
    }

    if (query.startDate) {
      where.startsAt = { gte: new Date(query.startDate) };
    }

    if (query.endDate) {
      where.endsAt = { lte: new Date(query.endDate) };
    }

    if (query.search) {
      const s = query.search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { shortDescription: { contains: s, mode: 'insensitive' } },
        { tags: { has: s } },
      ];
    }

    const [total, events] = await Promise.all([
      this.prisma.event.count({ where }),
      this.prisma.event.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { startsAt: 'asc' },
        include: {
          registrations: {
            where: { status: RegistrationStatus.REGISTERED },
            select: { id: true },
          },
        },
      }),
    ]);

    const items = events.map((e) => this.mapToResponse(e, e.registrations.length));

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  /**
   * Retrieves single event by ID, enforcing visibility & management authorization
   */
  async findById(
    eventId: string,
    userId?: string,
    userRoles: string[] = [],
  ): Promise<EventResponseDto> {
    const event = await this.eventAuthService.assertCanViewEvent(eventId, userId, userRoles);

    const registeredCount = await this.prisma.eventRegistration.count({
      where: { eventId, status: RegistrationStatus.REGISTERED },
    });

    return this.mapToResponse(event, registeredCount);
  }

  /**
   * Updates event identity, content, capacity or dates with session boundary validation
   */
  async update(
    eventId: string,
    userId: string,
    userRoles: string[],
    dto: UpdateEventDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<EventResponseDto> {
    const existing = await this.eventAuthService.assertCanManageEvent(userId, userRoles, eventId);

    const proposedStartsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    const proposedEndsAt = dto.endsAt ? new Date(dto.endsAt) : existing.endsAt;

    if (proposedStartsAt >= proposedEndsAt) {
      throw new BadRequestException('Event endsAt must be after startsAt');
    }

    // User Feedback Rule 4: Validate all existing sessions against modified event dates
    if (dto.startsAt || dto.endsAt) {
      const violatingSessions = await this.prisma.session.findMany({
        where: {
          eventId,
          deletedAt: null,
          OR: [{ startsAt: { lt: proposedStartsAt } }, { endsAt: { gt: proposedEndsAt } }],
        },
        select: { id: true, title: true, startsAt: true, endsAt: true },
      });

      if (violatingSessions.length > 0) {
        throw new BadRequestException(
          `Cannot update event dates: ${violatingSessions.length} existing session(s) fall outside proposed event window [${proposedStartsAt.toISOString()} - ${proposedEndsAt.toISOString()}]. Adjust sessions first.`,
        );
      }
    }

    // Validate capacity reduction
    if (dto.capacity !== undefined) {
      if (dto.capacity < 1) {
        throw new BadRequestException('Capacity must be at least 1');
      }

      const activeRegistrations = await this.prisma.eventRegistration.count({
        where: { eventId, status: RegistrationStatus.REGISTERED },
      });

      if (dto.capacity < activeRegistrations) {
        throw new ConflictException(
          `Cannot reduce capacity to ${dto.capacity}: event already has ${activeRegistrations} registered attendees.`,
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.event.update({
        where: { id: eventId },
        data: {
          name: dto.name?.trim(),
          type: dto.type,
          shortDescription: dto.shortDescription?.trim(),
          description: dto.description?.trim(),
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
          venueName: dto.venueName?.trim(),
          address: dto.address?.trim(),
          city: dto.city?.trim(),
          country: dto.country?.trim(),
          capacity: dto.capacity,
          coverImageUrl: dto.coverImageUrl?.trim(),
          logoUrl: dto.logoUrl?.trim(),
          mainVideoUrl: dto.mainVideoUrl?.trim(),
          tags: dto.tags,
          officialLanguages: dto.officialLanguages,
          visibility: dto.visibility,
          ticketType: dto.ticketType,
          websiteUrl: dto.websiteUrl !== undefined ? dto.websiteUrl?.trim() || null : undefined,
          isHybrid: dto.isHybrid,
        },
      });

      await this.outboxService.enqueue(
        {
          eventType: EVENT_EVENTS.EVENT_UPDATED,
          aggregateType: EVENT_RESOURCE_TYPE.EVENT,
          aggregateId: eventId,
          payload: { eventId, updatedBy: userId },
        },
        tx,
      );

      return res;
    });

    await this.auditService.log({
      actorUserId: userId,
      action: EVENT_EVENTS.EVENT_UPDATED,
      resourceType: EVENT_RESOURCE_TYPE.EVENT,
      resourceId: eventId,
      metadata: { modifiedFields: Object.keys(dto) },
      ipAddress,
      userAgent,
    });

    const count = await this.prisma.eventRegistration.count({
      where: { eventId, status: RegistrationStatus.REGISTERED },
    });

    return this.mapToResponse(updated, count);
  }

  /**
   * Publishes an event, making it visible to the public
   */
  async publish(
    eventId: string,
    userId: string,
    userRoles: string[],
    ipAddress?: string,
    userAgent?: string,
  ): Promise<EventResponseDto> {
    const event = await this.eventAuthService.assertCanManageEvent(userId, userRoles, eventId);

    if (event.status === EventStatus.PUBLISHED) {
      throw new ConflictException('Event is already published');
    }

    if (event.status === EventStatus.CANCELLED || event.status === EventStatus.COMPLETED) {
      throw new ConflictException('Cannot publish a cancelled or completed event');
    }

    // Minimum publishing validation
    if (!event.name || !event.venueName || !event.address || event.capacity < 1) {
      throw new BadRequestException('Event is missing required venue or capacity information');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.event.update({
        where: { id: eventId },
        data: { status: EventStatus.PUBLISHED },
      });

      await this.outboxService.enqueue(
        {
          eventType: EVENT_EVENTS.EVENT_PUBLISHED,
          aggregateType: EVENT_RESOURCE_TYPE.EVENT,
          aggregateId: eventId,
          payload: { eventId, name: res.name, publishedBy: userId },
        },
        tx,
      );

      return res;
    });

    await this.auditService.log({
      actorUserId: userId,
      action: EVENT_EVENTS.EVENT_PUBLISHED,
      resourceType: EVENT_RESOURCE_TYPE.EVENT,
      resourceId: eventId,
      ipAddress,
      userAgent,
    });

    const count = await this.prisma.eventRegistration.count({
      where: { eventId, status: RegistrationStatus.REGISTERED },
    });

    return this.mapToResponse(updated, count);
  }

  /**
   * Cancels an event
   */
  async cancel(
    eventId: string,
    userId: string,
    userRoles: string[],
    ipAddress?: string,
    userAgent?: string,
  ): Promise<EventResponseDto> {
    const event = await this.eventAuthService.assertCanManageEvent(userId, userRoles, eventId);

    if (event.status === EventStatus.CANCELLED) {
      throw new ConflictException('Event is already cancelled');
    }

    if (event.status === EventStatus.COMPLETED) {
      throw new ConflictException('Cannot cancel a completed event');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.event.update({
        where: { id: eventId },
        data: { status: EventStatus.CANCELLED },
      });

      await this.outboxService.enqueue(
        {
          eventType: EVENT_EVENTS.EVENT_CANCELLED,
          aggregateType: EVENT_RESOURCE_TYPE.EVENT,
          aggregateId: eventId,
          payload: { eventId, cancelledBy: userId },
        },
        tx,
      );

      return res;
    });

    await this.auditService.log({
      actorUserId: userId,
      action: EVENT_EVENTS.EVENT_CANCELLED,
      resourceType: EVENT_RESOURCE_TYPE.EVENT,
      resourceId: eventId,
      ipAddress,
      userAgent,
    });

    const count = await this.prisma.eventRegistration.count({
      where: { eventId, status: RegistrationStatus.REGISTERED },
    });

    return this.mapToResponse(updated, count);
  }

  /**
   * Soft deletes an event
   */
  async softDelete(
    eventId: string,
    userId: string,
    userRoles: string[],
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.eventAuthService.assertCanManageEvent(userId, userRoles, eventId);

    await this.prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id: eventId },
        data: {
          deletedAt: new Date(),
          status: EventStatus.CANCELLED,
        },
      });

      await this.outboxService.enqueue(
        {
          eventType: EVENT_EVENTS.EVENT_DELETED,
          aggregateType: EVENT_RESOURCE_TYPE.EVENT,
          aggregateId: eventId,
          payload: { eventId, deletedBy: userId },
        },
        tx,
      );
    });

    await this.auditService.log({
      actorUserId: userId,
      action: EVENT_EVENTS.EVENT_DELETED,
      resourceType: EVENT_RESOURCE_TYPE.EVENT,
      resourceId: eventId,
      ipAddress,
      userAgent,
    });
  }

  /**
   * Assigns an Organizer to the event (User feedback rule 1)
   */
  async assignOrganizer(
    eventId: string,
    currentUserId: string,
    userRoles: string[],
    dto: AssignOrganizerDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<OrganizerResponseDto> {
    await this.eventAuthService.assertCanManageEvent(currentUserId, userRoles, eventId);

    // 1. Prevent owner from assigning themselves
    if (dto.userId === currentUserId) {
      throw new BadRequestException('Event owner cannot be assigned as organizer');
    }

    // 2. Target user must exist and be ACTIVE
    const targetUser = await this.prisma.user.findFirst({
      where: { id: dto.userId, deletedAt: null },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!targetUser) {
      throw new NotFoundException('Target user not found');
    }

    if (targetUser.status !== AccountStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot assign organizer: user status is ${targetUser.status}. User must be ACTIVE.`,
      );
    }

    // 3. Target user must have ORGANIZER role
    const isOrganizer = targetUser.userRoles.some((ur) => ur.role.name === 'ORGANIZER');
    if (!isOrganizer) {
      throw new BadRequestException('Target user does not hold the ORGANIZER role');
    }

    // 4. Create or upsert assignment
    const assignment = await this.prisma.eventOrganizer.upsert({
      where: {
        eventId_userId: {
          eventId,
          userId: dto.userId,
        },
      },
      update: {
        assignedAt: new Date(),
        assignedBy: currentUserId,
      },
      create: {
        eventId,
        userId: dto.userId,
        assignedBy: currentUserId,
      },
    });

    await this.auditService.log({
      actorUserId: currentUserId,
      action: EVENT_EVENTS.ORGANIZER_ASSIGNED,
      resourceType: EVENT_RESOURCE_TYPE.ORGANIZER,
      resourceId: assignment.id,
      metadata: { eventId, targetUserId: dto.userId },
      ipAddress,
      userAgent,
    });

    return {
      id: assignment.id,
      eventId: assignment.eventId,
      userId: assignment.userId,
      email: targetUser.email,
      assignedAt: assignment.assignedAt.toISOString(),
    };
  }

  /**
   * Removes an Organizer assignment
   */
  async removeOrganizer(
    eventId: string,
    currentUserId: string,
    userRoles: string[],
    targetUserId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.eventAuthService.assertCanManageEvent(currentUserId, userRoles, eventId);

    const assignment = await this.prisma.eventOrganizer.findUnique({
      where: {
        eventId_userId: {
          eventId,
          userId: targetUserId,
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Organizer assignment not found');
    }

    await this.prisma.eventOrganizer.delete({
      where: { id: assignment.id },
    });

    await this.auditService.log({
      actorUserId: currentUserId,
      action: EVENT_EVENTS.ORGANIZER_REMOVED,
      resourceType: EVENT_RESOURCE_TYPE.ORGANIZER,
      resourceId: assignment.id,
      metadata: { eventId, targetUserId },
      ipAddress,
      userAgent,
    });
  }

  /**
   * Lists all assigned organizers for an event
   */
  async getOrganizers(
    eventId: string,
    currentUserId: string,
    userRoles: string[],
  ): Promise<OrganizerResponseDto[]> {
    await this.eventAuthService.assertCanManageEvent(currentUserId, userRoles, eventId);

    const assignments = await this.prisma.eventOrganizer.findMany({
      where: { eventId },
      include: { user: true },
      orderBy: { assignedAt: 'asc' },
    });

    return assignments.map((a) => ({
      id: a.id,
      eventId: a.eventId,
      userId: a.userId,
      email: a.user.email,
      assignedAt: a.assignedAt.toISOString(),
    }));
  }

  private mapToResponse(event: Event, registeredCount: number): EventResponseDto {
    return {
      id: event.id,
      ownerId: event.ownerId,
      name: event.name,
      type: event.type,
      shortDescription: event.shortDescription,
      description: event.description,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      venueName: event.venueName,
      address: event.address,
      city: event.city,
      country: event.country,
      capacity: event.capacity,
      registeredCount,
      coverImageUrl: event.coverImageUrl,
      logoUrl: event.logoUrl,
      mainVideoUrl: event.mainVideoUrl,
      tags: event.tags,
      officialLanguages: event.officialLanguages,
      visibility: event.visibility,
      ticketType: event.ticketType,
      websiteUrl: event.websiteUrl,
      isHybrid: event.isHybrid,
      status: event.status,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    };
  }
}
