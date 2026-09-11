import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { CommunityMemberRole, CommunityPostStatus } from '@prisma/client';
import { CommunityPostsService } from './community-posts.service';
import { CommunityAuthorizationService } from './community-authorization.service';
import { PrismaService } from '../../../database/prisma.service';

describe('CommunityPostsService', () => {
  let service: CommunityPostsService;
  let prisma: {
    user: { findUnique: jest.Mock };
    communityPost: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
    communityMember: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
    };
    communityMention: { create: jest.Mock };
    outboxEvent: { create: jest.Mock };
    auditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let authService: {
    assertActiveMember: jest.Mock;
    assertCanViewCommunity: jest.Mock;
    assertCanModerateCommunity: jest.Mock;
  };

  const samplePost = {
    id: 'post-1',
    communityId: 'comm-1',
    authorId: 'user-author',
    content: 'Excited for the upcoming workshops!',
    attachments: [],
    linkUrl: null,
    isPinned: false,
    status: CommunityPostStatus.PUBLISHED,
    likeCount: 0,
    replyCount: 0,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      communityPost: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      communityMember: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      communityMention: { create: jest.fn() },
      outboxEvent: { create: jest.fn() },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
    };

    authService = {
      assertActiveMember: jest.fn(),
      assertCanViewCommunity: jest.fn(),
      assertCanModerateCommunity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityPostsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CommunityAuthorizationService, useValue: authService },
      ],
    }).compile();

    service = module.get<CommunityPostsService>(CommunityPostsService);
  });

  describe('create', () => {
    it('should create post and handle mentions', async () => {
      authService.assertActiveMember.mockResolvedValue({
        member: { role: CommunityMemberRole.MEMBER },
      });
      prisma.communityPost.create.mockResolvedValue(samplePost);
      prisma.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === 'user-author') {
          return Promise.resolve({ id: 'user-author', email: 'author@innovent.app' });
        }
        if (where.id === 'target-user') {
          return Promise.resolve({ id: 'target-user', email: 'target@innovent.app' });
        }
        return Promise.resolve(null);
      });

      const res = await service.create('comm-1', 'user-author', {
        content: 'Excited for the upcoming workshops!',
        mentionedUserIds: ['target-user'],
      });

      expect(prisma.communityPost.create).toHaveBeenCalled();
      expect(prisma.communityMention.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: 'user-author',
            mentionedUserId: 'target-user',
          }),
        }),
      );
      expect(res.id).toBe('post-1');
      expect(res.author?.id).toBe('user-author');
    });
  });

  describe('update', () => {
    it('should throw ForbiddenException if editor is not author or admin', async () => {
      prisma.communityPost.findFirst.mockResolvedValue(samplePost);

      await expect(
        service.update('comm-1', 'post-1', 'other-user', ['ATTENDEE'], {
          content: 'Updated content here',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow author to update post', async () => {
      prisma.communityPost.findFirst.mockResolvedValue(samplePost);
      prisma.communityPost.update.mockResolvedValue({
        ...samplePost,
        content: 'Updated content here',
        author: { id: 'user-author', email: 'author@innovent.app' },
      });

      const res = await service.update('comm-1', 'post-1', 'user-author', ['ATTENDEE'], {
        content: 'Updated content here',
      });

      expect(res.content).toBe('Updated content here');
    });
  });

  describe('delete', () => {
    it('should allow author to delete post', async () => {
      prisma.communityPost.findFirst.mockResolvedValue(samplePost);

      const res = await service.delete('comm-1', 'post-1', 'user-author', ['ATTENDEE']);
      expect(res.success).toBe(true);
      expect(prisma.communityPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: CommunityPostStatus.DELETED,
          }),
        }),
      );
    });
  });

  describe('pin & unpin', () => {
    it('should allow moderator to pin post', async () => {
      authService.assertCanModerateCommunity.mockResolvedValue({
        role: CommunityMemberRole.MODERATOR,
      });
      prisma.communityPost.findFirst.mockResolvedValue(samplePost);
      prisma.communityPost.update.mockResolvedValue({
        ...samplePost,
        isPinned: true,
        author: { id: 'user-author', email: 'author@innovent.app' },
      });

      const res = await service.pin('comm-1', 'post-1', 'user-mod', []);
      expect(res.isPinned).toBe(true);
      expect(prisma.outboxEvent.create).toHaveBeenCalled();
    });

    it('should allow moderator to unpin post', async () => {
      authService.assertCanModerateCommunity.mockResolvedValue({
        role: CommunityMemberRole.MODERATOR,
      });
      prisma.communityPost.findFirst.mockResolvedValue({ ...samplePost, isPinned: true });
      prisma.communityPost.update.mockResolvedValue({
        ...samplePost,
        isPinned: false,
        author: { id: 'user-author', email: 'author@innovent.app' },
      });

      const res = await service.unpin('comm-1', 'post-1', 'user-mod', []);
      expect(res.isPinned).toBe(false);
    });
  });
});
