import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { OutboxStatus, NotificationType } from '@prisma/client';
import { NotificationOrchestratorService } from '../services/notification-orchestrator.service';
import { NotificationFanoutService } from '../services/notification-fanout.service';
import { NOTIFICATION_LIMITS } from '../constants/notifications.constants';
import { QueueService } from '../../../infrastructure/queue/queue.service';
import { QUEUE_NAMES } from '../../../infrastructure/queue/queue.constants';
import { EmailTemplateService } from '../providers/email/email-template.service';

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
    @Optional() private readonly queueService?: QueueService,
    @Optional() private readonly emailTemplateService?: EmailTemplateService,
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

      case 'ACCOUNT_APPROVED': {
        const userId = (payload.userId as string) || event.aggregate_id;
        if (userId) {
          await this.orchestrator.orchestrate({
            userId,
            type: NotificationType.ACCOUNT_APPROVED,
            title: 'Account Approved',
            body: 'Your business account application has been reviewed and approved',
            data: payload,
            idempotencyKey: `account-approved:${userId}:${event.id}`,
          });
        }
        break;
      }

      case 'ACCOUNT_REJECTED': {
        const userId = (payload.userId as string) || event.aggregate_id;
        const reason = (payload.reason as string) || 'Application requirements not met';
        if (userId) {
          await this.orchestrator.orchestrate({
            userId,
            type: NotificationType.ACCOUNT_REJECTED,
            title: 'Account Application Rejected',
            body: `Your business account application was not approved: ${reason}`,
            data: payload,
            idempotencyKey: `account-rejected:${userId}:${event.id}`,
          });
        }
        break;
      }

      case 'ACCOUNT_SUSPENDED':
      case 'ACCOUNT_LOCKED':
      case 'USER_SUSPENDED': {
        const userId = (payload.userId as string) || event.aggregate_id;
        const reason = (payload.reason as string) || 'Security or platform policy violations';
        if (userId) {
          await this.orchestrator.orchestrate({
            userId,
            type: NotificationType.ACCOUNT_SUSPENDED,
            title: 'Account Suspended',
            body: `Your account has been suspended: ${reason}`,
            data: payload,
            idempotencyKey: `security:account-suspended:${userId}:${event.id}`,
          });
        }
        break;
      }

      case 'ORGANIZER_INVITATION_CREATED': {
        const email = payload.email as string;
        const eventName = (payload.eventName as string) || 'Event';
        const inviterName = (payload.inviterName as string) || 'Event Owner';
        const invitationLink = (payload.invitationLink as string) || '';
        const expiresAt = (payload.expiresAt as string) || '';

        if (this.queueService && email) {
          const rendered = this.emailTemplateService
            ? this.emailTemplateService.render(NotificationType.ORGANIZER_INVITATION_CREATED, {
                recipientName: email,
                title: `Invitation to organize event: ${eventName}`,
                data: { eventName, inviterName, invitationLink, expiresAt },
              })
            : {
                subject: `Invitation to organize event: ${eventName}`,
                html: `<p>You have been invited to organize ${eventName}. <a href="${invitationLink}">Accept Invitation</a></p>`,
                text: `You have been invited to organize ${eventName}: ${invitationLink}`,
              };

          await this.queueService.addJob(QUEUE_NAMES.EMAIL, 'send-organizer-invitation', {
            to: email,
            subject: rendered.subject,
            html: rendered.html,
          });
        }
        break;
      }

      case 'ORGANIZER_INVITATION_ACCEPTED': {
        const eventOwnerId = payload.eventOwnerId as string;
        const eventName = (payload.eventName as string) || 'Event';
        const organizerEmail = (payload.organizerEmail as string) || 'An organizer';
        if (eventOwnerId) {
          await this.orchestrator.orchestrate({
            userId: eventOwnerId,
            type: NotificationType.ORGANIZER_INVITATION_ACCEPTED,
            title: 'Organizer Invitation Accepted',
            body: `${organizerEmail} accepted your invitation to organize "${eventName}"`,
            data: payload,
            idempotencyKey: `organizer-invitation-accepted:${event.aggregate_id}:${eventOwnerId}`,
          });
        }
        break;
      }

      case 'RFQ_SENT': {
        const vendorId = payload.vendorId as string;
        const title = (payload.title as string) || 'New RFQ';
        if (vendorId) {
          await this.orchestrator.orchestrate({
            userId: vendorId,
            type: NotificationType.RFQ_SENT,
            title: 'New RFQ Received',
            body: `You have received a new request for quotation: "${title}"`,
            data: payload,
            idempotencyKey: `rfq-sent:${event.aggregate_id}:${vendorId}`,
          });
        }
        break;
      }

      case 'RFQ_VIEWED': {
        const sponsorId = payload.sponsorId as string;
        if (sponsorId) {
          await this.orchestrator.orchestrate({
            userId: sponsorId,
            type: NotificationType.RFQ_VIEWED,
            title: 'RFQ Viewed',
            body: 'The vendor has opened and viewed your RFQ',
            data: payload,
            idempotencyKey: `rfq-viewed:${event.aggregate_id}:${sponsorId}`,
          });
        }
        break;
      }

      case 'RFQ_CLARIFICATION_REQUESTED': {
        const recipientId = payload.recipientId as string;
        const message = (payload.message as string) || 'New clarification message';
        if (recipientId) {
          await this.orchestrator.orchestrate({
            userId: recipientId,
            type: NotificationType.RFQ_CLARIFICATION_REQUESTED,
            title: 'RFQ Clarification Inquiry',
            body: `New message on RFQ: ${message.slice(0, 100)}`,
            data: payload,
            idempotencyKey: `rfq-clarification:${event.id}:${recipientId}`,
          });
        }
        break;
      }

      case 'RFQ_QUOTED': {
        const sponsorId = payload.sponsorId as string;
        const version = (payload.version as number) || 1;
        const total = (payload.total as number) || 0;
        const currency = (payload.currency as string) || 'SAR';
        if (sponsorId) {
          await this.orchestrator.orchestrate({
            userId: sponsorId,
            type: NotificationType.RFQ_QUOTED,
            title: 'New Quotation Received',
            body: `Quotation v${version} submitted for your RFQ: ${total} ${currency}`,
            data: payload,
            idempotencyKey: `rfq-quoted:${event.aggregate_id}:${sponsorId}`,
          });
        }
        break;
      }

      case 'RFQ_ACCEPTED': {
        const vendorId = payload.vendorId as string;
        const total = (payload.total as number) || 0;
        const currency = (payload.currency as string) || 'SAR';
        if (vendorId) {
          await this.orchestrator.orchestrate({
            userId: vendorId,
            type: NotificationType.RFQ_ACCEPTED,
            title: 'Quotation Accepted!',
            body: `Your quotation of ${total} ${currency} has been accepted by the sponsor`,
            data: payload,
            idempotencyKey: `rfq-accepted:${event.aggregate_id}:${vendorId}`,
          });
        }
        break;
      }

      case 'RFQ_REJECTED': {
        const vendorId = payload.vendorId as string;
        const sponsorId = payload.sponsorId as string;
        const targetUserId = vendorId || sponsorId;
        const reason = (payload.reason as string) || 'No reason provided';
        if (targetUserId) {
          await this.orchestrator.orchestrate({
            userId: targetUserId,
            type: NotificationType.RFQ_REJECTED,
            title: 'Quotation / RFQ Rejected',
            body: `Proposal was not accepted: ${reason}`,
            data: payload,
            idempotencyKey: `rfq-rejected:${event.aggregate_id}:${targetUserId}`,
          });
        }
        break;
      }

      case 'RFQ_CANCELLED': {
        const vendorId = payload.vendorId as string;
        const reason = (payload.reason as string) || 'Cancelled by sponsor';
        if (vendorId) {
          await this.orchestrator.orchestrate({
            userId: vendorId,
            type: NotificationType.RFQ_CANCELLED,
            title: 'RFQ Cancelled',
            body: `The RFQ was cancelled: ${reason}`,
            data: payload,
            idempotencyKey: `rfq-cancelled:${event.aggregate_id}:${vendorId}`,
          });
        }
        break;
      }

      case 'RFQ_EXPIRED': {
        const vendorId = payload.vendorId as string;
        if (vendorId) {
          await this.orchestrator.orchestrate({
            userId: vendorId,
            type: NotificationType.RFQ_EXPIRED,
            title: 'RFQ Expired',
            body: 'The RFQ validity window has ended',
            data: payload,
            idempotencyKey: `rfq-expired:${event.aggregate_id}:${vendorId}`,
          });
        }
        break;
      }

      case 'C2B_BOOKING_REQUESTED': {
        const providerId = payload.providerId as string;
        const serviceName = (payload.serviceName as string) || 'Service';
        if (providerId) {
          await this.orchestrator.orchestrate({
            userId: providerId,
            type: NotificationType.C2B_BOOKING_REQUESTED,
            title: 'New Booking Request',
            body: `You have received a new booking request for "${serviceName}"`,
            data: payload,
            idempotencyKey: `c2b-booking-req:${event.aggregate_id}:${providerId}`,
          });
        }
        break;
      }

      case 'C2B_BOOKING_STATUS_CHANGED': {
        const attendeeId = payload.attendeeId as string;
        const status = (payload.status as string) || 'UPDATED';
        const serviceName = (payload.serviceName as string) || 'Service';
        if (attendeeId) {
          await this.orchestrator.orchestrate({
            userId: attendeeId,
            type: NotificationType.C2B_BOOKING_STATUS_CHANGED,
            title: 'Booking Request Updated',
            body: `Your booking request for "${serviceName}" is now ${status}`,
            data: payload,
            idempotencyKey: `c2b-booking-status:${event.aggregate_id}:${status}`,
          });
        }
        break;
      }

      case 'SPONSOR_AD_SUBMITTED': {
        const adminId = payload.adminId as string;
        const title = (payload.title as string) || 'Sponsor Ad';
        if (adminId) {
          await this.orchestrator.orchestrate({
            userId: adminId,
            type: NotificationType.SPONSOR_AD_SUBMITTED,
            title: 'Sponsor Ad Submitted for Review',
            body: `New ad "${title}" submitted and awaiting moderation`,
            data: payload,
            idempotencyKey: `sponsor-ad-submitted:${event.aggregate_id}:${adminId}`,
          });
        }
        break;
      }

      case 'SPONSOR_AD_APPROVED': {
        const sponsorId = payload.sponsorId as string;
        const title = (payload.title as string) || 'Sponsor Ad';
        if (sponsorId) {
          await this.orchestrator.orchestrate({
            userId: sponsorId,
            type: NotificationType.SPONSOR_AD_APPROVED,
            title: 'Sponsor Ad Approved',
            body: `Your ad "${title}" has been approved for publication`,
            data: payload,
            idempotencyKey: `sponsor-ad-approved:${event.aggregate_id}:${sponsorId}`,
          });
        }
        break;
      }

      case 'SPONSOR_AD_REJECTED': {
        const sponsorId = payload.sponsorId as string;
        const title = (payload.title as string) || 'Sponsor Ad';
        const reason = (payload.reason as string) || 'Policy violation';
        if (sponsorId) {
          await this.orchestrator.orchestrate({
            userId: sponsorId,
            type: NotificationType.SPONSOR_AD_REJECTED,
            title: 'Sponsor Ad Rejected',
            body: `Your ad "${title}" was not approved: ${reason}`,
            data: payload,
            idempotencyKey: `sponsor-ad-rejected:${event.aggregate_id}:${sponsorId}`,
          });
        }
        break;
      }

      case 'COUPON_REDEEMED': {
        const providerId = payload.providerId as string;
        const code = (payload.code as string) || 'Coupon';
        if (providerId) {
          await this.orchestrator.orchestrate({
            userId: providerId,
            type: NotificationType.COUPON_REDEEMED,
            title: 'Coupon Redeemed',
            body: `Promotional coupon "${code}" was redeemed`,
            data: payload,
            idempotencyKey: `coupon-redeemed:${event.aggregate_id}:${providerId}`,
          });
        }
        break;
      }

      case 'COMMUNITY_SPONSORSHIP_PAID': {
        const userId = payload.userId as string;
        const communityName = (payload.communityName as string) || 'Community';
        if (userId) {
          await this.orchestrator.orchestrate({
            userId,
            type: NotificationType.COMMUNITY_SPONSORSHIP_PAID,
            title: 'Sponsorship Payment Received',
            body: `Payment received for sponsoring "${communityName}"`,
            data: payload,
            idempotencyKey: `sponsorship-paid:${event.aggregate_id}:${userId}`,
          });
        }
        break;
      }

      case 'COMMUNITY_SPONSORSHIP_ACTIVATED': {
        const userId = payload.userId as string;
        const communityName = (payload.communityName as string) || 'Community';
        if (userId) {
          await this.orchestrator.orchestrate({
            userId,
            type: NotificationType.COMMUNITY_SPONSORSHIP_ACTIVATED,
            title: 'Community Sponsorship Activated',
            body: `Community "${communityName}" is now active and sponsored`,
            data: payload,
            idempotencyKey: `sponsorship-activated:${event.aggregate_id}:${userId}`,
          });
        }
        break;
      }

      case 'COMMUNITY_SPONSORSHIP_EXPIRED': {
        const userId = payload.userId as string;
        const communityName = (payload.communityName as string) || 'Community';
        if (userId) {
          await this.orchestrator.orchestrate({
            userId,
            type: NotificationType.COMMUNITY_SPONSORSHIP_EXPIRED,
            title: 'Community Sponsorship Expired',
            body: `The sponsorship period for "${communityName}" has expired`,
            data: payload,
            idempotencyKey: `sponsorship-expired:${event.aggregate_id}:${userId}`,
          });
        }
        break;
      }

      case 'SUBSCRIPTION_ACTIVATED': {
        const userId = payload.userId as string;
        const planName = (payload.planName as string) || 'Subscription';
        if (userId) {
          await this.orchestrator.orchestrate({
            userId,
            type: NotificationType.SUBSCRIPTION_ACTIVATED,
            title: 'Subscription Activated',
            body: `Your "${planName}" subscription is now active`,
            data: payload,
            idempotencyKey: `sub-activated:${event.aggregate_id}:${userId}`,
          });
        }
        break;
      }

      case 'SUBSCRIPTION_RENEWED': {
        const userId = payload.userId as string;
        const planName = (payload.planName as string) || 'Subscription';
        if (userId) {
          await this.orchestrator.orchestrate({
            userId,
            type: NotificationType.SUBSCRIPTION_RENEWED,
            title: 'Subscription Renewed',
            body: `Your "${planName}" subscription has renewed successfully`,
            data: payload,
            idempotencyKey: `sub-renewed:${event.aggregate_id}:${userId}`,
          });
        }
        break;
      }

      case 'SUBSCRIPTION_PAYMENT_FAILED': {
        const userId = payload.userId as string;
        const planName = (payload.planName as string) || 'Subscription';
        if (userId) {
          await this.orchestrator.orchestrate({
            userId,
            type: NotificationType.SUBSCRIPTION_PAYMENT_FAILED,
            title: 'Subscription Payment Failed',
            body: `Renewal payment failed for "${planName}". Please update your billing method`,
            data: payload,
            idempotencyKey: `sub-failed:${event.aggregate_id}:${userId}`,
          });
        }
        break;
      }

      case 'SUBSCRIPTION_CANCELLED': {
        const userId = payload.userId as string;
        const planName = (payload.planName as string) || 'Subscription';
        if (userId) {
          await this.orchestrator.orchestrate({
            userId,
            type: NotificationType.SUBSCRIPTION_CANCELLED,
            title: 'Subscription Cancelled',
            body: `Your subscription "${planName}" has been cancelled`,
            data: payload,
            idempotencyKey: `sub-cancelled:${event.aggregate_id}:${userId}`,
          });
        }
        break;
      }

      case 'PAYMENT_REFUNDED': {
        const userId = payload.userId as string;
        const amount = payload.amount ? String(payload.amount) : '0';
        const currency = (payload.currency as string) || 'SAR';
        if (userId) {
          await this.orchestrator.orchestrate({
            userId,
            type: NotificationType.PAYMENT_REFUNDED,
            title: 'Payment Refunded',
            body: `A refund of ${amount} ${currency} has been processed`,
            data: payload,
            idempotencyKey: `payment-refunded:${event.aggregate_id}:${userId}`,
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
