import { Test, TestingModule } from '@nestjs/testing';
import { SponsorAdsService } from './sponsor-ads.service';
import { PrismaService } from '../../../database/prisma.service';
import { OutboxService } from '../../outbox/outbox.service';
import { AuditService } from '../../audit/audit.service';
import { AccountStatus, SponsorAdPlacement, SponsorAdStatus } from '@prisma/client';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

describe('SponsorAdsService', () => {
  let service: SponsorAdsService;
  let prisma: {
    user: { findFirst: jest.Mock };
    event: { findFirst: jest.Mock };
    sponsorAd: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let outboxService: { enqueue: jest.Mock };
  let auditService: { log: jest.Mock };

  const activeSponsor = {
    id: 'sponsor-1',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
    userRoles: [{ role: { name: 'SPONSOR' } }],
  };

  const sampleAd = {
    id: 'ad-1',
    sponsorId: 'sponsor-1',
    eventId: 'event-1',
    title: 'Cloud AI Suite',
    description: 'Next-gen enterprise cloud',
    imageUrl: 'https://example.com/banner.jpg',
    destinationUrl: 'https://example.com',
    placement: SponsorAdPlacement.MARKETPLACE,
    status: SponsorAdStatus.DRAFT,
    startsAt: new Date(Date.now() - 1000),
    endsAt: new Date(Date.now() + 86400000 * 5),
    deletedAt: null,
    sponsor: { sponsorProfile: { companyName: 'Google Cloud' } },
  };

  beforeEach(async () => {
    prisma = {
      user: { findFirst: jest.fn() },
      event: { findFirst: jest.fn() },
      sponsorAd: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => {
        const txPrisma = {
          sponsorAd: {
            update: jest.fn().mockResolvedValue({
              ...sampleAd,
              status: SponsorAdStatus.APPROVED,
            }),
          },
        };
        return cb(txPrisma);
      }),
    };
    outboxService = { enqueue: jest.fn().mockResolvedValue(undefined) };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SponsorAdsService,
        { provide: PrismaService, useValue: prisma },
        { provide: OutboxService, useValue: outboxService },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<SponsorAdsService>(SponsorAdsService);
  });

  describe('createAd', () => {
    it('should create ad in DRAFT status for active sponsor', async () => {
      prisma.user.findFirst.mockResolvedValue(activeSponsor);
      prisma.event.findFirst.mockResolvedValue({ id: 'event-1' });
      prisma.sponsorAd.create.mockResolvedValue(sampleAd);

      const result = await service.createAd('sponsor-1', {
        title: 'Cloud AI Suite',
        description: 'Next-gen enterprise cloud',
        imageUrl: 'https://example.com/banner.jpg',
        destinationUrl: 'https://example.com',
        startsAt: new Date(Date.now() + 1000).toISOString(),
        endsAt: new Date(Date.now() + 86400000).toISOString(),
      });

      expect(result.status).toEqual(SponsorAdStatus.DRAFT);
      expect(prisma.sponsorAd.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: SponsorAdStatus.DRAFT }),
        }),
      );
    });

    it('should reject ad creation if endsAt <= startsAt', async () => {
      prisma.user.findFirst.mockResolvedValue(activeSponsor);

      await expect(
        service.createAd('sponsor-1', {
          title: 'Invalid Dates',
          description: 'Desc',
          imageUrl: 'https://example.com/b.jpg',
          destinationUrl: 'https://example.com',
          startsAt: new Date(Date.now() + 86400000).toISOString(),
          endsAt: new Date(Date.now() + 1000).toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('submitAd & IDOR', () => {
    it('should submit DRAFT ad to PENDING_REVIEW and enqueue outbox', async () => {
      prisma.user.findFirst.mockResolvedValue(activeSponsor);
      prisma.sponsorAd.findFirst.mockResolvedValue(sampleAd);
      prisma.sponsorAd.update.mockResolvedValue({
        ...sampleAd,
        status: SponsorAdStatus.PENDING_REVIEW,
      });

      const result = await service.submitAd('sponsor-1', 'ad-1');
      expect(result.status).toEqual(SponsorAdStatus.PENDING_REVIEW);
      expect(outboxService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'SPONSOR_AD_SUBMITTED' }),
      );
    });

    it('should prevent another sponsor from modifying ad (IDOR Defense)', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...activeSponsor,
        id: 'sponsor-2',
      });
      prisma.sponsorAd.findFirst.mockResolvedValue(sampleAd);

      await expect(service.submitAd('sponsor-2', 'ad-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('approveAd & rejectAd (Admin moderation)', () => {
    it('should allow admin to approve ad and enqueue outbox', async () => {
      prisma.sponsorAd.findFirst.mockResolvedValue({
        ...sampleAd,
        status: SponsorAdStatus.PENDING_REVIEW,
      });

      const result = await service.approveAd('admin-1', 'ad-1');
      expect(result).toBeDefined();
      expect(outboxService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'SPONSOR_AD_APPROVED' }),
        expect.anything(),
      );
    });

    it('should allow admin to reject ad with reason and enqueue outbox', async () => {
      prisma.sponsorAd.findFirst.mockResolvedValue({
        ...sampleAd,
        status: SponsorAdStatus.PENDING_REVIEW,
      });
      prisma.$transaction.mockImplementationOnce(async (cb: (tx: unknown) => unknown) => {
        const txPrisma = {
          sponsorAd: {
            update: jest.fn().mockResolvedValue({
              ...sampleAd,
              status: SponsorAdStatus.REJECTED,
              rejectionReason: 'Resolution too low',
            }),
          },
        };
        return cb(txPrisma);
      });

      const result = await service.rejectAd('admin-1', 'ad-1', {
        reason: 'Resolution too low',
      });
      expect(result.status).toEqual(SponsorAdStatus.REJECTED);
      expect(outboxService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'SPONSOR_AD_REJECTED' }),
        expect.anything(),
      );
    });
  });

  describe('discoverPublicAds', () => {
    it('should query only active and approved ads within valid dates', async () => {
      prisma.sponsorAd.count.mockResolvedValue(1);
      prisma.sponsorAd.findMany.mockResolvedValue([
        { ...sampleAd, status: SponsorAdStatus.PUBLISHED },
      ]);

      const result = await service.discoverPublicAds({});
      expect(result.total).toEqual(1);
      expect(prisma.sponsorAd.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: [SponsorAdStatus.APPROVED, SponsorAdStatus.PUBLISHED] },
            startsAt: expect.any(Object),
            endsAt: expect.any(Object),
          }),
        }),
      );
    });
  });
});
