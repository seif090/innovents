import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CommunityAuthorizationService } from './community-authorization.service';
import { CreateMeetupDto } from '../dto/create-meetup.dto';
import { UpdateMeetupDto } from '../dto/update-meetup.dto';
import { MeetupQueryDto } from '../dto/meetup-query.dto';
import { MeetupResponseDto } from '../dto/meetup-response.dto';
import {
  COMMUNITY_AUDIT_ACTIONS,
  COMMUNITY_AUDIT_RESOURCES,
  COMMUNITY_OUTBOX_EVENTS,
} from '../constants/communities.constants';
import { CommunityMeetup, CommunityMeetupStatus, Prisma } from '@prisma/client';

@Injectable()
export class CommunityMeetupsService {
  private readonly logger = new Logger(CommunityMeetupsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: CommunityAuthorizationService,
  ) {}

  /**
   * Create a Mini Event / Meetup inside a community.
   * Authorized: Any ACTIVE member of the community.
   */
  async create(
    communityId: string,
    creatorId: string,
    dto: CreateMeetupDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<MeetupResponseDto> {
    const { community } = await this.authService.assertActiveMember(creatorId, communityId);

    const startsAt = new Date(dto.startsAt);
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;

    if (isNaN(startsAt.getTime())) {
      throw new BadRequestException('Invalid startsAt timestamp');
    }

    if (endsAt && endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }

    // Validate date against parent event
    const event = await this.prisma.event.findUnique({
      where: { id: community.eventId },
    });

    if (event) {
      const allowedWindowEnd = new Date(event.endsAt.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days after event
      if (startsAt < event.startsAt || startsAt > allowedWindowEnd) {
        throw new BadRequestException(
          'Meetup startsAt must fall within or immediately after (up to 7 days) the parent event timeframe',
        );
      }
    }

    const meetup = await this.prisma.$transaction(async (tx) => {
      const m = await tx.communityMeetup.create({
        data: {
          communityId,
          eventId: community.eventId,
          createdById: creatorId,
          title: dto.title,
          description: dto.description,
          startsAt,
          endsAt,
          location: dto.location,
          mapUrl: dto.mapUrl,
          participantLimit: dto.participantLimit,
          participantCount: 1, // Creator automatically participates
          isPinned: true, // DataReq: "يُعلَّق تلقائياً في أعلى التجمع"
          status: CommunityMeetupStatus.SCHEDULED,
        },
      });

      // Creator participation record
      await tx.communityMeetupParticipant.create({
        data: {
          meetupId: m.id,
          userId: creatorId,
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: COMMUNITY_OUTBOX_EVENTS.COMMUNITY_MEETUP_CREATED,
          aggregateType: 'COMMUNITY_MEETUP',
          aggregateId: m.id,
          payload: {
            meetupId: m.id,
            communityId,
            eventId: community.eventId,
            creatorId,
            title: m.title,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: creatorId,
          action: COMMUNITY_AUDIT_ACTIONS.MEETUP_CREATE,
          resourceType: COMMUNITY_AUDIT_RESOURCES.COMMUNITY_MEETUP,
          resourceId: m.id,
          ipAddress,
          userAgent,
          metadata: { communityId, title: m.title },
        },
      });

      return m;
    });

    this.logger.log(`Created meetup ${meetup.id} in community ${communityId} by user ${creatorId}`);

    const creator = await this.prisma.user.findUnique({
      where: { id: creatorId },
      select: { id: true, email: true },
    });

    return this.mapToResponseDto(meetup, creator ?? undefined, true);
  }

  /**
   * Join a meetup.
   * Concurrency-safe: row-level exclusive lock (FOR UPDATE) enforces participantLimit.
   */
  async join(
    communityId: string,
    meetupId: string,
    userId: string,
    _ipAddress?: string,
    _userAgent?: string,
  ): Promise<MeetupResponseDto> {
    await this.authService.assertActiveMember(userId, communityId);

    const meetup = await this.prisma.$transaction(async (tx) => {
      // Row-level lock on meetup
      const lockedMeetups = await tx.$queryRaw<
        Array<{
          id: string;
          community_id: string;
          event_id: string;
          created_by_id: string;
          title: string;
          description: string;
          starts_at: Date;
          ends_at: Date | null;
          location: string;
          map_url: string | null;
          participant_limit: number | null;
          participant_count: number;
          is_pinned: boolean;
          status: CommunityMeetupStatus;
          deleted_at: Date | null;
          created_at: Date;
          updated_at: Date;
        }>
      >(
        Prisma.sql`SELECT * FROM community_meetups WHERE id = ${meetupId}::uuid AND community_id = ${communityId}::uuid AND deleted_at IS NULL FOR UPDATE`,
      );

      const m = lockedMeetups && lockedMeetups.length > 0 ? lockedMeetups[0] : null;
      if (!m) {
        throw new NotFoundException('Meetup not found in this community');
      }

      if (m.status !== CommunityMeetupStatus.SCHEDULED) {
        throw new ConflictException('Cannot join a meetup that is not scheduled');
      }

      // Check existing participation
      const existing = await tx.communityMeetupParticipant.findUnique({
        where: {
          meetupId_userId: {
            meetupId,
            userId,
          },
        },
      });

      if (existing) {
        throw new ConflictException('You are already registered as a participant in this meetup');
      }

      // Check capacity limit
      if (m.participant_limit !== null && m.participant_count >= m.participant_limit) {
        throw new ConflictException('Meetup has reached its maximum participant capacity');
      }

      // Add participant
      await tx.communityMeetupParticipant.create({
        data: {
          meetupId,
          userId,
        },
      });

      // Increment count
      const updated = await tx.communityMeetup.update({
        where: { id: meetupId },
        data: { participantCount: { increment: 1 } },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: COMMUNITY_OUTBOX_EVENTS.COMMUNITY_MEETUP_JOINED,
          aggregateType: 'COMMUNITY_MEETUP',
          aggregateId: meetupId,
          payload: { meetupId, communityId, userId },
        },
      });

      return updated;
    });

    this.logger.log(`User ${userId} joined meetup ${meetupId}`);

    const creator = await this.prisma.user.findUnique({
      where: { id: meetup.createdById },
      select: { id: true, email: true },
    });

    return this.mapToResponseDto(meetup, creator ?? undefined, true);
  }

  /**
   * Leave a meetup.
   * Creator cannot leave without cancelling or deleting the meetup.
   */
  async leave(
    communityId: string,
    meetupId: string,
    userId: string,
    _ipAddress?: string,
    _userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.authService.assertActiveMember(userId, communityId);

    const meetup = await this.prisma.communityMeetup.findFirst({
      where: { id: meetupId, communityId, deletedAt: null },
    });

    if (!meetup) {
      throw new NotFoundException('Meetup not found');
    }

    if (meetup.createdById === userId) {
      throw new BadRequestException(
        'The meetup creator cannot leave the meetup. Cancel the meetup instead.',
      );
    }

    const existing = await this.prisma.communityMeetupParticipant.findUnique({
      where: {
        meetupId_userId: {
          meetupId,
          userId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('You are not registered for this meetup');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.communityMeetupParticipant.delete({
        where: { id: existing.id },
      });

      await tx.communityMeetup.update({
        where: { id: meetupId },
        data: { participantCount: { decrement: 1 } },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: COMMUNITY_OUTBOX_EVENTS.COMMUNITY_MEETUP_LEFT,
          aggregateType: 'COMMUNITY_MEETUP',
          aggregateId: meetupId,
          payload: { meetupId, communityId, userId },
        },
      });
    });

    return { success: true, message: 'Successfully left the meetup' };
  }

  /**
   * Search / list meetups in a community.
   */
  async findAll(
    communityId: string,
    query: MeetupQueryDto,
    currentUserId?: string,
    currentUserRoles: string[] = [],
  ): Promise<{
    data: MeetupResponseDto[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    await this.authService.assertCanViewCommunity(communityId, currentUserId, currentUserRoles);

    const { page = 1, pageSize = 20, status } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.CommunityMeetupWhereInput = {
      communityId,
      deletedAt: null,
      ...(status && { status }),
    };

    const [meetups, total] = await Promise.all([
      this.prisma.communityMeetup.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ isPinned: 'desc' }, { startsAt: 'asc' }],
        include: {
          creator: { select: { id: true, email: true } },
          participants: currentUserId
            ? {
                where: { userId: currentUserId },
                select: { id: true },
              }
            : false,
        },
      }),
      this.prisma.communityMeetup.count({ where }),
    ]);

    const data = meetups.map((m) => {
      const isParticipating = Array.isArray(m.participants) && m.participants.length > 0;
      return this.mapToResponseDto(m, m.creator, isParticipating);
    });

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  /**
   * Find single meetup by ID.
   */
  async findOne(
    communityId: string,
    meetupId: string,
    currentUserId?: string,
    currentUserRoles: string[] = [],
  ): Promise<MeetupResponseDto> {
    await this.authService.assertCanViewCommunity(communityId, currentUserId, currentUserRoles);

    const meetup = await this.prisma.communityMeetup.findFirst({
      where: { id: meetupId, communityId, deletedAt: null },
      include: {
        creator: { select: { id: true, email: true } },
        participants: currentUserId
          ? {
              where: { userId: currentUserId },
              select: { id: true },
            }
          : false,
      },
    });

    if (!meetup) {
      throw new NotFoundException('Meetup not found');
    }

    const isParticipating = Array.isArray(meetup.participants) && meetup.participants.length > 0;
    return this.mapToResponseDto(meetup, meetup.creator, isParticipating);
  }

  /**
   * Update meetup details.
   * Authorized: Meetup Creator, Community OWNER, or platform ADMIN.
   */
  async update(
    communityId: string,
    meetupId: string,
    userId: string,
    userRoles: string[],
    dto: UpdateMeetupDto,
    _ipAddress?: string,
    _userAgent?: string,
  ): Promise<MeetupResponseDto> {
    const meetup = await this.prisma.communityMeetup.findFirst({
      where: { id: meetupId, communityId, deletedAt: null },
      include: { creator: { select: { id: true, email: true } } },
    });

    if (!meetup) {
      throw new NotFoundException('Meetup not found');
    }

    const isCreator = meetup.createdById === userId;
    const isAdmin = userRoles.includes('ADMIN');

    if (!isCreator && !isAdmin) {
      await this.authService.assertCanManageCommunity(userId, userRoles, communityId);
    }

    const updated = await this.prisma.communityMeetup.update({
      where: { id: meetupId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.startsAt !== undefined && { startsAt: new Date(dto.startsAt) }),
        ...(dto.endsAt !== undefined && { endsAt: dto.endsAt ? new Date(dto.endsAt) : null }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.mapUrl !== undefined && { mapUrl: dto.mapUrl }),
        ...(dto.participantLimit !== undefined && { participantLimit: dto.participantLimit }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
      include: { creator: { select: { id: true, email: true } } },
    });

    return this.mapToResponseDto(updated, updated.creator, true);
  }

  /**
   * Cancel a meetup.
   * Authorized: Meetup Creator, Community OWNER, or platform ADMIN.
   */
  async cancel(
    communityId: string,
    meetupId: string,
    userId: string,
    userRoles: string[],
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    const meetup = await this.prisma.communityMeetup.findFirst({
      where: { id: meetupId, communityId, deletedAt: null },
    });

    if (!meetup) {
      throw new NotFoundException('Meetup not found');
    }

    const isCreator = meetup.createdById === userId;
    const isAdmin = userRoles.includes('ADMIN');

    if (!isCreator && !isAdmin) {
      await this.authService.assertCanManageCommunity(userId, userRoles, communityId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.communityMeetup.update({
        where: { id: meetupId },
        data: { status: CommunityMeetupStatus.CANCELLED },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: COMMUNITY_OUTBOX_EVENTS.COMMUNITY_MEETUP_STATUS_UPDATED,
          aggregateType: 'COMMUNITY_MEETUP',
          aggregateId: meetupId,
          payload: { meetupId, communityId, status: CommunityMeetupStatus.CANCELLED },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          action: COMMUNITY_AUDIT_ACTIONS.MEETUP_CANCEL,
          resourceType: COMMUNITY_AUDIT_RESOURCES.COMMUNITY_MEETUP,
          resourceId: meetupId,
          ipAddress,
          userAgent,
          metadata: { communityId },
        },
      });
    });

    return { success: true, message: 'Meetup cancelled successfully' };
  }

  private mapToResponseDto(
    meetup: CommunityMeetup,
    creator?: { id: string; email: string },
    isParticipating?: boolean,
  ): MeetupResponseDto {
    return {
      id: meetup.id,
      communityId: meetup.communityId,
      eventId: meetup.eventId,
      createdById: meetup.createdById,
      title: meetup.title,
      description: meetup.description,
      startsAt: meetup.startsAt,
      endsAt: meetup.endsAt,
      location: meetup.location,
      mapUrl: meetup.mapUrl,
      participantLimit: meetup.participantLimit,
      participantCount: meetup.participantCount,
      isPinned: meetup.isPinned,
      status: meetup.status,
      createdAt: meetup.createdAt,
      updatedAt: meetup.updatedAt,
      creator,
      isParticipating,
    };
  }
}
