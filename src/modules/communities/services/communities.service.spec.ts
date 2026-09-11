import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  AccountStatus,
  CommunityMemberRole,
  CommunityStatus,
  CommunityType,
  CommunityVisibility,
} from '@prisma/client';
import { CommunitiesService } from './communities.service';
import { CommunityAuthorizationService } from './community-authorization.service';
import { PrismaService } from '../../../database/prisma.service';

describe('CommunitiesService', () => {
  let service: CommunitiesService;
  let prisma: {
    user: { findFirst: jest.Mock; findUnique: jest.Mock };
    event: { findFirst: jest.Mock };
    community: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    communityMember: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
    };
    outboxEvent: { create: jest.Mock };
    auditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let authService: {
    assertCanViewCommunity: jest.Mock;
    assertCanManageCommunity: jest.Mock;
  };

  const sampleUser = {
    id: 'user-1',
    email: 'user1@innovent.app',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
  };

  const sampleEvent = {
    id: 'evt-1',
    title: 'AI Conference 2026',
    deletedAt: null,
  };

  const sampleCommunity = {
    id: 'comm-1',
    eventId: 'evt-1',
    createdById: 'user-1',
    name: 'AI Researchers',
    bio: 'Frontier AI discussions',
    description: 'A community for AI researchers and practitioners.',
    category: 'Technology',
    type: CommunityType.FREE,
    visibility: CommunityVisibility.PUBLIC,
    status: CommunityStatus.ACTIVE,
    coverImageUrl: null,
    language: 'EN',
    memberCapacity: 20,
    memberCount: 1,
    isSponsored: false,
    isPinned: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      user: { findFirst: jest.fn(), findUnique: jest.fn() },
      event: { findFirst: jest.fn() },
      community: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      communityMember: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      outboxEvent: { create: jest.fn() },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
    };

    authService = {
      assertCanViewCommunity: jest.fn(),
      assertCanManageCommunity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunitiesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CommunityAuthorizationService, useValue: authService },
      ],
    }).compile();

    service = module.get<CommunitiesService>(CommunitiesService);
  });

  describe('create', () => {
    it('should throw ForbiddenException if user is not ACTIVE', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...sampleUser,
        status: AccountStatus.SUSPENDED,
      });

      await expect(
        service.create('user-1', ['ATTENDEE'], {
          eventId: 'evt-1',
          name: 'AI Researchers',
          bio: 'Bio here',
          description: 'Long description here for community',
          category: 'Technology',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if parent event does not exist', async () => {
      prisma.user.findFirst.mockResolvedValue(sampleUser);
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(
        service.create('user-1', ['ATTENDEE'], {
          eventId: 'evt-missing',
          name: 'AI Researchers',
          bio: 'Bio here',
          description: 'Long description here for community',
          category: 'Technology',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if creating SPONSORED community without SPONSOR/ADMIN role', async () => {
      prisma.user.findFirst.mockResolvedValue(sampleUser);
      prisma.event.findFirst.mockResolvedValue(sampleEvent);

      await expect(
        service.create('user-1', ['ATTENDEE'], {
          eventId: 'evt-1',
          name: 'Sponsored AI',
          bio: 'Bio here',
          description: 'Long description here for community',
          category: 'Technology',
          type: CommunityType.SPONSORED,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should create FREE community capped at 20 members for standard user', async () => {
      prisma.user.findFirst.mockResolvedValue(sampleUser);
      prisma.event.findFirst.mockResolvedValue(sampleEvent);
      prisma.community.create.mockResolvedValue(sampleCommunity);

      const result = await service.create('user-1', ['ATTENDEE'], {
        eventId: 'evt-1',
        name: 'AI Researchers',
        bio: 'Frontier AI discussions',
        description: 'A community for AI researchers and practitioners.',
        category: 'Technology',
        type: CommunityType.FREE,
      });

      expect(prisma.community.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            memberCapacity: 20,
            isSponsored: false,
            isPinned: false,
          }),
        }),
      );
      expect(result.memberCapacity).toBe(20);
      expect(result.currentUserRole).toBe(CommunityMemberRole.OWNER);
    });

    it('should create SPONSORED community for SPONSOR with configured capacity', async () => {
      prisma.user.findFirst.mockResolvedValue(sampleUser);
      prisma.event.findFirst.mockResolvedValue(sampleEvent);
      prisma.community.create.mockResolvedValue({
        ...sampleCommunity,
        type: CommunityType.SPONSORED,
        memberCapacity: 1000,
        isSponsored: true,
        isPinned: true,
      });

      const result = await service.create('user-1', ['SPONSOR'], {
        eventId: 'evt-1',
        name: 'Google Cloud Community',
        bio: 'Official Google Cloud Meetup',
        description: 'Deep dive into GCP, Vertex AI and cloud architecture.',
        category: 'Cloud',
        type: CommunityType.SPONSORED,
        memberCapacity: 1000,
      });

      expect(prisma.community.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            memberCapacity: 1000,
            isSponsored: true,
            isPinned: true,
          }),
        }),
      );
      expect(result.isSponsored).toBe(true);
    });
  });

  describe('update', () => {
    it('should not allow expanding capacity beyond 20 for FREE community', async () => {
      authService.assertCanManageCommunity.mockResolvedValue(sampleCommunity);

      await expect(
        service.update('comm-1', 'user-1', ['ATTENDEE'], {
          memberCapacity: 100,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update community fields successfully', async () => {
      authService.assertCanManageCommunity.mockResolvedValue(sampleCommunity);
      prisma.community.update.mockResolvedValue({
        ...sampleCommunity,
        name: 'Updated Name',
      });
      prisma.user.findUnique.mockResolvedValue(sampleUser);

      const res = await service.update('comm-1', 'user-1', ['ATTENDEE'], {
        name: 'Updated Name',
      });

      expect(res.name).toBe('Updated Name');
      expect(prisma.outboxEvent.create).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should archive community successfully', async () => {
      authService.assertCanManageCommunity.mockResolvedValue(sampleCommunity);
      prisma.community.update.mockResolvedValue({
        ...sampleCommunity,
        status: CommunityStatus.ARCHIVED,
      });

      const res = await service.delete('comm-1', 'user-1', ['ADMIN']);
      expect(res.success).toBe(true);
      expect(prisma.community.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: CommunityStatus.ARCHIVED,
          }),
        }),
      );
    });
  });
});
