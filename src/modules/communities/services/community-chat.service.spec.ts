import { Test, TestingModule } from '@nestjs/testing';
import { CommunityMemberRole } from '@prisma/client';
import { CommunityChatService } from './community-chat.service';
import { CommunityAuthorizationService } from './community-authorization.service';
import { PrismaService } from '../../../database/prisma.service';

describe('CommunityChatService', () => {
  let service: CommunityChatService;
  let prisma: {
    communityChatMessage: { create: jest.Mock; findMany: jest.Mock };
    communityMember: { findMany: jest.Mock };
  };
  let authService: {
    assertActiveMember: jest.Mock;
  };

  const sampleMessage = {
    id: 'msg-1',
    communityId: 'comm-1',
    senderId: 'user-1',
    content: 'Hello everyone!',
    createdAt: new Date(),
    sender: {
      id: 'user-1',
      email: 'user1@innovent.app',
    },
  };

  beforeEach(async () => {
    prisma = {
      communityChatMessage: { create: jest.fn(), findMany: jest.fn() },
      communityMember: { findMany: jest.fn() },
    };

    authService = {
      assertActiveMember: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityChatService,
        { provide: PrismaService, useValue: prisma },
        { provide: CommunityAuthorizationService, useValue: authService },
      ],
    }).compile();

    service = module.get<CommunityChatService>(CommunityChatService);
  });

  describe('saveMessage', () => {
    it('should save message and return sender info with member role', async () => {
      authService.assertActiveMember.mockResolvedValue({
        member: { role: CommunityMemberRole.SPEAKER },
      });
      prisma.communityChatMessage.create.mockResolvedValue(sampleMessage);

      const res = await service.saveMessage('comm-1', 'user-1', {
        content: 'Hello everyone!',
      });

      expect(prisma.communityChatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            communityId: 'comm-1',
            senderId: 'user-1',
            content: 'Hello everyone!',
          },
        }),
      );
      expect(res.content).toBe('Hello everyone!');
      expect(res.sender?.role).toBe(CommunityMemberRole.SPEAKER);
    });
  });

  describe('getRecentMessages', () => {
    it('should fetch and return chronological messages', async () => {
      authService.assertActiveMember.mockResolvedValue({});
      prisma.communityChatMessage.findMany.mockResolvedValue([sampleMessage]);
      prisma.communityMember.findMany.mockResolvedValue([
        { userId: 'user-1', role: CommunityMemberRole.MEMBER },
      ]);

      const res = await service.getRecentMessages('comm-1', 'user-1', 20);

      expect(prisma.communityChatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { communityId: 'comm-1' },
          take: 20,
        }),
      );
      expect(res.length).toBe(1);
      expect(res[0]!.content).toBe('Hello everyone!');
    });
  });
});
