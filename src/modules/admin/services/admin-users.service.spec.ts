/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { AdminUsersService } from './admin-users.service';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { AccountStatus } from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let prisma: any;
  let auditService: { log: jest.Mock };
  let outboxService: { enqueue: jest.Mock };

  const mockUser = {
    id: 'user-uuid-1',
    email: 'user@test.com',
    phone: '+966500000001',
    status: AccountStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    lastLoginAt: new Date(),
    createdAt: new Date(),
    approvedAt: new Date(),
    rejectedAt: null,
    rejectionReason: null,
    suspendedAt: null,
    suspensionReason: null,
    deletedAt: null,
    userRoles: [{ role: { name: 'ATTENDEE' } }],
    sponsorProfile: null,
    vendorProfile: null,
    providerProfile: null,
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([mockUser]),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    auditService = { log: jest.fn().mockResolvedValue({}) };
    outboxService = { enqueue: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: OutboxService, useValue: outboxService },
      ],
    }).compile();

    service = module.get<AdminUsersService>(AdminUsersService);
  });

  describe('listUsers', () => {
    it('should list and paginate users', async () => {
      const result = await service.listUsers({ page: 1, limit: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.items[0]!.email).toBe('user@test.com');
    });
  });

  describe('getUserDetails', () => {
    it('should return sanitized user details', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      const result = await service.getUserDetails('user-uuid-1');
      expect(result.id).toBe('user-uuid-1');
      expect(result.roles).toContain('ATTENDEE');
    });

    it('should throw NotFoundException if user missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getUserDetails('missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('suspendUser', () => {
    it('should prevent admin self-suspension', async () => {
      await expect(
        service.suspendUser('admin-id', 'admin-id', { reason: 'Self lock' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should suspend user, revoke active refresh tokens and log audit', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        status: AccountStatus.SUSPENDED,
        suspensionReason: 'Terms violation',
        suspendedAt: new Date(),
      });

      const result = await service.suspendUser('user-uuid-1', 'admin-uuid', {
        reason: 'Terms violation',
      });

      expect(result.status).toBe(AccountStatus.SUSPENDED);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-uuid-1', revokedAt: null },
        }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_SUSPENDED',
          resourceId: 'user-uuid-1',
          actorUserId: 'admin-uuid',
        }),
      );
      expect(outboxService.enqueue).toHaveBeenCalled();
    });
  });

  describe('deactivateUser', () => {
    it('should prevent admin self-deactivation', async () => {
      await expect(
        service.deactivateUser('admin-id', 'admin-id', { reason: 'Quit' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should soft-deactivate user and revoke sessions', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        status: AccountStatus.DEACTIVATED,
        deletedAt: new Date(),
      });

      const result = await service.deactivateUser('user-uuid-1', 'admin-uuid', {
        reason: 'Account closure request',
      });

      expect(result.status).toBe(AccountStatus.DEACTIVATED);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-uuid-1', revokedAt: null },
        }),
      );
    });
  });
});
