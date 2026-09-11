import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CommunityAuthorizationService } from './community-authorization.service';
import { CreateReplyDto } from '../dto/create-reply.dto';
import { ReplyResponseDto } from '../dto/reply-response.dto';
import { COMMUNITY_OUTBOX_EVENTS } from '../constants/communities.constants';
import { CommunityMemberRole, CommunityPostReply, CommunityPostStatus } from '@prisma/client';

@Injectable()
export class CommunityRepliesService {
  private readonly logger = new Logger(CommunityRepliesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: CommunityAuthorizationService,
  ) {}

  /**
   * Create a threaded reply to a post or another reply.
   * Only ACTIVE members can post replies.
   */
  async create(
    communityId: string,
    postId: string,
    authorId: string,
    dto: CreateReplyDto,
    _ipAddress?: string,
    _userAgent?: string,
  ): Promise<ReplyResponseDto> {
    const { member } = await this.authService.assertActiveMember(authorId, communityId);

    const post = await this.prisma.communityPost.findFirst({
      where: { id: postId, communityId, deletedAt: null },
    });

    if (!post) {
      throw new NotFoundException('Post not found in this community');
    }

    if (post.status !== CommunityPostStatus.PUBLISHED) {
      throw new BadRequestException('Cannot reply to an unpublished post');
    }

    // Verify parent reply if threaded
    if (dto.parentReplyId) {
      const parent = await this.prisma.communityPostReply.findFirst({
        where: { id: dto.parentReplyId, postId, deletedAt: null },
      });
      if (!parent) {
        throw new NotFoundException('Parent reply not found');
      }
    }

    const reply = await this.prisma.$transaction(async (tx) => {
      const r = await tx.communityPostReply.create({
        data: {
          postId,
          authorId,
          parentReplyId: dto.parentReplyId,
          content: dto.content,
          status: CommunityPostStatus.PUBLISHED,
          likeCount: 0,
        },
      });

      // Increment post reply count
      await tx.communityPost.update({
        where: { id: postId },
        data: { replyCount: { increment: 1 } },
      });

      // Handle mentions
      if (dto.mentionedUserIds && dto.mentionedUserIds.length > 0) {
        const uniqueMentionIds = Array.from(new Set(dto.mentionedUserIds)).filter(
          (id) => id !== authorId,
        );

        for (const targetUserId of uniqueMentionIds) {
          const targetUser = await tx.user.findUnique({
            where: { id: targetUserId },
            select: { id: true },
          });

          if (targetUser) {
            await tx.communityMention.create({
              data: {
                actorId: authorId,
                mentionedUserId: targetUserId,
                replyId: r.id,
              },
            });

            await tx.outboxEvent.create({
              data: {
                eventType: COMMUNITY_OUTBOX_EVENTS.COMMUNITY_MENTION_CREATED,
                aggregateType: 'COMMUNITY_MENTION',
                aggregateId: `${r.id}:${targetUserId}`,
                payload: {
                  communityId,
                  postId,
                  replyId: r.id,
                  actorId: authorId,
                  mentionedUserId: targetUserId,
                },
              },
            });
          }
        }
      }

      await tx.outboxEvent.create({
        data: {
          eventType: COMMUNITY_OUTBOX_EVENTS.COMMUNITY_POST_REPLY_CREATED,
          aggregateType: 'COMMUNITY_POST_REPLY',
          aggregateId: r.id,
          payload: {
            replyId: r.id,
            postId,
            communityId,
            authorId,
            parentReplyId: r.parentReplyId,
          },
        },
      });

      return r;
    });

    this.logger.log(`Created reply ${reply.id} on post ${postId} by user ${authorId}`);

    const author = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: { id: true, email: true },
    });

    return this.mapToResponseDto(
      reply,
      {
        id: author!.id,
        email: author!.email,
        communityRole: member.role,
      },
      false,
    );
  }

  /**
   * List all replies for a post, structured as a tree.
   */
  async findAll(
    communityId: string,
    postId: string,
    currentUserId?: string,
    currentUserRoles: string[] = [],
  ): Promise<ReplyResponseDto[]> {
    await this.authService.assertCanViewCommunity(communityId, currentUserId, currentUserRoles);

    const post = await this.prisma.communityPost.findFirst({
      where: { id: postId, communityId, deletedAt: null },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const replies = await this.prisma.communityPostReply.findMany({
      where: {
        postId,
        deletedAt: null,
        status: CommunityPostStatus.PUBLISHED,
      },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, email: true } },
        likes: currentUserId
          ? {
              where: { userId: currentUserId },
              select: { id: true },
            }
          : false,
      },
    });

    // Batch fetch member roles
    const authorIds = Array.from(new Set(replies.map((r) => r.authorId)));
    const memberships = await this.prisma.communityMember.findMany({
      where: {
        communityId,
        userId: { in: authorIds },
      },
      select: { userId: true, role: true },
    });
    const roleMap = new Map<string, CommunityMemberRole>(
      memberships.map((m) => [m.userId, m.role]),
    );

    // Build hierarchy
    const replyMap = new Map<string, ReplyResponseDto>();
    const rootReplies: ReplyResponseDto[] = [];

    for (const r of replies) {
      const likedByCurrentUser = Array.isArray(r.likes) && r.likes.length > 0;
      const dto = this.mapToResponseDto(
        r,
        {
          id: r.author.id,
          email: r.author.email,
          communityRole: roleMap.get(r.authorId) ?? null,
        },
        likedByCurrentUser,
      );
      dto.childReplies = [];
      replyMap.set(r.id, dto);
    }

    for (const r of replies) {
      const dto = replyMap.get(r.id)!;
      if (r.parentReplyId && replyMap.has(r.parentReplyId)) {
        replyMap.get(r.parentReplyId)!.childReplies!.push(dto);
      } else {
        rootReplies.push(dto);
      }
    }

    return rootReplies;
  }

  /**
   * Soft-delete a reply.
   * Authorized: Author, Community OWNER, MODERATOR, or platform ADMIN.
   */
  async delete(
    communityId: string,
    postId: string,
    replyId: string,
    userId: string,
    userRoles: string[],
  ): Promise<{ success: boolean; message: string }> {
    const reply = await this.prisma.communityPostReply.findFirst({
      where: { id: replyId, postId, deletedAt: null },
    });

    if (!reply) {
      throw new NotFoundException('Reply not found');
    }

    const isAuthor = reply.authorId === userId;
    if (!isAuthor) {
      await this.authService.assertCanModerateCommunity(userId, userRoles, communityId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.communityPostReply.update({
        where: { id: replyId },
        data: {
          deletedAt: new Date(),
          status: CommunityPostStatus.DELETED,
        },
      });

      await tx.communityPost.update({
        where: { id: postId },
        data: {
          replyCount: { decrement: 1 },
        },
      });
    });

    return { success: true, message: 'Reply deleted successfully' };
  }

  private mapToResponseDto(
    reply: CommunityPostReply,
    author?: { id: string; email: string; communityRole?: CommunityMemberRole | null },
    likedByCurrentUser?: boolean,
  ): ReplyResponseDto {
    return {
      id: reply.id,
      postId: reply.postId,
      authorId: reply.authorId,
      parentReplyId: reply.parentReplyId,
      content: reply.content,
      status: reply.status,
      likeCount: reply.likeCount,
      createdAt: reply.createdAt,
      updatedAt: reply.updatedAt,
      author,
      likedByCurrentUser,
    };
  }
}
