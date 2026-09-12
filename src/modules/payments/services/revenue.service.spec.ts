/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { RevenueService } from './revenue.service';
import { PrismaService } from '../../../database/prisma.service';
import { PaymentPurpose, PaymentStatus, Prisma } from '@prisma/client';

describe('RevenueService', () => {
  let service: RevenueService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      payment: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RevenueService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<RevenueService>(RevenueService);
  });

  it('aggregates gross, refunds, and net revenue with exact decimal calculations', async () => {
    prisma.payment.findMany.mockResolvedValue([
      {
        id: 'p1',
        amount: new Prisma.Decimal(500),
        refundAmount: null,
        status: PaymentStatus.SUCCEEDED,
        purpose: PaymentPurpose.COMMUNITY_SPONSORSHIP,
      },
      {
        id: 'p2',
        amount: new Prisma.Decimal(1500),
        refundAmount: null,
        status: PaymentStatus.SUCCEEDED,
        purpose: PaymentPurpose.SUBSCRIPTION,
      },
      {
        id: 'p3',
        amount: new Prisma.Decimal(500),
        refundAmount: new Prisma.Decimal(500),
        status: PaymentStatus.REFUNDED,
        purpose: PaymentPurpose.COMMUNITY_SPONSORSHIP,
      },
    ]);

    const report = await service.getRevenueReport({ currency: 'SAR' });

    expect(report.totalGrossRevenue).toBe(2500);
    expect(report.totalRefunds).toBe(500);
    expect(report.netRevenue).toBe(2000);
    expect(report.successfulTransactions).toBe(2);
    expect(report.refundedTransactions).toBe(1);
    expect(report.breakdownByPurpose[PaymentPurpose.COMMUNITY_SPONSORSHIP]!.gross).toBe(1000);
    expect(report.breakdownByPurpose[PaymentPurpose.COMMUNITY_SPONSORSHIP]!.refunds).toBe(500);
    expect(report.breakdownByPurpose[PaymentPurpose.COMMUNITY_SPONSORSHIP]!.net).toBe(500);
    expect(report.breakdownByPurpose[PaymentPurpose.SUBSCRIPTION]!.net).toBe(1500);
  });
});
