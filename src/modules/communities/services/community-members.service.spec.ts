import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import {
  AccountStatus,
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityStatus,
  CommunityVisibility,
} from '@prisma/client';
import { CommunityMembersService } from './community-members.service';
import { CommunityAuthorizationService } from './community-authorization.service';
import { PrismaService } from '../../../database/prisma.service';

describe('CommunityMembersService', () => {
  let service: CommunityMembersService;
  let prisma: {
    user: { findFirst: jest.Mock };
    community: { update: jest.Mock };
    communityMember: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    outboxEvent: { create: jest.Mock };
    auditLog: { create: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let authService: {
    assertCanViewCommunity: jest.Mock;
    assertCanManageCommunity: jest.Mock;
    assertCanModerateCommunity: jest.Mock;
  };

  const sampleUser = {
    id: 'user-1',
    email: 'user1@innovent.app',
    status: AccountStatus.ACTIVE,
  };

  const sampleLockedComm = {
    id: 'comm-1',
    status: CommunityStatus.ACTIVE,
    visibility: CommunityVisibility.PUBLIC,
    member_capacity: 20,
    member_count: 5,
  };

  beforeEach(async () => {
    prisma = {
      user: { findFirst: jest.fn() },
      community: { update: jest.fn() },
      communityMember: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      outboxEvent: { create: jest.fn() },
      auditLog: { create: jest.fn() },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
    };

    authService = {
      assertCanViewCommunity: jest.fn(),
      assertCanManageCommunity: jest.fn(),
      assertCanModerateCommunity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityMembersService,
        { provide: PrismaService, useValue: prisma },
        { provide: CommunityAuthorizationService, useValue: authService },
      ],
    }).compile();

    service = module.get<CommunityMembersService>(CommunityMembersService);
  });

  describe('join', () => {
    it('should throw ForbiddenException if user is not ACTIVE', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...sampleUser,
        status: AccountStatus.SUSPENDED,
      });

      await expect(service.join('user-1', 'comm-1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if community capacity is reached', async () => {
      prisma.user.findFirst.mockResolvedValue(sampleUser);
      prisma.$queryRaw.mockResolvedValue([
        { ...sampleLockedComm, member_count: 20, member_capacity: 20 },
      ]);
      prisma.communityMember.findUnique.mockResolvedValue(null);

      await expect(service.join('user-1', 'comm-1')).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if user is already an ACTIVE member', async () => {
      prisma.user.findFirst.mockResolvedValue(sampleUser);
      prisma.$queryRaw.mockResolvedValue([sampleLockedComm]);
      prisma.communityMember.findUnique.mockResolvedValue({
        id: 'mem-1',
        status: CommunityMemberStatus.ACTIVE,
      });

      await expect(service.join('user-1', 'comm-1')).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if user is BANNED', async () => {
      prisma.user.findFirst.mockResolvedValue(sampleUser);
      prisma.$queryRaw.mockResolvedValue([sampleLockedComm]);
      prisma.communityMember.findUnique.mockResolvedValue({
        id: 'mem-1',
        status: CommunityMemberStatus.BANNED,
      });

      await expect(service.join('user-1', 'comm-1')).rejects.toThrow(ConflictException);
    });

    it('should reactivate membership if user previously LEFT', async () => {
      prisma.user.findFirst.mockResolvedValue(sampleUser);
      prisma.$queryRaw.mockResolvedValue([sampleLockedComm]);
      prisma.communityMember.findUnique.mockResolvedValue({
        id: 'mem-1',
        status: CommunityMemberStatus.LEFT,
        communityId: 'comm-1',
        userId: 'user-1',
        role: CommunityMemberRole.MEMBER,
      });
      prisma.communityMember.update.mockResolvedValue({
        id: 'mem-1',
        status: CommunityMemberStatus.ACTIVE,
        communityId: 'comm-1',
        userId: 'user-1',
        role: CommunityMemberRole.MEMBER,
        joinedAt: new Date(),
      });

      const result = await service.join('user-1', 'comm-1');
      expect(prisma.communityMember.update).toHaveBeenCalled();
      expect(prisma.community.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { memberCount: { increment: 1 } },
        }),
      );
      expect(result.status).toBe(CommunityMemberStatus.ACTIVE);
    });

    it('should successfully join as new member when under capacity', async () => {
      prisma.user.findFirst.mockResolvedValue(sampleUser);
      prisma.$queryRaw.mockResolvedValue([sampleLockedComm]);
      prisma.communityMember.findUnique.mockResolvedValue(null);
      prisma.communityMember.create.mockResolvedValue({
        id: 'mem-new',
        communityId: 'comm-1',
        userId: 'user-1',
        role: CommunityMemberRole.MEMBER,
        status: CommunityMemberStatus.ACTIVE,
        joinedAt: new Date(),
      });

      const result = await service.join('user-1', 'comm-1');
      expect(prisma.communityMember.create).toHaveBeenCalled();
      expect(prisma.community.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { memberCount: { increment: 1 } },
        }),
      );
      expect(result.role).toBe(CommunityMemberRole.MEMBER);
    });
  });

  describe('leave', () => {
    it('should throw BadRequestException if OWNER attempts to leave', async () => {
      prisma.communityMember.findUnique.mockResolvedValue({
        id: 'mem-1',
        role: CommunityMemberRole.OWNER,
        status: CommunityMemberStatus.ACTIVE,
      });

      await expect(service.leave('user-1', 'comm-1')).rejects.toThrow(BadRequestException);
    });

    it('should allow regular member to leave', async () => {
      prisma.communityMember.findUnique.mockResolvedValue({
        id: 'mem-1',
        role: CommunityMemberRole.MEMBER,
        status: CommunityMemberStatus.ACTIVE,
      });

      const res = await service.leave('user-1', 'comm-1');
      expect(res.success).toBe(true);
      expect(prisma.communityMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: CommunityMemberStatus.LEFT,
          }),
        }),
      );
      expect(prisma.community.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { memberCount: { decrement: 1 } },
        }),
      );
    });
  });

  describe('updateRole', () => {
    it('should throw BadRequestException if owner attempts to modify their own role', async () => {
      authService.assertCanManageCommunity.mockResolvedValue({});

      await expect(
        service.updateRole('comm-1', 'user-owner', 'user-owner', [], {
          role: CommunityMemberRole.SPEAKER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update role to SPEAKER', async () => {
      authService.assertCanManageCommunity.mockResolvedValue({});
      prisma.communityMember.findUnique.mockResolvedValue({
        id: 'mem-2',
        communityId: 'comm-1',
        userId: 'user-2',
        status: CommunityMemberStatus.ACTIVE,
        role: CommunityMemberRole.MEMBER,
        user: { id: 'user-2', email: 'user2@innovent.app' },
      });
      prisma.communityMember.update.mockResolvedValue({
        id: 'mem-2',
        communityId: 'comm-1',
        userId: 'user-2',
        status: CommunityMemberStatus.ACTIVE,
        role: CommunityMemberRole.SPEAKER,
      });

      const res = await service.updateRole('comm-1', 'user-2', 'user-owner', [], {
        role: CommunityMemberRole.SPEAKER,
      });

      expect(res.role).toBe(CommunityMemberRole.SPEAKER);
    });
  });

  describe('banMember & unbanMember', () => {
    it('should throw ForbiddenException if attempting to ban community OWNER', async () => {
      authService.assertCanModerateCommunity.mockResolvedValue({
        role: CommunityMemberRole.MODERATOR,
      });
      prisma.communityMember.findUnique.mockResolvedValue({
        id: 'mem-owner',
        role: CommunityMemberRole.OWNER,
        status: CommunityMemberStatus.ACTIVE,
      });

      await expect(service.banMember('comm-1', 'user-owner', 'user-mod', [])).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should ban member and decrement community memberCount', async () => {
      authService.assertCanModerateCommunity.mockResolvedValue({
        role: CommunityMemberRole.OWNER,
      });
      prisma.communityMember.findUnique.mockResolvedValue({
        id: 'mem-bad',
        role: CommunityMemberRole.MEMBER,
        status: CommunityMemberStatus.ACTIVE,
      });

      const res = await service.banMember('comm-1', 'user-bad', 'user-owner', []);
      expect(res.success).toBe(true);
      expect(prisma.communityMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: CommunityMemberStatus.BANNED,
          }),
        }),
      );
      expect(prisma.community.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { memberCount: { decrement: 1 } },
        }),
      );
    });

    it('should unban member successfully', async () => {
      authService.assertCanModerateCommunity.mockResolvedValue({
        role: CommunityMemberRole.OWNER,
      });
      prisma.communityMember.findUnique.mockResolvedValue({
        id: 'mem-banned',
        status: CommunityMemberStatus.BANNED,
      });

      const res = await service.unbanMember('comm-1', 'user-banned', 'user-owner', []);
      expect(res.success).toBe(true);
      expect(prisma.communityMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: CommunityMemberStatus.LEFT,
          }),
        }),
      );
    });
  });
});
