/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionsService } from './subscriptions.service';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { PAYMENT_PROVIDER } from '../../../infrastructure/payments/payment.interface';
import {
  AccountStatus,
  Prisma,
  SubscriptionBillingInterval,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import { ConflictException } from '@nestjs/common';

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let prisma: any;
  let auditService: { log: jest.Mock };
  let outboxService: { enqueue: jest.Mock };
  let paymentProvider: {
    createOrGetCustomer: jest.Mock;
    createCheckoutSession: jest.Mock;
    cancelSubscription: jest.Mock;
  };

  const sponsorUser = {
    id: 'user-sp-1',
    email: 'sponsor@company.com',
    status: AccountStatus.ACTIVE,
    userRoles: [{ role: { name: 'SPONSOR' } }],
    sponsorProfile: {
      id: 'sp-prof-1',
      companyName: 'Acme Corp',
      stripeCustomerId: 'cus_sponsor_1',
    },
    vendorProfile: null,
  };

  const sponsorPlanConfig = {
    id: 'cfg-sp-monthly',
    plan: SubscriptionPlan.SPONSOR_MONTHLY,
    name: 'Sponsor Monthly Plan',
    targetRole: 'SPONSOR',
    stripePriceId: 'price_sponsor_monthly_123',
    price: new Prisma.Decimal(1500),
    currency: 'SAR',
    interval: SubscriptionBillingInterval.MONTH,
    isActive: true,
  };

  beforeEach(async () => {
    prisma = {
      user: { findFirst: jest.fn() },
      subscriptionPlanConfig: { findUnique: jest.fn() },
      subscription: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      sponsorProfile: { update: jest.fn() },
      vendorProfile: { update: jest.fn() },
      $transaction: jest.fn(async (cb) => {
        if (typeof cb === 'function') return cb(prisma);
        return cb;
      }),
    };

    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    outboxService = { enqueue: jest.fn().mockResolvedValue(undefined) };
    paymentProvider = {
      createOrGetCustomer: jest
        .fn()
        .mockResolvedValue({ id: 'cus_sponsor_1', email: 'sponsor@company.com' }),
      createCheckoutSession: jest.fn().mockResolvedValue({
        sessionId: 'cs_sub_session_1',
        checkoutUrl: 'https://checkout.stripe.com/cs_sub_session_1',
      }),
      cancelSubscription: jest
        .fn()
        .mockResolvedValue({ id: 'sub_1', status: 'canceled', cancelAtPeriodEnd: false }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: OutboxService, useValue: outboxService },
        { provide: PAYMENT_PROVIDER, useValue: paymentProvider },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
  });

  describe('createCheckout', () => {
    it('creates checkout session for sponsor monthly plan mapped to configured stripePriceId', async () => {
      prisma.user.findFirst.mockResolvedValue(sponsorUser);
      prisma.subscriptionPlanConfig.findUnique.mockResolvedValue(sponsorPlanConfig);
      prisma.subscription.findFirst.mockResolvedValue(null);

      const res = await service.createCheckout('user-sp-1', {
        plan: SubscriptionPlan.SPONSOR_MONTHLY,
      });

      expect(res.sessionId).toBe('cs_sub_session_1');
      expect(paymentProvider.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          lineItems: [{ price: 'price_sponsor_monthly_123', quantity: 1 }],
        }),
      );
    });

    it('rejects if an active unexpired subscription already exists', async () => {
      prisma.user.findFirst.mockResolvedValue(sponsorUser);
      prisma.subscriptionPlanConfig.findUnique.mockResolvedValue(sponsorPlanConfig);
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-active',
        status: SubscriptionStatus.ACTIVE,
        cancelAtPeriodEnd: false,
      });

      await expect(
        service.createCheckout('user-sp-1', { plan: SubscriptionPlan.SPONSOR_MONTHLY }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('cancelSubscription', () => {
    it('cancels subscription immediately and enqueues outbox event', async () => {
      const sub = {
        id: 'sub-1',
        userId: 'user-sp-1',
        status: SubscriptionStatus.ACTIVE,
        stripeSubscriptionId: 'sub_stripe_1',
        plan: SubscriptionPlan.SPONSOR_MONTHLY,
        amount: new Prisma.Decimal(1500),
        currency: 'SAR',
        interval: SubscriptionBillingInterval.MONTH,
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        planConfig: { name: 'Sponsor Monthly' },
      };

      prisma.subscription.findUnique.mockResolvedValue(sub);
      prisma.subscription.update.mockResolvedValue({
        ...sub,
        status: SubscriptionStatus.CANCELLED,
      });

      const res = await service.cancelSubscription('sub-1', 'user-sp-1', false, {
        immediately: true,
      });

      expect(paymentProvider.cancelSubscription).toHaveBeenCalledWith('sub_stripe_1', true);
      expect(outboxService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'SUBSCRIPTION_CANCELLED',
        }),
        expect.anything(),
      );
      expect(res.status).toBe(SubscriptionStatus.CANCELLED);
    });
  });
});
