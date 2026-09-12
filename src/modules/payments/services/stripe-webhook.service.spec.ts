/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { StripeWebhookService } from './stripe-webhook.service';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { PAYMENT_PROVIDER } from '../../../infrastructure/payments/payment.interface';
import { PaymentPurpose, PaymentStatus, Prisma, StripeWebhookStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('StripeWebhookService', () => {
  let service: StripeWebhookService;
  let prisma: any;
  let auditService: { log: jest.Mock };
  let outboxService: { enqueue: jest.Mock };
  let paymentProvider: {
    verifyWebhookSignature: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      stripeWebhookEvent: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      payment: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      communitySponsorshipPlan: {
        findUnique: jest.fn(),
      },
      communitySponsorship: {
        create: jest.fn(),
      },
      community: {
        update: jest.fn(),
      },
      subscription: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      subscriptionPlanConfig: {
        findUnique: jest.fn(),
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
      verifyWebhookSignature: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeWebhookService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: OutboxService, useValue: outboxService },
        { provide: PAYMENT_PROVIDER, useValue: paymentProvider },
      ],
    }).compile();

    service = module.get<StripeWebhookService>(StripeWebhookService);
  });

  describe('handleWebhook', () => {
    it('throws BadRequestException if signature is invalid', async () => {
      paymentProvider.verifyWebhookSignature.mockImplementation(() => {
        throw new Error('Signature verification failed');
      });

      await expect(service.handleWebhook(Buffer.from('bad'), 'bad-sig')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('skips duplicate already PROCESSED webhook event (idempotency)', async () => {
      paymentProvider.verifyWebhookSignature.mockResolvedValue({
        id: 'evt_processed_1',
        type: 'checkout.session.completed',
        data: {},
      });

      prisma.stripeWebhookEvent.findUnique.mockResolvedValue({
        id: 'wb-1',
        providerEventId: 'evt_processed_1',
        processingStatus: StripeWebhookStatus.PROCESSED,
      });

      const res = await service.handleWebhook(Buffer.from('ok'), 'valid-sig');
      expect(res.deduplicated).toBe(true);
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('processes checkout.session.completed and activates Community Sponsorship', async () => {
      paymentProvider.verifyWebhookSignature.mockResolvedValue({
        id: 'evt_new_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_session_1',
            mode: 'payment',
            payment_intent: 'pi_test_1',
            metadata: {
              paymentId: 'payment-1',
              paymentPurpose: PaymentPurpose.COMMUNITY_SPONSORSHIP,
              communityId: 'comm-1',
              planId: 'plan-1',
              sponsorProfileId: 'sponsor-prof-1',
              userId: 'user-1',
            },
          },
        },
      });

      prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
      prisma.stripeWebhookEvent.create.mockResolvedValue({ id: 'wb-new' });

      prisma.payment.findUnique.mockResolvedValue({
        id: 'payment-1',
        amount: new Prisma.Decimal(500),
        currency: 'SAR',
        status: PaymentStatus.PENDING,
        userId: 'user-1',
        sponsorProfileId: 'sponsor-prof-1',
      });

      prisma.communitySponsorshipPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        memberCapacity: 500,
        durationDays: 30,
      });

      prisma.communitySponsorship.create.mockResolvedValue({ id: 'cs-1' });

      const res = await service.handleWebhook(Buffer.from('ok'), 'valid-sig');

      expect(res.received).toBe(true);
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'payment-1' },
          data: expect.objectContaining({ status: PaymentStatus.SUCCEEDED }),
        }),
      );
      expect(prisma.community.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'comm-1' },
          data: expect.objectContaining({ isSponsored: true, isPinned: true, memberCapacity: 500 }),
        }),
      );
      expect(outboxService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'COMMUNITY_SPONSORSHIP_ACTIVATED',
        }),
        expect.anything(),
      );
    });
  });
});
