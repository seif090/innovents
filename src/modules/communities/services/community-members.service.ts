import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CommunityAuthorizationService } from './community-authorization.service';
import { CommunityMemberQueryDto } from '../dto/community-member-query.dto';
import { CommunityMemberResponseDto } from '../dto/community-member-response.dto';
import { UpdateMemberRoleDto } from '../dto/update-member-role.dto';
import {
  COMMUNITY_AUDIT_ACTIONS,
  COMMUNITY_AUDIT_RESOURCES,
  COMMUNITY_OUTBOX_EVENTS,
} from '../constants/communities.constants';
import {
  AccountStatus,
  CommunityMember,
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityStatus,
  CommunitySponsorshipStatus,
  CommunityVisibility,
  Prisma,
} from '@prisma/client';

@Injectable()
export class CommunityMembersService {
  private readonly logger = new Logger(CommunityMembersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: CommunityAuthorizationService,
  ) {}

  /**
   * Join a community.
   * Concurrency-safe: acquires an exclusive row lock (FOR UPDATE) to strictly enforce memberCapacity.
   */
  async join(
    userId: string,
    communityId: string,
    userRoles: string[] = [],
    ipAddress?: string,
    userAgent?: string,
  ): Promise<CommunityMemberResponseDto> {
    // 1. Verify user is active
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Only active users can join communities');
    }

    // 2. Interactive transaction with row-level locking
    const member = await this.prisma.$transaction(async (tx) => {
      // Row-level lock on the Community
      const lockedCommunities = await tx.$queryRaw<
        Array<{
          id: string;
          status: CommunityStatus;
          visibility: CommunityVisibility;
          member_capacity: number;
          member_count: number;
        }>
      >(
        Prisma.sql`SELECT id, status, visibility, member_capacity, member_count FROM communities WHERE id = ${communityId}::uuid AND deleted_at IS NULL FOR UPDATE`,
      );

      const lockedComm =
        lockedCommunities && lockedCommunities.length > 0 ? lockedCommunities[0] : null;

      if (!lockedComm) {
        throw new NotFoundException('Community not found');
      }

      if (lockedComm.status !== CommunityStatus.ACTIVE) {
        throw new ConflictException('Community is not active');
      }

      // Check visibility
      if (lockedComm.visibility === CommunityVisibility.PRIVATE && !userRoles.includes('ADMIN')) {
        throw new ForbiddenException('Private communities require an invitation to join');
      }

      // Check existing membership
      const existing = await tx.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId,
            userId,
          },
        },
      });

      if (existing) {
        if (existing.status === CommunityMemberStatus.ACTIVE) {
          throw new ConflictException('You are already an active member of this community');
        }
        if (existing.status === CommunityMemberStatus.BANNED) {
          throw new ConflictException('You have been banned from this community');
        }
      }

      // Enforce capacity constraint with dynamic query-level sponsorship validity
      const now = new Date();
      const activeSponsorship = tx.communitySponsorship
        ? await tx.communitySponsorship.findFirst({
            where: {
              communityId,
              status: CommunitySponsorshipStatus.ACTIVE,
              endsAt: { gt: now },
            },
          })
        : null;

      const effectiveCapacity = activeSponsorship ? activeSponsorship.sponsoredCapacity : 20;

      if (lockedComm.member_count >= effectiveCapacity) {
        throw new ConflictException('Community has reached its maximum member capacity');
      }

      let savedMember: CommunityMember;

      if (existing && existing.status === CommunityMemberStatus.LEFT) {
        // Reactivate membership
        savedMember = await tx.communityMember.update({
          where: { id: existing.id },
          data: {
            status: CommunityMemberStatus.ACTIVE,
            leftAt: null,
            joinedAt: new Date(),
          },
        });
      } else {
        // Insert new member
        savedMember = await tx.communityMember.create({
          data: {
            communityId,
            userId,
            role: CommunityMemberRole.MEMBER,
            status: CommunityMemberStatus.ACTIVE,
          },
        });
      }

      // Increment community memberCount
      await tx.community.update({
        where: { id: communityId },
        data: {
          memberCount: { increment: 1 },
        },
      });

      // Outbox event
      await tx.outboxEvent.create({
        data: {
          eventType: COMMUNITY_OUTBOX_EVENTS.COMMUNITY_MEMBER_JOINED,
          aggregateType: 'COMMUNITY_MEMBER',
          aggregateId: savedMember.id,
          payload: {
            communityId,
            userId,
            memberId: savedMember.id,
          },
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          action: COMMUNITY_AUDIT_ACTIONS.MEMBER_JOIN,
          resourceType: COMMUNITY_AUDIT_RESOURCES.COMMUNITY_MEMBER,
          resourceId: savedMember.id,
          ipAddress,
          userAgent,
          metadata: { communityId },
        },
      });

      return savedMember;
    });

    this.logger.log(`User ${userId} joined community ${communityId}`);

    return this.mapToResponseDto(member, { id: user.id, email: user.email });
  }

  /**
   * Leave a community.
   * Community Owner cannot leave without transferring ownership or archiving.
   */
  async leave(
    userId: string,
    communityId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    const existing = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId,
        },
      },
    });

    if (!existing || existing.status !== CommunityMemberStatus.ACTIVE) {
      throw new NotFoundException('Active membership not found');
    }

    if (existing.role === CommunityMemberRole.OWNER) {
      throw new BadRequestException(
        'Community owner cannot leave without transferring ownership or deleting the community',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.communityMember.update({
        where: { id: existing.id },
        data: {
          status: CommunityMemberStatus.LEFT,
          leftAt: new Date(),
        },
      });

      await tx.community.update({
        where: { id: communityId },
        data: {
          memberCount: { decrement: 1 },
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: COMMUNITY_OUTBOX_EVENTS.COMMUNITY_MEMBER_LEFT,
          aggregateType: 'COMMUNITY_MEMBER',
          aggregateId: existing.id,
          payload: {
            communityId,
            userId,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          action: COMMUNITY_AUDIT_ACTIONS.MEMBER_LEAVE,
          resourceType: COMMUNITY_AUDIT_RESOURCES.COMMUNITY_MEMBER,
          resourceId: existing.id,
          ipAddress,
          userAgent,
          metadata: { communityId },
        },
      });
    });

    return { success: true, message: 'Successfully left the community' };
  }

  /**
   * List members of a community with pagination.
   */
  async findAll(
    communityId: string,
    query: CommunityMemberQueryDto,
    currentUserId?: string,
    currentUserRoles: string[] = [],
  ): Promise<{
    data: CommunityMemberResponseDto[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    await this.authService.assertCanViewCommunity(communityId, currentUserId, currentUserRoles);

    const { page = 1, pageSize = 20, role, status = CommunityMemberStatus.ACTIVE } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.CommunityMemberWhereInput = {
      communityId,
      ...(role && { role }),
      ...(status && { status }),
    };

    const [members, total] = await Promise.all([
      this.prisma.communityMember.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
        include: {
          user: {
            select: { id: true, email: true },
          },
        },
      }),
      this.prisma.communityMember.count({ where }),
    ]);

    return {
      data: members.map((m) => this.mapToResponseDto(m, m.user)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  /**
   * Update member role (e.g. designate as SPEAKER or MODERATOR).
   * Authorized: Community OWNER or platform ADMIN.
   */
  async updateRole(
    communityId: string,
    targetUserId: string,
    operatorUserId: string,
    operatorRoles: string[],
    dto: UpdateMemberRoleDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<CommunityMemberResponseDto> {
    await this.authService.assertCanManageCommunity(operatorUserId, operatorRoles, communityId);

    if (targetUserId === operatorUserId) {
      throw new BadRequestException('Cannot modify your own owner role directly');
    }

    const targetMember = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId: targetUserId,
        },
      },
      include: {
        user: { select: { id: true, email: true } },
      },
    });

    if (!targetMember || targetMember.status !== CommunityMemberStatus.ACTIVE) {
      throw new NotFoundException('Active member not found');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const m = await tx.communityMember.update({
        where: { id: targetMember.id },
        data: { role: dto.role },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: COMMUNITY_OUTBOX_EVENTS.COMMUNITY_MEMBER_ROLE_UPDATED,
          aggregateType: 'COMMUNITY_MEMBER',
          aggregateId: m.id,
          payload: {
            communityId,
            targetUserId,
            newRole: dto.role,
            updatedBy: operatorUserId,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: operatorUserId,
          action: COMMUNITY_AUDIT_ACTIONS.MEMBER_ROLE_UPDATE,
          resourceType: COMMUNITY_AUDIT_RESOURCES.COMMUNITY_MEMBER,
          resourceId: m.id,
          ipAddress,
          userAgent,
          metadata: { newRole: dto.role },
        },
      });

      return m;
    });

    return this.mapToResponseDto(updated, targetMember.user);
  }

  /**
   * Ban a member from the community.
   * Authorized: Community OWNER, MODERATOR, or platform ADMIN.
   */
  async banMember(
    communityId: string,
    targetUserId: string,
    operatorUserId: string,
    operatorRoles: string[],
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    const { role: operatorRole } = await this.authService.assertCanModerateCommunity(
      operatorUserId,
      operatorRoles,
      communityId,
    );

    if (targetUserId === operatorUserId) {
      throw new BadRequestException('You cannot ban yourself');
    }

    const targetMember = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId: targetUserId,
        },
      },
    });

    if (!targetMember) {
      throw new NotFoundException('Community member not found');
    }

    // Owner cannot be banned
    if (targetMember.role === CommunityMemberRole.OWNER) {
      throw new ForbiddenException('The community owner cannot be banned');
    }

    // Moderator cannot ban another moderator unless operator is OWNER or ADMIN
    if (
      targetMember.role === CommunityMemberRole.MODERATOR &&
      operatorRole === CommunityMemberRole.MODERATOR &&
      !operatorRoles.includes('ADMIN')
    ) {
      throw new ForbiddenException('Moderators cannot ban fellow moderators');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.communityMember.update({
        where: { id: targetMember.id },
        data: {
          status: CommunityMemberStatus.BANNED,
          bannedAt: new Date(),
          bannedBy: operatorUserId,
        },
      });

      // Decrement active member count if member was ACTIVE
      if (targetMember.status === CommunityMemberStatus.ACTIVE) {
        await tx.community.update({
          where: { id: communityId },
          data: {
            memberCount: { decrement: 1 },
          },
        });
      }

      await tx.outboxEvent.create({
        data: {
          eventType: COMMUNITY_OUTBOX_EVENTS.COMMUNITY_MEMBER_BANNED,
          aggregateType: 'COMMUNITY_MEMBER',
          aggregateId: targetMember.id,
          payload: {
            communityId,
            targetUserId,
            bannedBy: operatorUserId,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: operatorUserId,
          action: COMMUNITY_AUDIT_ACTIONS.MEMBER_BAN,
          resourceType: COMMUNITY_AUDIT_RESOURCES.COMMUNITY_MEMBER,
          resourceId: targetMember.id,
          ipAddress,
          userAgent,
          metadata: { targetUserId, communityId },
        },
      });
    });

    return { success: true, message: 'Member has been banned from the community' };
  }

  /**
   * Unban a member from the community.
   * Authorized: Community OWNER, MODERATOR, or platform ADMIN.
   */
  async unbanMember(
    communityId: string,
    targetUserId: string,
    operatorUserId: string,
    operatorRoles: string[],
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.authService.assertCanModerateCommunity(operatorUserId, operatorRoles, communityId);

    const targetMember = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId: targetUserId,
        },
      },
    });

    if (!targetMember || targetMember.status !== CommunityMemberStatus.BANNED) {
      throw new NotFoundException('Banned member record not found');
    }

    await this.prisma.$transaction(async (tx) => {
      // Transition to LEFT so they may rejoin voluntarily subject to member capacity
      await tx.communityMember.update({
        where: { id: targetMember.id },
        data: {
          status: CommunityMemberStatus.LEFT,
          bannedAt: null,
          bannedBy: null,
          leftAt: new Date(),
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: COMMUNITY_OUTBOX_EVENTS.COMMUNITY_MEMBER_UNBANNED,
          aggregateType: 'COMMUNITY_MEMBER',
          aggregateId: targetMember.id,
          payload: {
            communityId,
            targetUserId,
            unbannedBy: operatorUserId,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: operatorUserId,
          action: COMMUNITY_AUDIT_ACTIONS.MEMBER_UNBAN,
          resourceType: COMMUNITY_AUDIT_RESOURCES.COMMUNITY_MEMBER,
          resourceId: targetMember.id,
          ipAddress,
          userAgent,
          metadata: { targetUserId, communityId },
        },
      });
    });

    return { success: true, message: 'Member ban has been lifted' };
  }

  private mapToResponseDto(
    member: CommunityMember,
    user?: { id: string; email: string },
  ): CommunityMemberResponseDto {
    return {
      id: member.id,
      communityId: member.communityId,
      userId: member.userId,
      role: member.role,
      status: member.status,
      joinedAt: member.joinedAt,
      leftAt: member.leftAt,
      bannedAt: member.bannedAt,
      user,
    };
  }
}
