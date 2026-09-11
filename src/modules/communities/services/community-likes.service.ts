import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CommunityAuthorizationService } from './community-authorization.service';
import { COMMUNITY_OUTBOX_EVENTS } from '../constants/communities.constants';

@Injectable()
export class CommunityLikesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: CommunityAuthorizationService,
  ) {}

  /**
   * Toggle like on a Community Post.
   * Only ACTIVE members can like posts.
   */
  async togglePostLike(
    communityId: string,
    postId: string,
    userId: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    await this.authService.assertActiveMember(userId, communityId);

    const post = await this.prisma.communityPost.findFirst({
      where: { id: postId, communityId, deletedAt: null },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.communityPostLike.findUnique({
        where: {
          postId_userId: {
            postId,
            userId,
          },
        },
      });

      if (existing) {
        // Unlike
        await tx.communityPostLike.delete({
          where: { id: existing.id },
        });

        const updated = await tx.communityPost.update({
          where: { id: postId },
          data: { likeCount: { decrement: 1 } },
          select: { likeCount: true },
        });

        await tx.outboxEvent.create({
          data: {
            eventType: COMMUNITY_OUTBOX_EVENTS.COMMUNITY_POST_UNLIKED,
            aggregateType: 'COMMUNITY_POST_LIKE',
            aggregateId: `${postId}:${userId}`,
            payload: { communityId, postId, userId },
          },
        });

        return { liked: false, likeCount: Math.max(0, updated.likeCount) };
      } else {
        // Like
        await tx.communityPostLike.create({
          data: {
            postId,
            userId,
          },
        });

        const updated = await tx.communityPost.update({
          where: { id: postId },
          data: { likeCount: { increment: 1 } },
          select: { likeCount: true },
        });

        await tx.outboxEvent.create({
          data: {
            eventType: COMMUNITY_OUTBOX_EVENTS.COMMUNITY_POST_LIKED,
            aggregateType: 'COMMUNITY_POST_LIKE',
            aggregateId: `${postId}:${userId}`,
            payload: { communityId, postId, userId },
          },
        });

        return { liked: true, likeCount: updated.likeCount };
      }
    });
  }

  /**
   * Toggle like on a Community Post Reply.
   * Only ACTIVE members can like replies.
   */
  async toggleReplyLike(
    communityId: string,
    postId: string,
    replyId: string,
    userId: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    await this.authService.assertActiveMember(userId, communityId);

    const reply = await this.prisma.communityPostReply.findFirst({
      where: { id: replyId, postId, deletedAt: null },
    });

    if (!reply) {
      throw new NotFoundException('Reply not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.communityReplyLike.findUnique({
        where: {
          replyId_userId: {
            replyId,
            userId,
          },
        },
      });

      if (existing) {
        // Unlike
        await tx.communityReplyLike.delete({
          where: { id: existing.id },
        });

        const updated = await tx.communityPostReply.update({
          where: { id: replyId },
          data: { likeCount: { decrement: 1 } },
          select: { likeCount: true },
        });

        return { liked: false, likeCount: Math.max(0, updated.likeCount) };
      } else {
        // Like
        await tx.communityReplyLike.create({
          data: {
            replyId,
            userId,
          },
        });

        const updated = await tx.communityPostReply.update({
          where: { id: replyId },
          data: { likeCount: { increment: 1 } },
          select: { likeCount: true },
        });

        return { liked: true, likeCount: updated.likeCount };
      }
    });
  }
}
