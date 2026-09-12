import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import {
  PAYMENT_PROVIDER,
  PaymentProvider,
} from '../../../infrastructure/payments/payment.interface';
import { ReconcileQueryDto, ReconciliationReportDto } from '../dto/reconcile-query.dto';
import { PaymentStatus } from '@prisma/client';

@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
  ) {}

  async reconcileStalePendingPayments(query: ReconcileQueryDto): Promise<ReconciliationReportDto> {
    const olderThanMinutes = query.olderThanMinutes || 15;
    const dryRun = query.dryRun || false;
    const cutoffDate = new Date(Date.now() - olderThanMinutes * 60 * 1000);

    const stalePayments = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.PENDING,
        createdAt: { lte: cutoffDate },
      },
      include: {
        communitySponsorship: true,
      },
    });

    const report: ReconciliationReportDto = {
      scannedCount: stalePayments.length,
      reconciledSucceededCount: 0,
      reconciledFailedCount: 0,
      unresolvedCount: 0,
      errors: [],
    };

    for (const payment of stalePayments) {
      if (!payment.stripeCheckoutSessionId) {
        report.unresolvedCount++;
        continue;
      }

      try {
        const session = await this.paymentProvider.retrieveCheckoutSession(
          payment.stripeCheckoutSessionId,
        );

        if (session && session.paymentStatus === 'paid') {
          if (!dryRun) {
            await this.prisma.payment.update({
              where: { id: payment.id },
              data: {
                status: PaymentStatus.SUCCEEDED,
                paidAt: new Date(),
                stripePaymentIntentId: session.paymentIntentId || null,
              },
            });
          }
          report.reconciledSucceededCount++;
        } else if (session && session.status === 'expired') {
          if (!dryRun) {
            await this.prisma.payment.update({
              where: { id: payment.id },
              data: {
                status: PaymentStatus.FAILED,
                failedAt: new Date(),
              },
            });
          }
          report.reconciledFailedCount++;
        } else {
          report.unresolvedCount++;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to reconcile payment ${payment.id}: ${msg}`);
        report.errors.push(`Payment ${payment.id}: ${msg}`);
        report.unresolvedCount++;
      }
    }

    return report;
  }
}
