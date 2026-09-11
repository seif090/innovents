import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { OutboxStatus, NotificationType } from '@prisma/client';
import { NotificationOrchestratorService } from '../services/notification-orchestrator.service';
import { NotificationFanoutService } from '../services/notification-fanout.service';
import { NOTIFICATION_LIMITS } from '../constants/notifications.constants';

interface RawOutboxRecord {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  attempts: number;
}

@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);
  private readonly batchSize: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: NotificationOrchestratorService,
    private readonly fanout: NotificationFanoutService,
    private readonly configService: ConfigService,
  ) {
    this.batchSize = this.configService.get<number>('notifications.outboxBatchSize', 50);
    this.maxAttempts = this.configService.get<number>(
      'notifications.maxDeliveryAttempts',
      NOTIFICATION_LIMITS.DEFAULT_MAX_OUTBOX_ATTEMPTS,
    );
  }

  /**
   * Recovers records stuck in PROCESSING state longer than the timeout threshold
   */
  async recoverStaleProcessing(): Promise<number> {
    const staleThreshold = new Date(
      Date.now() - NOTIFICATION_LIMITS.DEFAULT_STALE_PROCESSING_TIMEOUT_MS,
    );

    try {
      // Find stale records
      const staleRecords = await this.prisma.outboxEvent.findMany({
        where: {
          status: OutboxStatus.PROCESSING,
          processingStartedAt: { lt: staleThreshold },
        },
        take: this.batchSize,
      });

      for (const record of staleRecords) {
        const nextAttempts = record.attempts + 1;
        if (nextAttempts >= this.maxAttempts) {
          await this.prisma.outboxEvent.update({
            where: { id: record.id },
            data: {
              status: OutboxStatus.DEAD_LETTER,
              attempts: nextAttempts,
              lastError: 'Stale processing timeout exceeded maximum retry attempts',
            },
          });
          this.logger.error(`Outbox record ${record.id} moved to DEAD_LETTER after stale timeouts`);
        } else {
          await this.prisma.outboxEvent.update({
            where: { id: record.id },
            data: {
              status: OutboxStatus.PENDING,
              attempts: nextAttempts,
              processingStartedAt: null,
            },
          });
          this.logger.warn(`Recovered stale outbox record ${record.id} back to PENDING`);
        }
      }

      return staleRecords.length;
    } catch (err) {
      this.logger.error(`Error during stale outbox recovery: ${err}`);
      return 0;
    }
  }

  /**
   * Claims and processes a batch of pending outbox events using PostgreSQL row locking
   */
  async processBatch(): Promise<number> {
    // 1. First recover any stale processing rows
    await this.recoverStaleProcessing();

    // 2. Claim pending records atomically using FOR UPDATE SKIP LOCKED
    let claimedEvents: RawOutboxRecord[] = [];
    try {
      claimedEvents = await this.prisma.$queryRaw<RawOutboxRecord[]>`
        SELECT id, event_type, aggregate_type, aggregate_id, payload, attempts
        FROM outbox_events
        WHERE status = 'PENDING'::outbox_status
        ORDER BY created_at ASC
        LIMIT ${this.batchSize}
        FOR UPDATE SKIP LOCKED;
      `;
    } catch (err) {
      this.logger.debug(
        `Direct FOR UPDATE SKIP LOCKED query failed, falling back to standard claim: ${err}`,
      );
      // Fallback for mock/test environments
      const pending = await this.prisma.outboxEvent.findMany({
        where: { status: OutboxStatus.PENDING },
        take: this.batchSize,
        orderBy: { createdAt: 'asc' },
      });
      claimedEvents = pending.map((p) => ({
        id: p.id,
        event_type: p.eventType,
        aggregate_type: p.aggregateType,
        aggregate_id: p.aggregateId,
        payload: p.payload as Record<string, unknown>,
        attempts: p.attempts,
      }));
    }

    if (!claimedEvents || claimedEvents.length === 0) {
      return 0;
    }

    const eventIds = claimedEvents.map((e) => e.id);
    await this.prisma.outboxEvent.updateMany({
      where: { id: { in: eventIds } },
      data: {
        status: OutboxStatus.PROCESSING,
        processingStartedAt: new Date(),
      },
    });

    // 3. Process each claimed event
    let processedCount = 0;
    for (const event of claimedEvents) {
      try {
        await this.handleEvent(event);

        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: OutboxStatus.PROCESSED,
            processedAt: new Date(),
          },
        });
        processedCount++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const nextAttempts = event.attempts + 1;
        this.logger.error(`Failed to process outbox event ${event.id}: ${errorMsg}`);

        if (nextAttempts >= this.maxAttempts) {
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: OutboxStatus.DEAD_LETTER,
              attempts: nextAttempts,
              lastError: errorMsg,
            },
          });
        } else {
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: OutboxStatus.PENDING,
              attempts: nextAttempts,
              lastError: errorMsg,
              processingStartedAt: null,
            },
          });
        }
      }
    }

    return processedCount;
  }

  /**
   * Routes an individual outbox event to the communication platform
   */
  private async handleEvent(event: RawOutboxRecord): Promise<void> {
    const payload = event.payload || {};

    switch (event.event_type) {
      case 'COMMUNITY_MENTION_CREATED': {
        const mentionedUserId = payload.mentionedUserId as string;
        const actorName = (payload.actorName as string) || 'A member';
        if (mentionedUserId) {
          await this.orchestrator.orchestrate({
            userId: mentionedUserId,
            type: NotificationType.COMMUNITY_POST_MENTION,
            title: 'New Mention',
            body: `${actorName} mentioned you in a community post`,
            data: payload,
            idempotencyKey: `community-mention:${event.aggregate_id}:${mentionedUserId}`,
          });
        }
        break;
      }

      case 'COMMUNITY_POST_REPLY_CREATED': {
        const postId = payload.postId as string;
        const replierId = payload.authorId as string;
        if (postId) {
          const post = await this.prisma.communityPost.findUnique({
            where: { id: postId },
            select: { authorId: true, communityId: true },
          });

          // Do not notify self-replies
          if (post && post.authorId !== replierId) {
            await this.orchestrator.orchestrate({
              userId: post.authorId,
              type: NotificationType.COMMUNITY_POST_REPLY,
              title: 'New Reply to Your Post',
              body: 'Someone replied to your community post',
              data: payload,
              idempotencyKey: `community-reply:${event.aggregate_id}:${post.authorId}`,
            });
          }
        }
        break;
      }

      case 'COMMUNITY_MEETUP_CREATED': {
        const communityId = payload.communityId as string;
        const creatorId = payload.createdById as string;
        const meetupTitle = (payload.title as string) || 'New Meetup';

        if (communityId) {
          // Asynchronously notify all other active community members
          const members = await this.prisma.communityMember.findMany({
            where: {
              communityId,
              status: 'ACTIVE',
              userId: { not: creatorId },
            },
            select: { userId: true },
          });

          const userIds = members.map((m) => m.userId);
          await this.fanout.fanoutToUsers(userIds, (targetUserId) => ({
            userId: targetUserId,
            type: NotificationType.COMMUNITY_MEETUP_CREATED,
            title: 'New Community Meetup',
            body: `A new meetup "${meetupTitle}" has been scheduled in your community`,
            data: payload,
            idempotencyKey: `community-meetup:${event.aggregate_id}:${targetUserId}`,
          }));
        }
        break;
      }

      case 'EVENT_CANCELLED': {
        const eventId = event.aggregate_id;
        const eventName = (payload.name as string) || 'Event';

        // Query all registered attendees
        const registrations = await this.prisma.eventRegistration.findMany({
          where: {
            eventId,
            status: 'REGISTERED',
          },
          select: { userId: true },
        });

        const userIds = registrations.map((r) => r.userId);
        await this.fanout.fanoutToUsers(userIds, (targetUserId) => ({
          userId: targetUserId,
          type: NotificationType.EVENT_CANCELLED,
          title: 'Event Cancelled',
          body: `The event "${eventName}" has been cancelled by organizers`,
          data: payload,
          idempotencyKey: `event-cancelled:${eventId}:${targetUserId}`,
        }));
        break;
      }

      case 'PASSWORD_CHANGED': {
        const userId = payload.userId as string;
        if (userId) {
          // Bind idempotency strictly to the outbox event ID to prevent duplicates
          await this.orchestrator.orchestrate({
            userId,
            type: NotificationType.SECURITY_PASSWORD_RESET,
            title: 'Password Changed',
            body: 'Your account password was recently updated',
            data: payload,
            idempotencyKey: `security:password-changed:${userId}:${event.id}`,
          });
        }
        break;
      }

      case 'ACCOUNT_LOCKED':
      case 'USER_SUSPENDED': {
        const userId = (payload.userId as string) || event.aggregate_id;
        if (userId) {
          await this.orchestrator.orchestrate({
            userId,
            type: NotificationType.ACCOUNT_SUSPENDED,
            title: 'Account Suspended',
            body: 'Your account has been suspended due to security or policy compliance',
            data: payload,
            idempotencyKey: `security:account-suspended:${userId}:${event.id}`,
          });
        }
        break;
      }

      default:
        this.logger.debug(`Ignored outbox event type: ${event.event_type}`);
        break;
    }
  }
}
