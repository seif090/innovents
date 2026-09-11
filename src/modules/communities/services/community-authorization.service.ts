import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import {
  Community,
  CommunityMember,
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityStatus,
  CommunityVisibility,
} from '@prisma/client';

@Injectable()
export class CommunityAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Asserts whether a user is authorized to view a community.
   * Public communities in ACTIVE status are accessible to anyone.
   * Private communities or non-active communities return HTTP 404 to unauthorized users
   * to strictly prevent enumeration attacks.
   */
  async assertCanViewCommunity(
    communityId: string,
    userId?: string,
    userRoles: string[] = [],
  ): Promise<Community> {
    const community = await this.prisma.community.findFirst({
      where: { id: communityId, deletedAt: null },
    });

    if (!community) {
      throw new NotFoundException('Community not found');
    }

    // Public active communities are viewable by anyone
    if (
      community.visibility === CommunityVisibility.PUBLIC &&
      community.status === CommunityStatus.ACTIVE
    ) {
      return community;
    }

    // Private or suspended communities require membership, creator, or admin access
    if (!userId) {
      throw new NotFoundException('Community not found');
    }

    if (userRoles.includes('ADMIN') || community.createdById === userId) {
      return community;
    }

    const membership = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId,
        },
      },
    });

    if (membership && membership.status === CommunityMemberStatus.ACTIVE) {
      return community;
    }

    // Anti-enumeration: return 404 rather than 403
    throw new NotFoundException('Community not found');
  }

  /**
   * Asserts that a user has ownership/management authorization over a community.
   * Authorized:
   * - Platform ADMIN
   * - Community Creator / Owner
   */
  async assertCanManageCommunity(
    userId: string,
    userRoles: string[],
    communityId: string,
  ): Promise<Community> {
    const community = await this.prisma.community.findFirst({
      where: { id: communityId, deletedAt: null },
    });

    if (!community) {
      throw new NotFoundException('Community not found');
    }

    if (userRoles.includes('ADMIN') || community.createdById === userId) {
      return community;
    }

    throw new ForbiddenException('You do not have permission to manage this community');
  }

  /**
   * Asserts that a user has moderation authority over a community.
   * Authorized:
   * - Platform ADMIN
   * - Community Creator / Owner
   * - Community Member with role MODERATOR (in ACTIVE status)
   */
  async assertCanModerateCommunity(
    userId: string,
    userRoles: string[],
    communityId: string,
  ): Promise<{ community: Community; role: CommunityMemberRole }> {
    const community = await this.prisma.community.findFirst({
      where: { id: communityId, deletedAt: null },
    });

    if (!community) {
      throw new NotFoundException('Community not found');
    }

    if (userRoles.includes('ADMIN') || community.createdById === userId) {
      return { community, role: CommunityMemberRole.OWNER };
    }

    const member = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId,
        },
      },
    });

    if (
      member &&
      member.status === CommunityMemberStatus.ACTIVE &&
      member.role === CommunityMemberRole.MODERATOR
    ) {
      return { community, role: CommunityMemberRole.MODERATOR };
    }

    throw new ForbiddenException('You do not have moderation privileges in this community');
  }

  /**
   * Asserts that a user is an ACTIVE member of a community.
   * Required for posting, replying, liking, creating meetups, and real-time chat.
   */
  async assertActiveMember(
    userId: string,
    communityId: string,
  ): Promise<{ community: Community; member: CommunityMember }> {
    const community = await this.prisma.community.findFirst({
      where: { id: communityId, deletedAt: null },
    });

    if (!community) {
      throw new NotFoundException('Community not found');
    }

    const member = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId,
        },
      },
    });

    if (!member || member.status !== CommunityMemberStatus.ACTIVE) {
      throw new ForbiddenException(
        'You must be an active member of this community to perform this action',
      );
    }

    return { community, member };
  }
}
