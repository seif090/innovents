import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityStatus,
  CommunityType,
  CommunityVisibility,
} from '@prisma/client';
import { CommunityAuthorizationService } from './community-authorization.service';
import { PrismaService } from '../../../database/prisma.service';

describe('CommunityAuthorizationService', () => {
  let service: CommunityAuthorizationService;
  let prisma: {
    community: {
      findFirst: jest.Mock;
    };
    communityMember: {
      findUnique: jest.Mock;
    };
  };

  const sampleCommunity = {
    id: 'comm-123',
    eventId: 'evt-123',
    createdById: 'owner-user-1',
    name: 'Tech Enthusiasts',
    bio: 'A tech community',
    description: 'Detailed description',
    category: 'Technology',
    type: CommunityType.FREE,
    visibility: CommunityVisibility.PUBLIC,
    status: CommunityStatus.ACTIVE,
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
      community: {
        findFirst: jest.fn(),
      },
      communityMember: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityAuthorizationService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<CommunityAuthorizationService>(CommunityAuthorizationService);
  });

  describe('assertCanViewCommunity', () => {
    it('should throw NotFoundException if community does not exist or is deleted', async () => {
      prisma.community.findFirst.mockResolvedValue(null);

      await expect(service.assertCanViewCommunity('missing-id')).rejects.toThrow(NotFoundException);
    });

    it('should allow anyone to view an active public community', async () => {
      prisma.community.findFirst.mockResolvedValue(sampleCommunity);

      const result = await service.assertCanViewCommunity('comm-123');
      expect(result.id).toBe('comm-123');
    });

    it('should throw NotFoundException for private community when unauthenticated (anti-enumeration)', async () => {
      prisma.community.findFirst.mockResolvedValue({
        ...sampleCommunity,
        visibility: CommunityVisibility.PRIVATE,
      });

      await expect(service.assertCanViewCommunity('comm-123')).rejects.toThrow(NotFoundException);
    });

    it('should allow ADMIN to view a private community', async () => {
      prisma.community.findFirst.mockResolvedValue({
        ...sampleCommunity,
        visibility: CommunityVisibility.PRIVATE,
      });

      const result = await service.assertCanViewCommunity('comm-123', 'admin-user', ['ADMIN']);
      expect(result.id).toBe('comm-123');
    });

    it('should allow creator to view their own private community', async () => {
      prisma.community.findFirst.mockResolvedValue({
        ...sampleCommunity,
        visibility: CommunityVisibility.PRIVATE,
      });

      const result = await service.assertCanViewCommunity('comm-123', 'owner-user-1', []);
      expect(result.id).toBe('comm-123');
    });

    it('should allow active member to view private community', async () => {
      prisma.community.findFirst.mockResolvedValue({
        ...sampleCommunity,
        visibility: CommunityVisibility.PRIVATE,
      });
      prisma.communityMember.findUnique.mockResolvedValue({
        id: 'mem-1',
        communityId: 'comm-123',
        userId: 'member-user',
        status: CommunityMemberStatus.ACTIVE,
      });

      const result = await service.assertCanViewCommunity('comm-123', 'member-user', []);
      expect(result.id).toBe('comm-123');
    });

    it('should throw NotFoundException for non-member trying to view private community', async () => {
      prisma.community.findFirst.mockResolvedValue({
        ...sampleCommunity,
        visibility: CommunityVisibility.PRIVATE,
      });
      prisma.communityMember.findUnique.mockResolvedValue(null);

      await expect(service.assertCanViewCommunity('comm-123', 'outsider-user', [])).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('assertCanManageCommunity', () => {
    it('should allow ADMIN to manage any community', async () => {
      prisma.community.findFirst.mockResolvedValue(sampleCommunity);

      const result = await service.assertCanManageCommunity('admin-user', ['ADMIN'], 'comm-123');
      expect(result.id).toBe('comm-123');
    });

    it('should allow community owner to manage', async () => {
      prisma.community.findFirst.mockResolvedValue(sampleCommunity);

      const result = await service.assertCanManageCommunity('owner-user-1', [], 'comm-123');
      expect(result.id).toBe('comm-123');
    });

    it('should throw ForbiddenException if user is neither owner nor admin', async () => {
      prisma.community.findFirst.mockResolvedValue(sampleCommunity);

      await expect(service.assertCanManageCommunity('other-user', [], 'comm-123')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('assertCanModerateCommunity', () => {
    it('should allow OWNER or ADMIN with OWNER role returned', async () => {
      prisma.community.findFirst.mockResolvedValue(sampleCommunity);

      const res = await service.assertCanModerateCommunity('owner-user-1', [], 'comm-123');
      expect(res.role).toBe(CommunityMemberRole.OWNER);
    });

    it('should allow active MODERATOR member', async () => {
      prisma.community.findFirst.mockResolvedValue(sampleCommunity);
      prisma.communityMember.findUnique.mockResolvedValue({
        communityId: 'comm-123',
        userId: 'mod-user',
        role: CommunityMemberRole.MODERATOR,
        status: CommunityMemberStatus.ACTIVE,
      });

      const res = await service.assertCanModerateCommunity('mod-user', [], 'comm-123');
      expect(res.role).toBe(CommunityMemberRole.MODERATOR);
    });

    it('should throw ForbiddenException for regular MEMBER', async () => {
      prisma.community.findFirst.mockResolvedValue(sampleCommunity);
      prisma.communityMember.findUnique.mockResolvedValue({
        communityId: 'comm-123',
        userId: 'regular-user',
        role: CommunityMemberRole.MEMBER,
        status: CommunityMemberStatus.ACTIVE,
      });

      await expect(
        service.assertCanModerateCommunity('regular-user', [], 'comm-123'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assertActiveMember', () => {
    it('should return community and member if user is ACTIVE member', async () => {
      prisma.community.findFirst.mockResolvedValue(sampleCommunity);
      prisma.communityMember.findUnique.mockResolvedValue({
        id: 'mem-1',
        communityId: 'comm-123',
        userId: 'active-user',
        status: CommunityMemberStatus.ACTIVE,
        role: CommunityMemberRole.MEMBER,
      });

      const res = await service.assertActiveMember('active-user', 'comm-123');
      expect(res.community.id).toBe('comm-123');
      expect(res.member.status).toBe(CommunityMemberStatus.ACTIVE);
    });

    it('should throw ForbiddenException if user is not a member', async () => {
      prisma.community.findFirst.mockResolvedValue(sampleCommunity);
      prisma.communityMember.findUnique.mockResolvedValue(null);

      await expect(service.assertActiveMember('non-member', 'comm-123')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException if membership is BANNED or LEFT', async () => {
      prisma.community.findFirst.mockResolvedValue(sampleCommunity);
      prisma.communityMember.findUnique.mockResolvedValue({
        id: 'mem-1',
        communityId: 'comm-123',
        userId: 'banned-user',
        status: CommunityMemberStatus.BANNED,
      });

      await expect(service.assertActiveMember('banned-user', 'comm-123')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
