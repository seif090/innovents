import { Test, TestingModule } from '@nestjs/testing';
import { CouponsService } from './coupons.service';
import { PrismaService } from '../../../database/prisma.service';
import { OutboxService } from '../../outbox/outbox.service';
import { AuditService } from '../../audit/audit.service';
import { AccountStatus, DiscountType, Prisma } from '@prisma/client';
import { ConflictException } from '@nestjs/common';

describe('CouponsService', () => {
  let service: CouponsService;
  let prisma: {
    user: { findFirst: jest.Mock };
    event: { findFirst: jest.Mock };
    coupon: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    couponRedemption: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let outboxService: { enqueue: jest.Mock };
  let auditService: { log: jest.Mock };

  const activeProvider = {
    id: 'provider-1',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
    userRoles: [{ role: { name: 'PROVIDER' } }],
  };

  const activeEvent = {
    id: 'event-1',
    endsAt: new Date(Date.now() + 86400000 * 5),
    deletedAt: null,
  };

  const sampleCoupon = {
    id: 'coupon-1',
    providerId: 'provider-1',
    eventId: 'event-1',
    code: 'SAVE20',
    normalizedCode: 'SAVE20',
    discountType: DiscountType.PERCENTAGE,
    discountValue: new Prisma.Decimal(20),
    maxRedemptions: 5,
    redemptionCount: 0,
    expiresAt: new Date(Date.now() + 86400000 * 2),
    isActive: true,
    deletedAt: null,
    provider: activeProvider,
    event: activeEvent,
  };

  beforeEach(async () => {
    prisma = {
      user: { findFirst: jest.fn() },
      event: { findFirst: jest.fn() },
      coupon: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      couponRedemption: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => {
        const txPrisma = {
          couponRedemption: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({
              id: 'redemption-1',
              couponId: 'coupon-1',
              discountAmount: new Prisma.Decimal(20),
              redeemedAt: new Date(),
              coupon: sampleCoupon,
            }),
          },
          $executeRaw: jest.fn().mockResolvedValue(1),
        };
        return cb(txPrisma);
      }),
    };
    outboxService = { enqueue: jest.fn().mockResolvedValue(undefined) };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CouponsService,
        { provide: PrismaService, useValue: prisma },
        { provide: OutboxService, useValue: outboxService },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<CouponsService>(CouponsService);
  });

  describe('createCoupon', () => {
    it('should create a coupon with normalized uppercase code', async () => {
      prisma.user.findFirst.mockResolvedValue(activeProvider);
      prisma.event.findFirst.mockResolvedValue(activeEvent);
      prisma.coupon.findUnique.mockResolvedValue(null);
      prisma.coupon.create.mockResolvedValue(sampleCoupon);

      const result = await service.createCoupon('provider-1', {
        eventId: 'event-1',
        code: '  save20  ',
        discountType: DiscountType.PERCENTAGE,
        discountValue: 20,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      expect(result.normalizedCode).toEqual('SAVE20');
      expect(prisma.coupon.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ normalizedCode: 'SAVE20' }),
        }),
      );
    });

    it('should reject duplicate normalized code with ConflictException', async () => {
      prisma.user.findFirst.mockResolvedValue(activeProvider);
      prisma.event.findFirst.mockResolvedValue(activeEvent);
      prisma.coupon.findUnique.mockResolvedValue(sampleCoupon);

      await expect(
        service.createCoupon('provider-1', {
          eventId: 'event-1',
          code: 'SAVE20',
          discountType: DiscountType.PERCENTAGE,
          discountValue: 20,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('validateCoupon', () => {
    it('should return valid: true for eligible coupon', async () => {
      prisma.coupon.findFirst.mockResolvedValue(sampleCoupon);
      prisma.couponRedemption.findUnique.mockResolvedValue(null);

      const result = await service.validateCoupon(
        { code: 'save20', eventId: 'event-1' },
        'attendee-1',
      );

      expect(result.valid).toBe(true);
      expect(result.estimatedDiscount).toEqual(20);
    });

    it('should return valid: false if attendee already redeemed', async () => {
      prisma.coupon.findFirst.mockResolvedValue(sampleCoupon);
      prisma.couponRedemption.findUnique.mockResolvedValue({ id: 'redemption-old' });

      const result = await service.validateCoupon(
        { code: 'save20', eventId: 'event-1' },
        'attendee-1',
      );

      expect(result.valid).toBe(false);
      expect(result.message).toContain('already redeemed');
    });

    it('should return valid: false if event does not match', async () => {
      prisma.coupon.findFirst.mockResolvedValue(sampleCoupon);

      const result = await service.validateCoupon(
        { code: 'save20', eventId: 'wrong-event' },
        'attendee-1',
      );

      expect(result.valid).toBe(false);
      expect(result.message).toContain('not valid for this event');
    });
  });

  describe('redeemCoupon (Atomicity & Anti-Double-Redeem)', () => {
    it('should redeem successfully and enqueue outbox notification', async () => {
      prisma.coupon.findFirst.mockResolvedValue(sampleCoupon);
      prisma.couponRedemption.findUnique.mockResolvedValue(null);

      const result = await service.redeemCoupon('attendee-1', {
        code: 'save20',
        eventId: 'event-1',
      });

      expect(result.redemptionId).toEqual('redemption-1');
      expect(outboxService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'COUPON_REDEEMED' }),
        expect.anything(),
      );
    });

    it('should throw ConflictException if concurrent redemption limit reached', async () => {
      prisma.coupon.findFirst.mockResolvedValue(sampleCoupon);
      prisma.couponRedemption.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockImplementationOnce(async (cb: (tx: unknown) => unknown) => {
        const txPrisma = {
          couponRedemption: { findUnique: jest.fn().mockResolvedValue(null) },
          $executeRaw: jest.fn().mockResolvedValue(0), // 0 rows updated
        };
        return cb(txPrisma);
      });

      await expect(
        service.redeemCoupon('attendee-1', { code: 'save20', eventId: 'event-1' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if duplicate redemption attempted by same attendee in transaction', async () => {
      prisma.coupon.findFirst.mockResolvedValue(sampleCoupon);
      prisma.couponRedemption.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockImplementationOnce(async (cb: (tx: unknown) => unknown) => {
        const txPrisma = {
          couponRedemption: { findUnique: jest.fn().mockResolvedValue({ id: 'existing' }) },
        };
        return cb(txPrisma);
      });

      await expect(
        service.redeemCoupon('attendee-1', { code: 'save20', eventId: 'event-1' }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
