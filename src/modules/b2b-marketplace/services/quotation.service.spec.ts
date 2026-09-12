import { Test, TestingModule } from '@nestjs/testing';
import { QuotationService } from './quotation.service';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { AccountStatus, Prisma, QuotationStatus, RfqStatus } from '@prisma/client';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

describe('QuotationService', () => {
  let service: QuotationService;
  let prisma: {
    user: { findFirst: jest.Mock };
    rfq: {
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    quotation: {
      aggregate: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let outboxService: { enqueue: jest.Mock };

  const vendorUser = {
    id: 'vendor-1',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
    userRoles: [{ role: { name: 'VENDOR' } }],
  };

  const sponsorUser = {
    id: 'sponsor-1',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
    userRoles: [{ role: { name: 'SPONSOR' } }],
  };

  const activeRfq = {
    id: 'rfq-1',
    sponsorId: 'sponsor-1',
    vendorId: 'vendor-1',
    title: 'Sound setup',
    status: RfqStatus.VIEWED,
    expiresAt: new Date(Date.now() + 86400000),
    items: [],
  };

  const sampleQuotation = {
    id: 'quot-1',
    rfqId: 'rfq-1',
    vendorId: 'vendor-1',
    version: 1,
    status: QuotationStatus.PENDING,
    subtotal: new Prisma.Decimal(1000),
    tax: new Prisma.Decimal(150),
    discount: new Prisma.Decimal(50),
    total: new Prisma.Decimal(1100),
    currency: 'SAR',
    validUntil: new Date(Date.now() + 86400000),
    notes: 'Quote terms',
    acceptedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id: 'qi-1',
        quotationId: 'quot-1',
        rfqItemId: null,
        description: 'Speakers',
        quantity: 2,
        unitPrice: new Prisma.Decimal(500),
        total: new Prisma.Decimal(1000),
        notes: null,
      },
    ],
  };

  beforeEach(async () => {
    prisma = {
      user: { findFirst: jest.fn() },
      rfq: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      quotation: {
        aggregate: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((cb) => cb(prisma)),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    outboxService = { enqueue: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: OutboxService, useValue: outboxService },
      ],
    }).compile();

    service = module.get<QuotationService>(QuotationService);
  });

  describe('createQuotation', () => {
    it('should calculate server-side totals authoritatively and supersede prior pending version', async () => {
      prisma.user.findFirst.mockResolvedValue(vendorUser);
      prisma.rfq.findUnique.mockResolvedValue(activeRfq);
      prisma.quotation.aggregate.mockResolvedValue({ _max: { version: 1 } });
      prisma.quotation.create.mockResolvedValue({
        ...sampleQuotation,
        version: 2,
      });

      const dto = {
        rfqId: 'rfq-1',
        validUntil: new Date(Date.now() + 86400000).toISOString(),
        currency: 'SAR',
        tax: 150,
        discount: 50,
        notes: 'Quote terms',
        items: [{ description: 'Speakers', quantity: 2, unitPrice: 500 }],
      };

      const result = await service.createQuotation('vendor-1', dto);

      expect(result.version).toBe(2);
      expect(prisma.quotation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { rfqId: 'rfq-1', status: QuotationStatus.PENDING },
          data: { status: QuotationStatus.SUPERSEDED },
        }),
      );
      expect(prisma.rfq.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rfq-1' },
          data: { status: RfqStatus.QUOTED },
        }),
      );
      expect(outboxService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'RFQ_QUOTED' }),
        expect.anything(),
      );
    });

    it('should reject quotation when submitted by unauthorized vendor', async () => {
      prisma.user.findFirst.mockResolvedValue(vendorUser);
      prisma.rfq.findUnique.mockResolvedValue({
        ...activeRfq,
        vendorId: 'other-vendor',
      });

      await expect(
        service.createQuotation('vendor-1', {
          rfqId: 'rfq-1',
          validUntil: new Date(Date.now() + 86400000).toISOString(),
          items: [{ description: 'Test', quantity: 1, unitPrice: 100 }],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject quotation if calculation results in negative total', async () => {
      prisma.user.findFirst.mockResolvedValue(vendorUser);
      prisma.rfq.findUnique.mockResolvedValue(activeRfq);

      await expect(
        service.createQuotation('vendor-1', {
          rfqId: 'rfq-1',
          validUntil: new Date(Date.now() + 86400000).toISOString(),
          discount: 5000,
          items: [{ description: 'Test', quantity: 1, unitPrice: 100 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('acceptQuotation', () => {
    it('should accept quotation and transition RFQ status to ACCEPTED atomically', async () => {
      prisma.user.findFirst.mockResolvedValue(sponsorUser);
      prisma.quotation.findUnique.mockResolvedValue({
        ...sampleQuotation,
        rfq: activeRfq,
      });
      prisma.rfq.updateMany.mockResolvedValue({ count: 1 });
      prisma.quotation.update.mockResolvedValue({
        ...sampleQuotation,
        status: QuotationStatus.ACCEPTED,
        acceptedAt: new Date(),
      });

      const result = await service.acceptQuotation('sponsor-1', 'quot-1');

      expect(result.status).toBe(QuotationStatus.ACCEPTED);
      expect(outboxService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'RFQ_ACCEPTED' }),
        expect.anything(),
      );
    });

    it('should throw ConflictException on double-acceptance race', async () => {
      prisma.user.findFirst.mockResolvedValue(sponsorUser);
      prisma.quotation.findUnique.mockResolvedValue({
        ...sampleQuotation,
        rfq: activeRfq,
      });
      // Simulate another thread already accepted the RFQ
      prisma.rfq.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.acceptQuotation('sponsor-1', 'quot-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should prevent non-sponsor from accepting quotation', async () => {
      prisma.user.findFirst.mockResolvedValue(sponsorUser);
      prisma.quotation.findUnique.mockResolvedValue({
        ...sampleQuotation,
        rfq: { ...activeRfq, sponsorId: 'other-sponsor' },
      });

      await expect(service.acceptQuotation('sponsor-1', 'quot-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('rejectQuotation', () => {
    it('should reject pending quotation by sponsor and enqueue outbox', async () => {
      prisma.user.findFirst.mockResolvedValue(sponsorUser);
      prisma.quotation.findUnique.mockResolvedValue({
        ...sampleQuotation,
        rfq: activeRfq,
      });
      prisma.quotation.update.mockResolvedValue({
        ...sampleQuotation,
        status: QuotationStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason: 'Over budget',
      });

      const result = await service.rejectQuotation('sponsor-1', 'quot-1', {
        reason: 'Over budget',
      });

      expect(result.status).toBe(QuotationStatus.REJECTED);
      expect(outboxService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'RFQ_REJECTED' }),
        expect.anything(),
      );
    });
  });
});
