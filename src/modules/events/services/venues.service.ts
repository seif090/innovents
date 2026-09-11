import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { EventAuthorizationService } from './event-authorization.service';
import { CreateVenueDto, UpdateVenueDto, VenueResponseDto } from '../dto/venue-response.dto';
import { EVENT_EVENTS, EVENT_RESOURCE_TYPE } from '../constants/events.constants';
import { Venue } from '@prisma/client';

@Injectable()
export class VenuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly eventAuthService: EventAuthorizationService,
  ) {}

  /**
   * Creates a new venue/hall for an event
   */
  async create(
    eventId: string,
    userId: string,
    userRoles: string[],
    dto: CreateVenueDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<VenueResponseDto> {
    await this.eventAuthService.assertCanManageEvent(userId, userRoles, eventId);

    if (dto.capacity !== undefined && dto.capacity < 1) {
      throw new BadRequestException('Capacity must be at least 1');
    }

    const venue = await this.prisma.venue.create({
      data: {
        eventId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        capacity: dto.capacity || null,
        floor: dto.floor?.trim() || null,
        location: dto.location?.trim() || null,
      },
    });

    await this.auditService.log({
      actorUserId: userId,
      action: EVENT_EVENTS.VENUE_CREATED,
      resourceType: EVENT_RESOURCE_TYPE.VENUE,
      resourceId: venue.id,
      metadata: { eventId, name: venue.name },
      ipAddress,
      userAgent,
    });

    return this.mapToResponse(venue);
  }

  /**
   * Lists all venues for an event
   */
  async findAll(
    eventId: string,
    userId?: string,
    userRoles: string[] = [],
  ): Promise<VenueResponseDto[]> {
    await this.eventAuthService.assertCanViewEvent(eventId, userId, userRoles);

    const venues = await this.prisma.venue.findMany({
      where: { eventId },
      orderBy: { name: 'asc' },
    });

    return venues.map((v) => this.mapToResponse(v));
  }

  /**
   * Retrieves single venue by ID
   */
  async findById(
    eventId: string,
    venueId: string,
    userId?: string,
    userRoles: string[] = [],
  ): Promise<VenueResponseDto> {
    await this.eventAuthService.assertCanViewEvent(eventId, userId, userRoles);

    const venue = await this.prisma.venue.findFirst({
      where: { id: venueId, eventId },
    });

    if (!venue) {
      throw new NotFoundException('Venue not found');
    }

    return this.mapToResponse(venue);
  }

  /**
   * Updates an existing venue
   */
  async update(
    eventId: string,
    venueId: string,
    userId: string,
    userRoles: string[],
    dto: UpdateVenueDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<VenueResponseDto> {
    await this.eventAuthService.assertCanManageEvent(userId, userRoles, eventId);

    const venue = await this.prisma.venue.findFirst({
      where: { id: venueId, eventId },
    });

    if (!venue) {
      throw new NotFoundException('Venue not found in this event');
    }

    if (dto.capacity !== undefined && dto.capacity < 1) {
      throw new BadRequestException('Capacity must be at least 1');
    }

    const updated = await this.prisma.venue.update({
      where: { id: venueId },
      data: {
        name: dto.name?.trim(),
        description: dto.description !== undefined ? dto.description?.trim() || null : undefined,
        capacity: dto.capacity,
        floor: dto.floor !== undefined ? dto.floor?.trim() || null : undefined,
        location: dto.location !== undefined ? dto.location?.trim() || null : undefined,
      },
    });

    await this.auditService.log({
      actorUserId: userId,
      action: EVENT_EVENTS.VENUE_UPDATED,
      resourceType: EVENT_RESOURCE_TYPE.VENUE,
      resourceId: venueId,
      metadata: { eventId, modifiedFields: Object.keys(dto) },
      ipAddress,
      userAgent,
    });

    return this.mapToResponse(updated);
  }

  /**
   * Deletes a venue (enforcing User Feedback Rule 2: block if sessions exist)
   */
  async delete(
    eventId: string,
    venueId: string,
    userId: string,
    userRoles: string[],
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.eventAuthService.assertCanManageEvent(userId, userRoles, eventId);

    const venue = await this.prisma.venue.findFirst({
      where: { id: venueId, eventId },
    });

    if (!venue) {
      throw new NotFoundException('Venue not found in this event');
    }

    // User Feedback Rule 2: Cannot delete venue while active sessions are scheduled in it
    const activeSessionsCount = await this.prisma.session.count({
      where: { venueId, deletedAt: null },
    });

    if (activeSessionsCount > 0) {
      throw new ConflictException(
        `Cannot delete venue: ${activeSessionsCount} session(s) are currently scheduled in this venue. Reassign or delete the sessions first.`,
      );
    }

    await this.prisma.venue.delete({
      where: { id: venueId },
    });

    await this.auditService.log({
      actorUserId: userId,
      action: EVENT_EVENTS.VENUE_DELETED,
      resourceType: EVENT_RESOURCE_TYPE.VENUE,
      resourceId: venueId,
      metadata: { eventId, name: venue.name },
      ipAddress,
      userAgent,
    });
  }

  private mapToResponse(venue: Venue): VenueResponseDto {
    return {
      id: venue.id,
      eventId: venue.eventId,
      name: venue.name,
      description: venue.description,
      capacity: venue.capacity,
      floor: venue.floor,
      location: venue.location,
      createdAt: venue.createdAt.toISOString(),
      updatedAt: venue.updatedAt.toISOString(),
    };
  }
}
