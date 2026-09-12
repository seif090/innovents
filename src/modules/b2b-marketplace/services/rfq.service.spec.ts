import { Test, TestingModule } from '@nestjs/testing';
import { RfqService } from './rfq.service';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { QueueService } from '../../../infrastructure/queue/queue.service';
import { AccountStatus, RfqStatus } from '@prisma/client';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('RfqService', () => {
  let service: RfqService;
  let prisma: {
    user: { findFirst: jest.Mock };
    event: { findFirst: jest.Mock };
    vendorService: { findMany: jest.Mock };
    rfq: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    rfqClarification: { create: jest.Mock };
    quotation: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let outboxService: { enqueue: jest.Mock };
  let queueService: { addJob: jest.Mock };

  const sponsorUser = {
    id: 'sponsor-1',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
    userRoles: [{ role: { name: 'SPONSOR' } }],
  };

  const vendorUser = {
    id: 'vendor-1',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
    userRoles: [{ role: { name: 'VENDOR' } }],
  };

  const sampleRfq = {
    id: 'rfq-1',
    sponsorId: 'sponsor-1',
    vendorId: 'vendor-1',
    eventId: null,
    title: 'Stage Lighting & Audio',
    description: 'Provide lighting for summit',
    requirements: 'Must arrive 8am',
    status: RfqStatus.SENT,
    expiresAt: new Date(Date.now() + 86400000), // +1 day
    sentAt: new Date(),
    viewedAt: null,
    acceptedAt: null,
    rejectedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    rejectionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id: 'item-1',
        rfqId: 'rfq-1',
        vendorServiceId: null,
        description: 'LED spotlights',
        quantity: 4,
        unit: 'unit',
        targetPrice: 200,
        notes: null,
        createdAt: new Date(),
      },
    ],
    clarifications: [],
  };

  beforeEach(async () => {
    prisma = {
      user: { findFirst: jest.fn() },
      event: { findFirst: jest.fn() },
      vendorService: { findMany: jest.fn() },
      rfq: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      rfqClarification: { create: jest.fn() },
      quotation: { updateMany: jest.fn() },
      $transaction: jest.fn().mockImplementation((cb) => cb(prisma)),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    outboxService = { enqueue: jest.fn().mockResolvedValue(undefined) };
    queueService = { addJob: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RfqService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: OutboxService, useValue: outboxService },
        { provide: QueueService, useValue: queueService },
      ],
    }).compile();

    service = module.get<RfqService>(RfqService);
  });

  describe('createRfq', () => {
    it('should create and send RFQ, enqueue outbox, and schedule expiration job', async () => {
      prisma.user.findFirst.mockImplementation(({ where }) => {
        if (where.id === 'sponsor-1') return Promise.resolve(sponsorUser);
        if (where.id === 'vendor-1') return Promise.resolve(vendorUser);
        return Promise.resolve(null);
      });
      prisma.rfq.create.mockResolvedValue(sampleRfq);

      const dto = {
        vendorId: 'vendor-1',
        title: 'Stage Lighting & Audio',
        description: 'Provide lighting for summit',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        items: [{ description: 'LED spotlights', quantity: 4 }],
      };

      const result = await service.createRfq('sponsor-1', dto);

      expect(result.id).toBe('rfq-1');
      expect(result.status).toBe(RfqStatus.SENT);
      expect(outboxService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'RFQ_SENT' }),
        expect.anything(),
      );
      expect(queueService.addJob).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RFQ_SENT' }),
      );
    });

    it('should prevent sponsor from sending RFQ to themselves', async () => {
      prisma.user.findFirst.mockResolvedValue(sponsorUser);

      await expect(
        service.createRfq('sponsor-1', {
          vendorId: 'sponsor-1',
          title: 'Self RFQ',
          description: 'Self request',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          items: [{ description: 'Item', quantity: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject RFQ creation with past expiration date', async () => {
      prisma.user.findFirst.mockImplementation(({ where }) => {
        if (where.id === 'sponsor-1') return Promise.resolve(sponsorUser);
        if (where.id === 'vendor-1') return Promise.resolve(vendorUser);
        return Promise.resolve(null);
      });

      await expect(
        service.createRfq('sponsor-1', {
          vendorId: 'vendor-1',
          title: 'Expired RFQ',
          description: 'Past date',
          expiresAt: new Date(Date.now() - 10000).toISOString(),
          items: [{ description: 'Item', quantity: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getRfqById', () => {
    it('should transition SENT to VIEWED when accessed by recipient vendor', async () => {
      prisma.user.findFirst.mockResolvedValue(vendorUser);
      prisma.rfq.findUnique.mockResolvedValue({
        ...sampleRfq,
        status: RfqStatus.SENT,
        viewedAt: null,
      });
      prisma.rfq.update.mockResolvedValue({
        ...sampleRfq,
        status: RfqStatus.VIEWED,
        viewedAt: new Date(),
      });

      const result = await service.getRfqById('vendor-1', 'rfq-1');

      expect(result.status).toBe(RfqStatus.VIEWED);
      expect(outboxService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'RFQ_VIEWED' }),
      );
    });

    it('should forbid non-participant users from viewing RFQ', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'stranger-1',
        status: AccountStatus.ACTIVE,
        deletedAt: null,
        userRoles: [{ role: { name: 'SPONSOR' } }],
      });
      prisma.rfq.findUnique.mockResolvedValue(sampleRfq);

      await expect(service.getRfqById('stranger-1', 'rfq-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('requestClarification', () => {
    it('should add message and transition status to CLARIFICATION_REQUESTED if vendor', async () => {
      prisma.user.findFirst.mockResolvedValue(vendorUser);
      prisma.rfq.findUnique.mockResolvedValue({
        ...sampleRfq,
        status: RfqStatus.VIEWED,
      });
      prisma.rfqClarification.create.mockResolvedValue({
        id: 'clar-1',
        rfqId: 'rfq-1',
        senderId: 'vendor-1',
        message: 'Are cables included?',
        createdAt: new Date(),
      });
      prisma.rfq.update.mockResolvedValue({});

      await service.requestClarification('vendor-1', 'rfq-1', {
        message: 'Are cables included?',
      });

      expect(outboxService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'RFQ_CLARIFICATION_REQUESTED' }),
        expect.anything(),
      );
    });
  });

  describe('cancelRfq', () => {
    it('should cancel active RFQ by sponsor and reject pending quotations', async () => {
      prisma.user.findFirst.mockResolvedValue(sponsorUser);
      prisma.rfq.findUnique.mockResolvedValue(sampleRfq);
      prisma.rfq.update.mockResolvedValue({
        ...sampleRfq,
        status: RfqStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: 'Event cancelled',
      });

      const result = await service.cancelRfq('sponsor-1', 'rfq-1', {
        reason: 'Event cancelled',
      });

      expect(result.status).toBe(RfqStatus.CANCELLED);
      expect(prisma.quotation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { rfqId: 'rfq-1', status: 'PENDING' },
        }),
      );
      expect(outboxService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'RFQ_CANCELLED' }),
        expect.anything(),
      );
    });
  });
});
