import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CommunityMemberRole, CommunityPostStatus } from '@prisma/client';
import { CommunityRepliesService } from './community-replies.service';
import { CommunityAuthorizationService } from './community-authorization.service';
import { PrismaService } from '../../../database/prisma.service';

describe('CommunityRepliesService', () => {
  let service: CommunityRepliesService;
  let prisma: {
    user: { findUnique: jest.Mock };
    communityPost: { findFirst: jest.Mock; update: jest.Mock };
    communityPostReply: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    communityMember: { findMany: jest.Mock };
    communityMention: { create: jest.Mock };
    outboxEvent: { create: jest.Mock };
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
    status: CommunityPostStatus.PUBLISHED,
    deletedAt: null,
  };

  const sampleReply = {
    id: 'reply-1',
    postId: 'post-1',
    authorId: 'user-author',
    parentReplyId: null,
    content: 'Great insight!',
    status: CommunityPostStatus.PUBLISHED,
    likeCount: 0,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      communityPost: { findFirst: jest.fn(), update: jest.fn() },
      communityPostReply: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      communityMember: { findMany: jest.fn() },
      communityMention: { create: jest.fn() },
      outboxEvent: { create: jest.fn() },
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
    };

    authService = {
      assertActiveMember: jest.fn(),
      assertCanViewCommunity: jest.fn(),
      assertCanModerateCommunity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityRepliesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CommunityAuthorizationService, useValue: authService },
      ],
    }).compile();

    service = module.get<CommunityRepliesService>(CommunityRepliesService);
  });

  describe('create', () => {
    it('should throw NotFoundException if parent reply does not exist', async () => {
      authService.assertActiveMember.mockResolvedValue({
        member: { role: CommunityMemberRole.MEMBER },
      });
      prisma.communityPost.findFirst.mockResolvedValue(samplePost);
      prisma.communityPostReply.findFirst.mockResolvedValue(null);

      await expect(
        service.create('comm-1', 'post-1', 'user-author', {
          content: 'Nested reply',
          parentReplyId: 'missing-parent',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create reply and increment post replyCount', async () => {
      authService.assertActiveMember.mockResolvedValue({
        member: { role: CommunityMemberRole.MEMBER },
      });
      prisma.communityPost.findFirst.mockResolvedValue(samplePost);
      prisma.communityPostReply.create.mockResolvedValue(sampleReply);
      prisma.user.findUnique.mockResolvedValue({ id: 'user-author', email: 'author@innovent.app' });

      const res = await service.create('comm-1', 'post-1', 'user-author', {
        content: 'Great insight!',
      });

      expect(prisma.communityPostReply.create).toHaveBeenCalled();
      expect(prisma.communityPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: { replyCount: { increment: 1 } },
        }),
      );
      expect(res.id).toBe('reply-1');
    });
  });

  describe('findAll', () => {
    it('should organize threaded replies into nested childReplies', async () => {
      authService.assertCanViewCommunity.mockResolvedValue({});
      prisma.communityPost.findFirst.mockResolvedValue(samplePost);

      const rootReply = { ...sampleReply, id: 'reply-root', parentReplyId: null };
      const childReply = {
        ...sampleReply,
        id: 'reply-child',
        parentReplyId: 'reply-root',
        content: 'I agree with root!',
      };

      prisma.communityPostReply.findMany.mockResolvedValue([
        { ...rootReply, author: { id: 'user-1', email: 'u1@app.com' }, likes: [] },
        { ...childReply, author: { id: 'user-2', email: 'u2@app.com' }, likes: [] },
      ]);
      prisma.communityMember.findMany.mockResolvedValue([]);

      const res = await service.findAll('comm-1', 'post-1');

      expect(res.length).toBe(1);
      expect(res[0]!.id).toBe('reply-root');
      expect(res[0]!.childReplies!.length).toBe(1);
      expect(res[0]!.childReplies![0]!.id).toBe('reply-child');
    });
  });

  describe('delete', () => {
    it('should delete reply and decrement post replyCount', async () => {
      prisma.communityPostReply.findFirst.mockResolvedValue(sampleReply);

      const res = await service.delete('comm-1', 'post-1', 'reply-1', 'user-author', ['ATTENDEE']);
      expect(res.success).toBe(true);
      expect(prisma.communityPostReply.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: CommunityPostStatus.DELETED,
          }),
        }),
      );
      expect(prisma.communityPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { replyCount: { decrement: 1 } },
        }),
      );
    });
  });
});
