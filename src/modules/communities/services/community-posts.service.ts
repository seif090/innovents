import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CommunityAuthorizationService } from './community-authorization.service';
import { CreatePostDto } from '../dto/create-post.dto';
import { UpdatePostDto } from '../dto/update-post.dto';
import { PostQueryDto } from '../dto/post-query.dto';
import { PostResponseDto } from '../dto/post-response.dto';
import {
  COMMUNITY_AUDIT_ACTIONS,
  COMMUNITY_AUDIT_RESOURCES,
  COMMUNITY_OUTBOX_EVENTS,
} from '../constants/communities.constants';
import { CommunityMemberRole, CommunityPost, CommunityPostStatus, Prisma } from '@prisma/client';

@Injectable()
export class CommunityPostsService {
  private readonly logger = new Logger(CommunityPostsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: CommunityAuthorizationService,
  ) {}

  /**
   * Create a post inside a community.
   * Only ACTIVE members of the community can publish posts.
   */
  async create(
    communityId: string,
    authorId: string,
    dto: CreatePostDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<PostResponseDto> {
    const { member } = await this.authService.assertActiveMember(authorId, communityId);

    const post = await this.prisma.$transaction(async (tx) => {
      const p = await tx.communityPost.create({
        data: {
          communityId,
          authorId,
          content: dto.content,
          attachments: dto.attachments ?? [],
          linkUrl: dto.linkUrl,
          isPinned: false,
          status: CommunityPostStatus.PUBLISHED,
          likeCount: 0,
          replyCount: 0,
        },
      });

      // Handle explicit mentions
      if (dto.mentionedUserIds && dto.mentionedUserIds.length > 0) {
        const uniqueMentionIds = Array.from(new Set(dto.mentionedUserIds)).filter(
          (id) => id !== authorId,
        );

        for (const targetUserId of uniqueMentionIds) {
          // Check if target user exists
          const targetUser = await tx.user.findUnique({
            where: { id: targetUserId },
            select: { id: true },
          });

          if (targetUser) {
            await tx.communityMention.create({
              data: {
                actorId: authorId,
                mentionedUserId: targetUserId,
                postId: p.id,
              },
            });

            await tx.outboxEvent.create({
              data: {
                eventType: COMMUNITY_OUTBOX_EVENTS.COMMUNITY_MENTION_CREATED,
                aggregateType: 'COMMUNITY_MENTION',
                aggregateId: `${p.id}:${targetUserId}`,
                payload: {
                  communityId,
                  postId: p.id,
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
          eventType: COMMUNITY_OUTBOX_EVENTS.COMMUNITY_POST_CREATED,
          aggregateType: 'COMMUNITY_POST',
          aggregateId: p.id,
          payload: {
            postId: p.id,
            communityId,
            authorId,
            contentLength: p.content.length,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: authorId,
          action: COMMUNITY_AUDIT_ACTIONS.POST_CREATE,
          resourceType: COMMUNITY_AUDIT_RESOURCES.COMMUNITY_POST,
          resourceId: p.id,
          ipAddress,
          userAgent,
          metadata: { communityId },
        },
      });

      return p;
    });

    this.logger.log(`Created post ${post.id} in community ${communityId} by author ${authorId}`);

    const author = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: { id: true, email: true },
    });

    return this.mapToResponseDto(
      post,
      {
        id: author!.id,
        email: author!.email,
        communityRole: member.role,
      },
      false,
    );
  }

  /**
   * Search/list posts in a community with pagination.
   */
  async findAll(
    communityId: string,
    query: PostQueryDto,
    currentUserId?: string,
    currentUserRoles: string[] = [],
  ): Promise<{
    data: PostResponseDto[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    await this.authService.assertCanViewCommunity(communityId, currentUserId, currentUserRoles);

    const { page = 1, pageSize = 20, isPinned } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.CommunityPostWhereInput = {
      communityId,
      deletedAt: null,
      status: CommunityPostStatus.PUBLISHED,
      ...(isPinned !== undefined && { isPinned }),
    };

    const [posts, total] = await Promise.all([
      this.prisma.communityPost.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        include: {
          author: {
            select: { id: true, email: true },
          },
          likes: currentUserId
            ? {
                where: { userId: currentUserId },
                select: { id: true },
              }
            : false,
        },
      }),
      this.prisma.communityPost.count({ where }),
    ]);

    // Batch fetch member roles for authors
    const authorIds = Array.from(new Set(posts.map((p) => p.authorId)));
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

    const data = posts.map((post) => {
      const likedByCurrentUser = Array.isArray(post.likes) && post.likes.length > 0;
      return this.mapToResponseDto(
        post,
        {
          id: post.author.id,
          email: post.author.email,
          communityRole: roleMap.get(post.authorId) ?? null,
        },
        likedByCurrentUser,
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
   * Find a single post by ID.
   */
  async findOne(
    communityId: string,
    postId: string,
    currentUserId?: string,
    currentUserRoles: string[] = [],
  ): Promise<PostResponseDto> {
    await this.authService.assertCanViewCommunity(communityId, currentUserId, currentUserRoles);

    const post = await this.prisma.communityPost.findFirst({
      where: {
        id: postId,
        communityId,
        deletedAt: null,
      },
      include: {
        author: {
          select: { id: true, email: true },
        },
        likes: currentUserId
          ? {
              where: { userId: currentUserId },
              select: { id: true },
            }
          : false,
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const membership = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId: post.authorId,
        },
      },
      select: { role: true },
    });

    const likedByCurrentUser = Array.isArray(post.likes) && post.likes.length > 0;

    return this.mapToResponseDto(
      post,
      {
        id: post.author.id,
        email: post.author.email,
        communityRole: membership?.role ?? null,
      },
      likedByCurrentUser,
    );
  }

  /**
   * Update a post.
   * Authorized: Author or platform ADMIN.
   */
  async update(
    communityId: string,
    postId: string,
    userId: string,
    userRoles: string[],
    dto: UpdatePostDto,
  ): Promise<PostResponseDto> {
    const post = await this.prisma.communityPost.findFirst({
      where: { id: postId, communityId, deletedAt: null },
      include: { author: { select: { id: true, email: true } } },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const isAuthor = post.authorId === userId;
    const isAdmin = userRoles.includes('ADMIN');

    if (!isAuthor && !isAdmin) {
      throw new ForbiddenException('You do not have permission to edit this post');
    }

    const updated = await this.prisma.communityPost.update({
      where: { id: postId },
      data: {
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.attachments !== undefined && { attachments: dto.attachments }),
        ...(dto.linkUrl !== undefined && { linkUrl: dto.linkUrl }),
      },
      include: { author: { select: { id: true, email: true } } },
    });

    return this.mapToResponseDto(updated, {
      id: updated.author.id,
      email: updated.author.email,
    });
  }

  /**
   * Soft-delete a post.
   * Authorized: Author, Community OWNER, Community MODERATOR, or platform ADMIN.
   */
  async delete(
    communityId: string,
    postId: string,
    userId: string,
    userRoles: string[],
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    const post = await this.prisma.communityPost.findFirst({
      where: { id: postId, communityId, deletedAt: null },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    // Check authorization: author OR moderator/owner/admin
    const isAuthor = post.authorId === userId;
    if (!isAuthor) {
      await this.authService.assertCanModerateCommunity(userId, userRoles, communityId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.communityPost.update({
        where: { id: postId },
        data: {
          deletedAt: new Date(),
          status: CommunityPostStatus.DELETED,
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: COMMUNITY_OUTBOX_EVENTS.COMMUNITY_POST_DELETED,
          aggregateType: 'COMMUNITY_POST',
          aggregateId: postId,
          payload: {
            postId,
            communityId,
            deletedBy: userId,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          action: COMMUNITY_AUDIT_ACTIONS.POST_DELETE,
          resourceType: COMMUNITY_AUDIT_RESOURCES.COMMUNITY_POST,
          resourceId: postId,
          ipAddress,
          userAgent,
          metadata: { communityId },
        },
      });
    });

    return { success: true, message: 'Post deleted successfully' };
  }

  /**
   * Pin a post to the top of the community feed.
   * Authorized: Community OWNER, MODERATOR, or platform ADMIN.
   */
  async pin(
    communityId: string,
    postId: string,
    userId: string,
    userRoles: string[],
    ipAddress?: string,
    userAgent?: string,
  ): Promise<PostResponseDto> {
    await this.authService.assertCanModerateCommunity(userId, userRoles, communityId);

    const post = await this.prisma.communityPost.findFirst({
      where: { id: postId, communityId, deletedAt: null },
      include: { author: { select: { id: true, email: true } } },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const p = await tx.communityPost.update({
        where: { id: postId },
        data: { isPinned: true },
        include: { author: { select: { id: true, email: true } } },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: COMMUNITY_OUTBOX_EVENTS.COMMUNITY_POST_PINNED,
          aggregateType: 'COMMUNITY_POST',
          aggregateId: postId,
          payload: { postId, communityId, pinnedBy: userId },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          action: COMMUNITY_AUDIT_ACTIONS.POST_PIN,
          resourceType: COMMUNITY_AUDIT_RESOURCES.COMMUNITY_POST,
          resourceId: postId,
          ipAddress,
          userAgent,
          metadata: { communityId },
        },
      });

      return p;
    });

    return this.mapToResponseDto(updated, updated.author);
  }

  /**
   * Unpin a post from the community feed.
   * Authorized: Community OWNER, MODERATOR, or platform ADMIN.
   */
  async unpin(
    communityId: string,
    postId: string,
    userId: string,
    userRoles: string[],
    ipAddress?: string,
    userAgent?: string,
  ): Promise<PostResponseDto> {
    await this.authService.assertCanModerateCommunity(userId, userRoles, communityId);

    const post = await this.prisma.communityPost.findFirst({
      where: { id: postId, communityId, deletedAt: null },
      include: { author: { select: { id: true, email: true } } },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const p = await tx.communityPost.update({
        where: { id: postId },
        data: { isPinned: false },
        include: { author: { select: { id: true, email: true } } },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: COMMUNITY_OUTBOX_EVENTS.COMMUNITY_POST_UNPINNED,
          aggregateType: 'COMMUNITY_POST',
          aggregateId: postId,
          payload: { postId, communityId, unpinnedBy: userId },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          action: COMMUNITY_AUDIT_ACTIONS.POST_UNPIN,
          resourceType: COMMUNITY_AUDIT_RESOURCES.COMMUNITY_POST,
          resourceId: postId,
          ipAddress,
          userAgent,
          metadata: { communityId },
        },
      });

      return p;
    });

    return this.mapToResponseDto(updated, updated.author);
  }

  private mapToResponseDto(
    post: CommunityPost,
    author?: { id: string; email: string; communityRole?: CommunityMemberRole | null },
    likedByCurrentUser?: boolean,
  ): PostResponseDto {
    return {
      id: post.id,
      communityId: post.communityId,
      authorId: post.authorId,
      content: post.content,
      attachments: post.attachments,
      linkUrl: post.linkUrl,
      isPinned: post.isPinned,
      status: post.status,
      likeCount: post.likeCount,
      replyCount: post.replyCount,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      author,
      likedByCurrentUser,
    };
  }
}
