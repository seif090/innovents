import { Test, TestingModule } from '@nestjs/testing';
import { AdminApprovalsService } from './admin-approvals.service';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { BadRequestException } from '@nestjs/common';
import { AccountStatus } from '@prisma/client';

describe('AdminApprovalsService', () => {
  let service: AdminApprovalsService;
  let prisma: {
    user: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    refreshToken: {
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let outboxService: { enqueue: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn(),
      },
      refreshToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      $transaction: jest.fn().mockImplementation(async (cb) => cb(prisma)),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    outboxService = { enqueue: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminApprovalsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: OutboxService, useValue: outboxService },
      ],
    }).compile();

    service = module.get<AdminApprovalsService>(AdminApprovalsService);
  });

  describe('listApprovals', () => {
    it('should return paginated approval list', async () => {
      const mockUsers = [
        {
          id: 'u-1',
          email: 'sponsor@test.com',
          phone: '+966501234567',
          status: AccountStatus.PENDING,
          emailVerifiedAt: new Date(),
          createdAt: new Date('2026-09-12T10:00:00Z'),
          approvedAt: null,
          rejectedAt: null,
          suspendedAt: null,
          userRoles: [{ role: { name: 'SPONSOR' } }],
          sponsorProfile: { companyName: 'Acme Sponsor' },
        },
      ];

      prisma.user.findMany.mockResolvedValue(mockUsers);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.listApprovals({
        status: AccountStatus.PENDING,
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.email).toBe('sponsor@test.com');
      expect(result.items[0]!.role).toBe('SPONSOR');
      expect(result.items[0]!.companyOrName).toBe('Acme Sponsor');
      expect(result.total).toBe(1);
    });
  });

  describe('approveAccount', () => {
    it('should transition PENDING user to ACTIVE, write audit log, and enqueue outbox event', async () => {
      const mockUser = {
        id: 'u-1',
        email: 'vendor@test.com',
        status: AccountStatus.PENDING,
        deletedAt: null,
        userRoles: [{ role: { name: 'VENDOR' } }],
      };

      prisma.user.findFirst.mockResolvedValue(mockUser);

      const result = await service.approveAccount('u-1', 'admin-id');

      expect(result.success).toBe(true);
      expect(result.status).toBe(AccountStatus.ACTIVE);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u-1' },
          data: expect.objectContaining({
            status: AccountStatus.ACTIVE,
            approvedByUserId: 'admin-id',
          }),
        }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BUSINESS_ACCOUNT_APPROVED',
          actorUserId: 'admin-id',
          resourceId: 'u-1',
        }),
      );
      expect(outboxService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'ACCOUNT_APPROVED',
          aggregateId: 'u-1',
        }),
        expect.anything(),
      );
    });

    it('should be idempotent if account is already ACTIVE', async () => {
      const mockUser = {
        id: 'u-1',
        email: 'vendor@test.com',
        status: AccountStatus.ACTIVE,
        deletedAt: null,
        userRoles: [{ role: { name: 'VENDOR' } }],
      };

      prisma.user.findFirst.mockResolvedValue(mockUser);

      const result = await service.approveAccount('u-1', 'admin-id');

      expect(result.success).toBe(true);
      expect(result.status).toBe(AccountStatus.ACTIVE);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(outboxService.enqueue).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if user is DEACTIVATED', async () => {
      const mockUser = {
        id: 'u-1',
        status: AccountStatus.DEACTIVATED,
        deletedAt: null,
        userRoles: [{ role: { name: 'VENDOR' } }],
      };

      prisma.user.findFirst.mockResolvedValue(mockUser);

      await expect(service.approveAccount('u-1', 'admin-id')).rejects.toThrow(BadRequestException);
    });
  });

  describe('rejectAccount', () => {
    it('should transition account to REJECTED with rejection reason', async () => {
      const mockUser = {
        id: 'u-2',
        email: 'bad-vendor@test.com',
        status: AccountStatus.PENDING,
        deletedAt: null,
        userRoles: [{ role: { name: 'VENDOR' } }],
      };

      prisma.user.findFirst.mockResolvedValue(mockUser);

      const result = await service.rejectAccount(
        'u-2',
        'admin-id',
        'Invalid registration documents',
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe(AccountStatus.REJECTED);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u-2' },
          data: expect.objectContaining({
            status: AccountStatus.REJECTED,
            rejectionReason: 'Invalid registration documents',
          }),
        }),
      );
      expect(outboxService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'ACCOUNT_REJECTED',
          payload: expect.objectContaining({ reason: 'Invalid registration documents' }),
        }),
        expect.anything(),
      );
    });
  });

  describe('suspendAccount', () => {
    it('should suspend account, revoke active refresh tokens, and enqueue outbox', async () => {
      const mockUser = {
        id: 'u-3',
        email: 'provider@test.com',
        status: AccountStatus.ACTIVE,
        deletedAt: null,
        userRoles: [{ role: { name: 'PROVIDER' } }],
      };

      prisma.user.findFirst.mockResolvedValue(mockUser);

      const result = await service.suspendAccount(
        'u-3',
        'admin-id',
        'Fraudulent activity reported',
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe(AccountStatus.SUSPENDED);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u-3', revokedAt: null },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
      expect(outboxService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'ACCOUNT_SUSPENDED',
          aggregateId: 'u-3',
        }),
        expect.anything(),
      );
    });
  });

  describe('reactivateAccount', () => {
    it('should reactivate a SUSPENDED account back to ACTIVE', async () => {
      const mockUser = {
        id: 'u-4',
        email: 'provider@test.com',
        status: AccountStatus.SUSPENDED,
        deletedAt: null,
        userRoles: [{ role: { name: 'PROVIDER' } }],
      };

      prisma.user.findFirst.mockResolvedValue(mockUser);

      const result = await service.reactivateAccount('u-4', 'admin-id');

      expect(result.success).toBe(true);
      expect(result.status).toBe(AccountStatus.ACTIVE);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u-4' },
          data: expect.objectContaining({
            status: AccountStatus.ACTIVE,
            suspendedAt: null,
            suspensionReason: null,
          }),
        }),
      );
    });

    it('should reject reactivating an already ACTIVE account', async () => {
      const mockUser = {
        id: 'u-5',
        status: AccountStatus.ACTIVE,
        deletedAt: null,
        userRoles: [{ role: { name: 'PROVIDER' } }],
      };

      prisma.user.findFirst.mockResolvedValue(mockUser);

      await expect(service.reactivateAccount('u-5', 'admin-id')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
