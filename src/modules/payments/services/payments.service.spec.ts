/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { PAYMENT_PROVIDER } from '../../../infrastructure/payments/payment.interface';
import {
  AccountStatus,
  CommunitySponsorshipStatus,
  PaymentPurpose,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { ConflictException, ForbiddenException } from '@nestjs/common';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: any;
  let auditService: { log: jest.Mock };
  let outboxService: { enqueue: jest.Mock };
  let paymentProvider: {
    createOrGetCustomer: jest.Mock;
    createCheckoutSession: jest.Mock;
    refundPayment: jest.Mock;
  };

  const activeSponsorUser = {
    id: 'user-sponsor-1',
    email: 'sponsor@example.com',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
    userRoles: [{ role: { name: 'SPONSOR' } }],
    sponsorProfile: {
      id: 'sponsor-profile-1',
      companyName: 'Tech Innovations Ltd',
      contactEmail: 'sponsor@example.com',
      stripeCustomerId: 'cus_test_123',
    },
  };

  const activeCommunity = {
    id: 'comm-1',
    name: 'AI Innovators Community',
    memberCapacity: 20,
    deletedAt: null,
  };

  const standardPlan = {
    id: 'plan-default-1',
    code: 'DEFAULT',
    name: 'Standard Community Sponsorship',
    price: new Prisma.Decimal(500),
    currency: 'SAR',
    memberCapacity: 500,
    durationDays: 30,
    isActive: true,
  };

  beforeEach(async () => {
    prisma = {
      user: { findFirst: jest.fn() },
      community: { findFirst: jest.fn(), update: jest.fn() },
      communitySponsorship: { findFirst: jest.fn(), update: jest.fn() },
      communitySponsorshipPlan: { findFirst: jest.fn() },
      sponsorProfile: { update: jest.fn() },
      payment: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => {
        if (typeof cb === 'function') {
          return cb(prisma);
        }
        return cb;
      }),
    };

    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    outboxService = { enqueue: jest.fn().mockResolvedValue(undefined) };
    paymentProvider = {
      createOrGetCustomer: jest
        .fn()
        .mockResolvedValue({ id: 'cus_test_123', email: 'sponsor@example.com' }),
      createCheckoutSession: jest.fn().mockResolvedValue({
        sessionId: 'cs_test_session_1',
        checkoutUrl: 'https://checkout.stripe.com/cs_test_session_1',
      }),
      refundPayment: jest
        .fn()
        .mockResolvedValue({ id: 're_123', status: 'succeeded', amount: 50000 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: OutboxService, useValue: outboxService },
        { provide: PAYMENT_PROVIDER, useValue: paymentProvider },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  describe('createCommunitySponsorshipCheckout', () => {
    it('successfully initiates checkout with server-side configured price and stripe session', async () => {
      prisma.user.findFirst.mockResolvedValue(activeSponsorUser);
      prisma.community.findFirst.mockResolvedValue(activeCommunity);
      prisma.communitySponsorship.findFirst.mockResolvedValue(null);
      prisma.communitySponsorshipPlan.findFirst.mockResolvedValue(standardPlan);
      prisma.payment.create.mockResolvedValue({
        id: 'payment-1',
        amount: standardPlan.price,
        currency: standardPlan.currency,
        status: PaymentStatus.PENDING,
      });
      prisma.payment.update.mockResolvedValue({ id: 'payment-1' });

      const result = await service.createCommunitySponsorshipCheckout('user-sponsor-1', {
        communityId: 'comm-1',
      });

      expect(result.sessionId).toBe('cs_test_session_1');
      expect(result.checkoutUrl).toBe('https://checkout.stripe.com/cs_test_session_1');
      expect(result.paymentId).toBe('payment-1');
      expect(paymentProvider.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-sponsor-1',
          stripeCustomerId: 'cus_test_123',
          mode: 'payment',
        }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'COMMUNITY_SPONSORSHIP_CHECKOUT_INITIATED',
          resourceId: 'payment-1',
        }),
      );
    });

    it('rejects initiation if community already has active unexpired sponsorship', async () => {
      prisma.user.findFirst.mockResolvedValue(activeSponsorUser);
      prisma.community.findFirst.mockResolvedValue(activeCommunity);
      prisma.communitySponsorship.findFirst.mockResolvedValue({
        id: 'sponsorship-active-1',
        status: CommunitySponsorshipStatus.ACTIVE,
        endsAt: new Date(Date.now() + 100000),
      });

      await expect(
        service.createCommunitySponsorshipCheckout('user-sponsor-1', { communityId: 'comm-1' }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects if caller is not a sponsor', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-attendee',
        status: AccountStatus.ACTIVE,
        userRoles: [{ role: { name: 'ATTENDEE' } }],
        sponsorProfile: null,
      });

      await expect(
        service.createCommunitySponsorshipCheckout('user-attendee', { communityId: 'comm-1' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getPaymentById', () => {
    it('allows owner to retrieve payment', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'payment-1',
        userId: 'user-sponsor-1',
        amount: new Prisma.Decimal(500),
        currency: 'SAR',
        status: PaymentStatus.SUCCEEDED,
        purpose: PaymentPurpose.COMMUNITY_SPONSORSHIP,
        createdAt: new Date(),
        updatedAt: new Date(),
        sponsorProfile: { userId: 'user-sponsor-1' },
      });

      const res = await service.getPaymentById('payment-1', 'user-sponsor-1', false);
      expect(res.id).toBe('payment-1');
      expect(res.amount).toBe(500);
    });

    it('rejects non-owner non-admin with IDOR ForbiddenException', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'payment-1',
        userId: 'user-sponsor-1',
        sponsorProfile: { userId: 'user-sponsor-1' },
      });

      await expect(service.getPaymentById('payment-1', 'stranger-user', false)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('refundPayment', () => {
    it('successfully processes full refund and cancels sponsorship benefits', async () => {
      const paymentRecord = {
        id: 'payment-1',
        userId: 'user-sponsor-1',
        amount: new Prisma.Decimal(500),
        currency: 'SAR',
        status: PaymentStatus.SUCCEEDED,
        stripePaymentIntentId: 'pi_test_123',
        refundAmount: null,
        communitySponsorship: {
          id: 'cs-1',
          communityId: 'comm-1',
        },
      };

      prisma.payment.findUnique.mockResolvedValue(paymentRecord);
      prisma.payment.update.mockResolvedValue({
        ...paymentRecord,
        status: PaymentStatus.REFUNDED,
        refundAmount: new Prisma.Decimal(500),
      });
      prisma.communitySponsorship.findFirst.mockResolvedValue(null); // No remaining active sponsorship
      prisma.community.update.mockResolvedValue({});

      const res = await service.refundPayment('payment-1', 'admin-1', {
        reason: 'Duplicate purchase',
      });

      expect(paymentProvider.refundPayment).toHaveBeenCalledWith(
        'pi_test_123',
        50000,
        'Duplicate purchase',
      );
      expect(outboxService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'PAYMENT_REFUNDED',
          aggregateId: 'payment-1',
        }),
        expect.anything(),
      );
      expect(res.status).toBe(PaymentStatus.REFUNDED);
    });
  });
});
