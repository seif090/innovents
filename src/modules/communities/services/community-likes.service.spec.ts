import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CommunityLikesService } from './community-likes.service';
import { CommunityAuthorizationService } from './community-authorization.service';
import { PrismaService } from '../../../database/prisma.service';

describe('CommunityLikesService', () => {
  let service: CommunityLikesService;
  let prisma: {
    communityPost: { findFirst: jest.Mock; update: jest.Mock };
    communityPostReply: { findFirst: jest.Mock; update: jest.Mock };
    communityPostLike: { findUnique: jest.Mock; create: jest.Mock; delete: jest.Mock };
    communityReplyLike: { findUnique: jest.Mock; create: jest.Mock; delete: jest.Mock };
    outboxEvent: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let authService: {
    assertActiveMember: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      communityPost: { findFirst: jest.fn(), update: jest.fn() },
      communityPostReply: { findFirst: jest.fn(), update: jest.fn() },
      communityPostLike: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
      communityReplyLike: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
      outboxEvent: { create: jest.fn() },
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
    };

    authService = {
      assertActiveMember: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityLikesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CommunityAuthorizationService, useValue: authService },
      ],
    }).compile();

    service = module.get<CommunityLikesService>(CommunityLikesService);
  });

  describe('togglePostLike', () => {
    it('should throw NotFoundException if post not found', async () => {
      authService.assertActiveMember.mockResolvedValue({});
      prisma.communityPost.findFirst.mockResolvedValue(null);

      await expect(service.togglePostLike('comm-1', 'missing-post', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should like post when not yet liked', async () => {
      authService.assertActiveMember.mockResolvedValue({});
      prisma.communityPost.findFirst.mockResolvedValue({ id: 'post-1' });
      prisma.communityPostLike.findUnique.mockResolvedValue(null);
      prisma.communityPost.update.mockResolvedValue({ id: 'post-1', likeCount: 1 });

      const res = await service.togglePostLike('comm-1', 'post-1', 'user-1');
      expect(res.liked).toBe(true);
      expect(res.likeCount).toBe(1);
      expect(prisma.communityPostLike.create).toHaveBeenCalled();
    });

    it('should unlike post when already liked', async () => {
      authService.assertActiveMember.mockResolvedValue({});
      prisma.communityPost.findFirst.mockResolvedValue({ id: 'post-1' });
      prisma.communityPostLike.findUnique.mockResolvedValue({ id: 'like-1' });
      prisma.communityPost.update.mockResolvedValue({ id: 'post-1', likeCount: 0 });

      const res = await service.togglePostLike('comm-1', 'post-1', 'user-1');
      expect(res.liked).toBe(false);
      expect(res.likeCount).toBe(0);
      expect(prisma.communityPostLike.delete).toHaveBeenCalled();
    });
  });

  describe('toggleReplyLike', () => {
    it('should like reply when not yet liked', async () => {
      authService.assertActiveMember.mockResolvedValue({});
      prisma.communityPostReply.findFirst.mockResolvedValue({ id: 'reply-1' });
      prisma.communityReplyLike.findUnique.mockResolvedValue(null);
      prisma.communityPostReply.update.mockResolvedValue({ id: 'reply-1', likeCount: 1 });

      const res = await service.toggleReplyLike('comm-1', 'post-1', 'reply-1', 'user-1');
      expect(res.liked).toBe(true);
      expect(res.likeCount).toBe(1);
    });

    it('should unlike reply when already liked', async () => {
      authService.assertActiveMember.mockResolvedValue({});
      prisma.communityPostReply.findFirst.mockResolvedValue({ id: 'reply-1' });
      prisma.communityReplyLike.findUnique.mockResolvedValue({ id: 'like-r1' });
      prisma.communityPostReply.update.mockResolvedValue({ id: 'reply-1', likeCount: 0 });

      const res = await service.toggleReplyLike('comm-1', 'post-1', 'reply-1', 'user-1');
      expect(res.liked).toBe(false);
      expect(res.likeCount).toBe(0);
    });
  });
});
