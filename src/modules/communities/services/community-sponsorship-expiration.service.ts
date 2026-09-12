import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { OutboxService } from '../../outbox/outbox.service';
import { AuditService } from '../../audit/audit.service';
import { CommunitySponsorshipStatus } from '@prisma/client';

@Injectable()
export class CommunitySponsorshipExpirationService {
  private readonly logger = new Logger(CommunitySponsorshipExpirationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
    private readonly auditService: AuditService,
  ) {}

  async sweepExpiredSponsorships(): Promise<{ expiredCount: number }> {
    const now = new Date();

    const expiredList = await this.prisma.communitySponsorship.findMany({
      where: {
        status: CommunitySponsorshipStatus.ACTIVE,
        endsAt: { lte: now },
      },
      include: {
        community: true,
      },
    });

    let count = 0;
    for (const sponsorship of expiredList) {
      await this.prisma.$transaction(async (tx) => {
        await tx.communitySponsorship.update({
          where: { id: sponsorship.id },
          data: { status: CommunitySponsorshipStatus.EXPIRED },
        });

        const otherActive = await tx.communitySponsorship.findFirst({
          where: {
            communityId: sponsorship.communityId,
            status: CommunitySponsorshipStatus.ACTIVE,
            endsAt: { gt: now },
            id: { not: sponsorship.id },
          },
        });

        if (!otherActive) {
          await tx.community.update({
            where: { id: sponsorship.communityId },
            data: {
              isSponsored: false,
              isPinned: false,
              memberCapacity: 20,
            },
          });
        }

        await this.outboxService.enqueue(
          {
            aggregateType: 'COMMUNITY_SPONSORSHIP',
            aggregateId: sponsorship.id,
            eventType: 'COMMUNITY_SPONSORSHIP_EXPIRED',
            payload: {
              userId: sponsorship.userId,
              communityId: sponsorship.communityId,
              communityName: sponsorship.community.name,
              sponsorshipId: sponsorship.id,
            },
          },
          tx,
        );
      });

      await this.auditService.log({
        action: 'COMMUNITY_SPONSORSHIP_EXPIRED',
        resourceType: 'COMMUNITY_SPONSORSHIP',
        resourceId: sponsorship.id,
        actorUserId: sponsorship.userId,
        metadata: {
          communityId: sponsorship.communityId,
          endsAt: sponsorship.endsAt?.toISOString(),
        },
      });

      count++;
    }

    if (count > 0) {
      this.logger.log(`Swept and expired ${count} community sponsorship(s).`);
    }

    return { expiredCount: count };
  }
}
