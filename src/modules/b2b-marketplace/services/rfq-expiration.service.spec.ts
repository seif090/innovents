import { Test, TestingModule } from '@nestjs/testing';
import { RfqExpirationService } from './rfq-expiration.service';
import { PrismaService } from '../../../database/prisma.service';
import { OutboxService } from '../../outbox/outbox.service';
import { QuotationStatus, RfqStatus } from '@prisma/client';

describe('RfqExpirationService', () => {
  let service: RfqExpirationService;
  let prisma: {
    rfq: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    quotation: {
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let outboxService: { enqueue: jest.Mock };

  beforeEach(async () => {
    prisma = {
      rfq: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      quotation: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((cb) => cb(prisma)),
    };
    outboxService = { enqueue: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RfqExpirationService,
        { provide: PrismaService, useValue: prisma },
        { provide: OutboxService, useValue: outboxService },
      ],
    }).compile();

    service = module.get<RfqExpirationService>(RfqExpirationService);
  });

  describe('expireRfq', () => {
    it('should transition non-terminal RFQ and pending quotations to EXPIRED', async () => {
      prisma.rfq.findUnique.mockResolvedValue({
        id: 'rfq-1',
        sponsorId: 'sponsor-1',
        vendorId: 'vendor-1',
        title: 'Tech Equipment',
        status: RfqStatus.SENT,
      });

      const result = await service.expireRfq('rfq-1');

      expect(result).toBe(true);
      expect(prisma.rfq.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rfq-1' },
          data: { status: RfqStatus.EXPIRED },
        }),
      );
      expect(prisma.quotation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { rfqId: 'rfq-1', status: QuotationStatus.PENDING },
          data: { status: QuotationStatus.EXPIRED },
        }),
      );
      expect(outboxService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'RFQ_EXPIRED' }),
        expect.anything(),
      );
    });

    it('should skip expiration if RFQ is already in terminal state', async () => {
      prisma.rfq.findUnique.mockResolvedValue({
        id: 'rfq-1',
        status: RfqStatus.ACCEPTED,
      });

      const result = await service.expireRfq('rfq-1');

      expect(result).toBe(false);
      expect(prisma.rfq.update).not.toHaveBeenCalled();
    });
  });

  describe('sweepExpiredRfqs', () => {
    it('should query past-due non-terminal RFQs and expire them', async () => {
      prisma.rfq.findMany.mockResolvedValue([
        { id: 'rfq-1', sponsorId: 's-1', vendorId: 'v-1', title: 'R1', status: RfqStatus.SENT },
        { id: 'rfq-2', sponsorId: 's-2', vendorId: 'v-2', title: 'R2', status: RfqStatus.VIEWED },
      ]);
      prisma.rfq.findUnique
        .mockResolvedValueOnce({
          id: 'rfq-1',
          sponsorId: 's-1',
          vendorId: 'v-1',
          title: 'R1',
          status: RfqStatus.SENT,
        })
        .mockResolvedValueOnce({
          id: 'rfq-2',
          sponsorId: 's-2',
          vendorId: 'v-2',
          title: 'R2',
          status: RfqStatus.VIEWED,
        });

      const count = await service.sweepExpiredRfqs();

      expect(count).toBe(2);
      expect(outboxService.enqueue).toHaveBeenCalledTimes(2);
    });
  });
});
