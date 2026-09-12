/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { PrismaService } from '../../../database/prisma.service';
import { PAYMENT_PROVIDER } from '../../../infrastructure/payments/payment.interface';
import { PaymentStatus } from '@prisma/client';

describe('PaymentReconciliationService', () => {
  let service: PaymentReconciliationService;
  let prisma: any;
  let paymentProvider: { retrieveCheckoutSession: jest.Mock };

  beforeEach(async () => {
    prisma = {
      payment: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    paymentProvider = {
      retrieveCheckoutSession: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentReconciliationService,
        { provide: PrismaService, useValue: prisma },
        { provide: PAYMENT_PROVIDER, useValue: paymentProvider },
      ],
    }).compile();

    service = module.get<PaymentReconciliationService>(PaymentReconciliationService);
  });

  it('reconciles paid session to SUCCEEDED and expired session to FAILED', async () => {
    prisma.payment.findMany.mockResolvedValue([
      {
        id: 'p-paid',
        status: PaymentStatus.PENDING,
        stripeCheckoutSessionId: 'cs_paid_1',
      },
      {
        id: 'p-expired',
        status: PaymentStatus.PENDING,
        stripeCheckoutSessionId: 'cs_exp_2',
      },
    ]);

    paymentProvider.retrieveCheckoutSession.mockImplementation(async (id: string) => {
      if (id === 'cs_paid_1')
        return { id, paymentStatus: 'paid', status: 'complete', paymentIntentId: 'pi_1' };
      if (id === 'cs_exp_2') return { id, paymentStatus: 'unpaid', status: 'expired' };
      return null;
    });

    const res = await service.reconcileStalePendingPayments({
      olderThanMinutes: 15,
      dryRun: false,
    });

    expect(res.scannedCount).toBe(2);
    expect(res.reconciledSucceededCount).toBe(1);
    expect(res.reconciledFailedCount).toBe(1);
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p-paid' },
        data: expect.objectContaining({ status: PaymentStatus.SUCCEEDED }),
      }),
    );
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p-expired' },
        data: expect.objectContaining({ status: PaymentStatus.FAILED }),
      }),
    );
  });
});
