import { Injectable, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CommunityAuthorizationService } from './community-authorization.service';
import { CreateCommunityDto } from '../dto/create-community.dto';
import { UpdateCommunityDto } from '../dto/update-community.dto';
import { CommunityQueryDto } from '../dto/community-query.dto';
import { CommunityResponseDto } from '../dto/community-response.dto';
import {
  COMMUNITY_AUDIT_ACTIONS,
  COMMUNITY_AUDIT_RESOURCES,
  COMMUNITY_LIMITS,
  COMMUNITY_OUTBOX_EVENTS,
} from '../constants/communities.constants';
import {
  AccountStatus,
  Community,
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityStatus,
  CommunityType,
  CommunityVisibility,
  Prisma,
} from '@prisma/client';

@Injectable()
export class CommunitiesService {
  private readonly logger = new Logger(CommunitiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: CommunityAuthorizationService,
  ) {}

  /**
   * Create a new Community.
   * - FREE: Any ACTIVE registered attendee (capped at 20 members)
   * - SPONSORED: Requires SPONSOR or ADMIN role (configurable capacity, sponsored badge)
   */
  async create(
    userId: string,
    userRoles: string[],
    dto: CreateCommunityDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<CommunityResponseDto> {
    // 1. Verify creator is active
    const creator = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!creator || creator.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Only active users can create communities');
    }

    // 2. Verify target event exists
    const event = await this.prisma.event.findFirst({
      where: { id: dto.eventId, deletedAt: null },
    });
    if (!event) {
      throw new NotFoundException('Target event not found');
    }

    // 3. Enforce role requirements for SPONSORED communities
    const isSponsoredType = dto.type === CommunityType.SPONSORED;
    if (isSponsoredType) {
      const isSponsorOrAdmin = userRoles.includes('SPONSOR') || userRoles.includes('ADMIN');
      if (!isSponsorOrAdmin) {
        throw new ForbiddenException(
          'Only users with role SPONSOR or ADMIN can create sponsored communities',
        );
      }
    }

    // 4. Calculate member capacity
    const memberCapacity = isSponsoredType
      ? (dto.memberCapacity ?? COMMUNITY_LIMITS.DEFAULT_SPONSORED_CAPACITY)
      : COMMUNITY_LIMITS.FREE_COMMUNITY_MAX_MEMBERS;

    const isPinned = isSponsoredType;
    const isSponsored = isSponsoredType;

    // 5. Atomic transaction: create community + owner membership + outbox + audit
    const result = await this.prisma.$transaction(async (tx) => {
      const community = await tx.community.create({
        data: {
          eventId: dto.eventId,
          createdById: userId,
          name: dto.name,
          bio: dto.bio,
          description: dto.description,
          category: dto.category,
          type: dto.type ?? CommunityType.FREE,
          visibility: dto.visibility ?? CommunityVisibility.PUBLIC,
          status: CommunityStatus.ACTIVE,
          coverImageUrl: dto.coverImageUrl,
          language: dto.language,
          memberCapacity,
          memberCount: 1, // Creator is the first member
          isSponsored,
          isPinned,
        },
      });

      // Create owner membership
      await tx.communityMember.create({
        data: {
          communityId: community.id,
          userId,
          role: CommunityMemberRole.OWNER,
          status: CommunityMemberStatus.ACTIVE,
        },
      });

      // Outbox event
      await tx.outboxEvent.create({
        data: {
          eventType: COMMUNITY_OUTBOX_EVENTS.COMMUNITY_CREATED,
          aggregateType: 'COMMUNITY',
          aggregateId: community.id,
          payload: {
            communityId: community.id,
            eventId: community.eventId,
            createdById: userId,
            type: community.type,
            name: community.name,
            visibility: community.visibility,
          },
        },
      });

      // Structured audit
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          action: COMMUNITY_AUDIT_ACTIONS.COMMUNITY_CREATE,
          resourceType: COMMUNITY_AUDIT_RESOURCES.COMMUNITY,
          resourceId: community.id,
          ipAddress,
          userAgent,
          metadata: {
            eventId: community.eventId,
            type: community.type,
            name: community.name,
            visibility: community.visibility,
          },
        },
      });

      return community;
    });

    this.logger.log(`Created community ${result.id} for event ${result.eventId} by user ${userId}`);

    return this.mapToResponseDto(
      result,
      {
        id: creator.id,
        email: creator.email,
      },
      CommunityMemberRole.OWNER,
      true,
    );
  }

  /**
   * Search and filter communities with pagination.
   * Public discovery respects visibility and anti-enumeration.
   */
  async findAll(
    query: CommunityQueryDto,
    currentUserId?: string,
    currentUserRoles: string[] = [],
  ): Promise<{
    data: CommunityResponseDto[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const { page = 1, pageSize = 20, eventId, category, type, visibility, search, status } = query;
    const skip = (page - 1) * pageSize;
    const isAdmin = currentUserRoles.includes('ADMIN');

    const where: Prisma.CommunityWhereInput = {
      deletedAt: null,
    };

    if (eventId) {
      where.eventId = eventId;
    }

    if (category) {
      where.category = { contains: category, mode: 'insensitive' };
    }

    if (type) {
      where.type = type;
    }

    if (status && isAdmin) {
      where.status = status;
    } else {
      where.status = CommunityStatus.ACTIVE;
    }

    // Visibility rules:
    // Non-admins only see PUBLIC communities, OR PRIVATE communities where they are active members
    if (!isAdmin) {
      if (currentUserId) {
        where.OR = [
          { visibility: CommunityVisibility.PUBLIC },
          {
            visibility: CommunityVisibility.PRIVATE,
            members: {
              some: {
                userId: currentUserId,
                status: CommunityMemberStatus.ACTIVE,
              },
            },
          },
        ];
      } else {
        where.visibility = CommunityVisibility.PUBLIC;
      }
    } else if (visibility) {
      where.visibility = visibility;
    }

    if (search) {
      where.AND = [
        {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { bio: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [communities, total] = await Promise.all([
      this.prisma.community.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        include: {
          creator: {
            select: {
              id: true,
              email: true,
            },
          },
          members: currentUserId
            ? {
                where: {
                  userId: currentUserId,
                  status: CommunityMemberStatus.ACTIVE,
                },
                select: {
                  role: true,
                },
              }
            : false,
        },
      }),
      this.prisma.community.count({ where }),
    ]);

    const data = communities.map((comm) => {
      const activeMembership = comm.members && comm.members.length > 0 ? comm.members[0] : null;
      return this.mapToResponseDto(
        comm,
        comm.creator,
        activeMembership?.role ?? null,
        !!activeMembership,
      );
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
   * Find a single community by ID.
   * Anti-enumeration: private/suspended communities return 404 to unauthorized users.
   */
  async findOne(
    communityId: string,
    currentUserId?: string,
    currentUserRoles: string[] = [],
  ): Promise<CommunityResponseDto> {
    const community = await this.authService.assertCanViewCommunity(
      communityId,
      currentUserId,
      currentUserRoles,
    );

    const [creator, membership] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: community.createdById },
        select: { id: true, email: true },
      }),
      currentUserId
        ? this.prisma.communityMember.findUnique({
            where: {
              communityId_userId: {
                communityId,
                userId: currentUserId,
              },
            },
            select: { role: true, status: true },
          })
        : null,
    ]);

    const isMember = membership?.status === CommunityMemberStatus.ACTIVE;
    const currentUserRole = isMember ? (membership?.role ?? null) : null;

    return this.mapToResponseDto(community, creator ?? undefined, currentUserRole, isMember);
  }

  /**
   * Update Community details.
   * Authorized: Community Creator or ADMIN.
   */
  async update(
    communityId: string,
    userId: string,
    userRoles: string[],
    dto: UpdateCommunityDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<CommunityResponseDto> {
    const community = await this.authService.assertCanManageCommunity(
      userId,
      userRoles,
      communityId,
    );

    // If community is FREE, do not allow expanding capacity beyond 20
    let memberCapacity = dto.memberCapacity;
    if (community.type === CommunityType.FREE) {
      if (
        memberCapacity !== undefined &&
        memberCapacity > COMMUNITY_LIMITS.FREE_COMMUNITY_MAX_MEMBERS
      ) {
        throw new ForbiddenException('Free communities cannot have more than 20 member capacity');
      }
      memberCapacity = COMMUNITY_LIMITS.FREE_COMMUNITY_MAX_MEMBERS;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const comm = await tx.community.update({
        where: { id: communityId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.bio !== undefined && { bio: dto.bio }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.category !== undefined && { category: dto.category }),
          ...(dto.visibility !== undefined && { visibility: dto.visibility }),
          ...(dto.coverImageUrl !== undefined && { coverImageUrl: dto.coverImageUrl }),
          ...(dto.language !== undefined && { language: dto.language }),
          ...(memberCapacity !== undefined && { memberCapacity }),
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: COMMUNITY_OUTBOX_EVENTS.COMMUNITY_UPDATED,
          aggregateType: 'COMMUNITY',
          aggregateId: comm.id,
          payload: {
            communityId: comm.id,
            updatedBy: userId,
            changes: JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          action: COMMUNITY_AUDIT_ACTIONS.COMMUNITY_UPDATE,
          resourceType: COMMUNITY_AUDIT_RESOURCES.COMMUNITY,
          resourceId: comm.id,
          ipAddress,
          userAgent,
          metadata: { changes: JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue },
        },
      });

      return comm;
    });

    const creator = await this.prisma.user.findUnique({
      where: { id: updated.createdById },
      select: { id: true, email: true },
    });

    return this.mapToResponseDto(updated, creator ?? undefined, CommunityMemberRole.OWNER, true);
  }

  /**
   * Delete (archive) a community.
   * Authorized: Community Creator or ADMIN.
   */
  async delete(
    communityId: string,
    userId: string,
    userRoles: string[],
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    const community = await this.authService.assertCanManageCommunity(
      userId,
      userRoles,
      communityId,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.community.update({
        where: { id: communityId },
        data: {
          deletedAt: new Date(),
          status: CommunityStatus.ARCHIVED,
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: COMMUNITY_OUTBOX_EVENTS.COMMUNITY_DELETED,
          aggregateType: 'COMMUNITY',
          aggregateId: communityId,
          payload: {
            communityId,
            deletedBy: userId,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          action: COMMUNITY_AUDIT_ACTIONS.COMMUNITY_DELETE,
          resourceType: COMMUNITY_AUDIT_RESOURCES.COMMUNITY,
          resourceId: communityId,
          ipAddress,
          userAgent,
          metadata: { name: community.name },
        },
      });
    });

    return {
      success: true,
      message: 'Community archived successfully',
    };
  }

  private mapToResponseDto(
    comm: Community,
    creator?: { id: string; email: string },
    currentUserRole?: CommunityMemberRole | null,
    isMember?: boolean,
  ): CommunityResponseDto {
    return {
      id: comm.id,
      eventId: comm.eventId,
      createdById: comm.createdById,
      name: comm.name,
      bio: comm.bio,
      description: comm.description,
      category: comm.category,
      type: comm.type,
      visibility: comm.visibility,
      status: comm.status,
      coverImageUrl: comm.coverImageUrl,
      language: comm.language,
      memberCapacity: comm.memberCapacity,
      memberCount: comm.memberCount,
      isSponsored: comm.isSponsored,
      isPinned: comm.isPinned,
      createdAt: comm.createdAt,
      updatedAt: comm.updatedAt,
      creator,
      currentUserRole,
      isMember,
    };
  }
}
