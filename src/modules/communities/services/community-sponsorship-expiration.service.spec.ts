/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { CommunitySponsorshipExpirationService } from './community-sponsorship-expiration.service';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { CommunitySponsorshipStatus } from '@prisma/client';

describe('CommunitySponsorshipExpirationService', () => {
  let service: CommunitySponsorshipExpirationService;
  let prisma: any;
  let auditService: { log: jest.Mock };
  let outboxService: { enqueue: jest.Mock };

  beforeEach(async () => {
    prisma = {
      communitySponsorship: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      community: {
        update: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => {
        if (typeof cb === 'function') return cb(prisma);
        return cb;
      }),
    };

    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    outboxService = { enqueue: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunitySponsorshipExpirationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: OutboxService, useValue: outboxService },
      ],
    }).compile();

    service = module.get<CommunitySponsorshipExpirationService>(
      CommunitySponsorshipExpirationService,
    );
  });

  it('marks expired sponsorships and reverts community capacity to standard 20', async () => {
    prisma.communitySponsorship.findMany.mockResolvedValue([
      {
        id: 'sponsorship-exp-1',
        communityId: 'comm-1',
        userId: 'sponsor-user-1',
        status: CommunitySponsorshipStatus.ACTIVE,
        endsAt: new Date(Date.now() - 1000),
        community: { name: 'AI Leaders' },
      },
    ]);

    prisma.communitySponsorship.findFirst.mockResolvedValue(null); // No other active sponsorship

    const res = await service.sweepExpiredSponsorships();

    expect(res.expiredCount).toBe(1);
    expect(prisma.communitySponsorship.update).toHaveBeenCalledWith({
      where: { id: 'sponsorship-exp-1' },
      data: { status: CommunitySponsorshipStatus.EXPIRED },
    });
    expect(prisma.community.update).toHaveBeenCalledWith({
      where: { id: 'comm-1' },
      data: { isSponsored: false, isPinned: false, memberCapacity: 20 },
    });
    expect(outboxService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'COMMUNITY_SPONSORSHIP_EXPIRED',
      }),
      expect.anything(),
    );
  });
});
