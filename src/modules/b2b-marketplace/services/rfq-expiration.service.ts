import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { OutboxService } from '../../outbox/outbox.service';
import { RfqStatus, QuotationStatus } from '@prisma/client';

@Injectable()
export class RfqExpirationService {
  private readonly logger = new Logger(RfqExpirationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
  ) {}

  /**
   * Expires an individual RFQ if eligible
   */
  async expireRfq(rfqId: string): Promise<boolean> {
    const rfq = await this.prisma.rfq.findUnique({
      where: { id: rfqId },
    });

    if (!rfq) {
      this.logger.warn(`RFQ ${rfqId} not found for expiration`);
      return false;
    }

    const nonTerminalStatuses: RfqStatus[] = [
      RfqStatus.DRAFT,
      RfqStatus.SENT,
      RfqStatus.VIEWED,
      RfqStatus.CLARIFICATION_REQUESTED,
    ];

    if (!nonTerminalStatuses.includes(rfq.status)) {
      this.logger.debug(`RFQ ${rfqId} is in status ${rfq.status}, skipping expiration`);
      return false;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.rfq.update({
        where: { id: rfqId },
        data: { status: RfqStatus.EXPIRED },
      });

      // Mark any pending quotations as expired
      await tx.quotation.updateMany({
        where: {
          rfqId,
          status: QuotationStatus.PENDING,
        },
        data: {
          status: QuotationStatus.EXPIRED,
        },
      });

      await this.outboxService.enqueue(
        {
          eventType: 'RFQ_EXPIRED',
          aggregateType: 'rfq',
          aggregateId: rfqId,
          payload: {
            rfqId,
            sponsorId: rfq.sponsorId,
            vendorId: rfq.vendorId,
            title: rfq.title,
            expiredAt: new Date().toISOString(),
          },
        },
        tx,
      );
    });

    this.logger.log(`RFQ ${rfqId} successfully transitioned to EXPIRED`);
    return true;
  }

  /**
   * Sweeps and transitions all past-due non-terminal RFQs to EXPIRED
   */
  async sweepExpiredRfqs(): Promise<number> {
    const now = new Date();

    const expiredRfqs = await this.prisma.rfq.findMany({
      where: {
        expiresAt: { lte: now },
        status: {
          in: [
            RfqStatus.DRAFT,
            RfqStatus.SENT,
            RfqStatus.VIEWED,
            RfqStatus.CLARIFICATION_REQUESTED,
          ],
        },
      },
      take: 100,
    });

    let count = 0;
    for (const rfq of expiredRfqs) {
      try {
        const success = await this.expireRfq(rfq.id);
        if (success) count++;
      } catch (err) {
        this.logger.error(`Error expiring RFQ ${rfq.id}: ${err}`);
      }
    }

    if (count > 0) {
      this.logger.log(`Swept and expired ${count} past-due RFQs`);
    }

    return count;
  }
}
