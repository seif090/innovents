import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import {
  RevenueReportQueryDto,
  RevenueReportResponseDto,
  PurposeRevenueBreakdownDto,
} from '../dto/revenue-report.dto';
import { PaymentPurpose, PaymentStatus, Prisma } from '@prisma/client';

@Injectable()
export class RevenueService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aggregate gross revenue, refunds, and net revenue with exact decimal calculations
   */
  async getRevenueReport(query: RevenueReportQueryDto): Promise<RevenueReportResponseDto> {
    const currency = (query.currency || 'SAR').toUpperCase();

    const where: Prisma.PaymentWhereInput = {
      currency,
      status: {
        in: [PaymentStatus.SUCCEEDED, PaymentStatus.REFUNDED, PaymentStatus.PARTIALLY_REFUNDED],
      },
    };

    if (query.purpose) {
      where.purpose = query.purpose;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const payments = await this.prisma.payment.findMany({
      where,
      select: {
        id: true,
        amount: true,
        refundAmount: true,
        status: true,
        purpose: true,
      },
    });

    let totalGross = new Prisma.Decimal(0);
    let totalRefunds = new Prisma.Decimal(0);
    let successfulCount = 0;
    let refundedCount = 0;

    const breakdown: Record<
      string,
      { gross: Prisma.Decimal; refunds: Prisma.Decimal; count: number }
    > = {
      [PaymentPurpose.COMMUNITY_SPONSORSHIP]: {
        gross: new Prisma.Decimal(0),
        refunds: new Prisma.Decimal(0),
        count: 0,
      },
      [PaymentPurpose.SUBSCRIPTION]: {
        gross: new Prisma.Decimal(0),
        refunds: new Prisma.Decimal(0),
        count: 0,
      },
    };

    for (const p of payments) {
      const amt = p.amount;
      const ref = p.refundAmount || new Prisma.Decimal(0);

      totalGross = totalGross.plus(amt);
      totalRefunds = totalRefunds.plus(ref);

      if (p.status === PaymentStatus.SUCCEEDED) {
        successfulCount++;
      } else if (
        p.status === PaymentStatus.REFUNDED ||
        p.status === PaymentStatus.PARTIALLY_REFUNDED
      ) {
        refundedCount++;
      }

      const purposeKey = p.purpose;
      if (!breakdown[purposeKey]) {
        breakdown[purposeKey] = {
          gross: new Prisma.Decimal(0),
          refunds: new Prisma.Decimal(0),
          count: 0,
        };
      }

      breakdown[purposeKey].gross = breakdown[purposeKey].gross.plus(amt);
      breakdown[purposeKey].refunds = breakdown[purposeKey].refunds.plus(ref);
      breakdown[purposeKey].count++;
    }

    const netRevenue = totalGross.minus(totalRefunds);

    const formattedBreakdown: Record<string, PurposeRevenueBreakdownDto> = {};
    for (const [k, v] of Object.entries(breakdown)) {
      formattedBreakdown[k] = {
        gross: v.gross.toNumber(),
        refunds: v.refunds.toNumber(),
        net: v.gross.minus(v.refunds).toNumber(),
        count: v.count,
      };
    }

    return {
      totalGrossRevenue: totalGross.toNumber(),
      totalRefunds: totalRefunds.toNumber(),
      netRevenue: netRevenue.toNumber(),
      currency,
      successfulTransactions: successfulCount,
      refundedTransactions: refundedCount,
      breakdownByPurpose: formattedBreakdown,
    };
  }
}
