import { Injectable, BadRequestException, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import {
  PAYMENT_PROVIDER,
  PaymentProvider,
  PaymentWebhookEvent,
} from '../../../infrastructure/payments/payment.interface';
import {
  CommunitySponsorshipStatus,
  PaymentPurpose,
  PaymentStatus,
  Prisma,
  StripeWebhookStatus,
  SubscriptionBillingInterval,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
  ) {}

  async handleWebhook(
    rawBody: Buffer,
    signature: string,
  ): Promise<{ received: boolean; deduplicated?: boolean }> {
    let event: PaymentWebhookEvent;
    try {
      event = await this.paymentProvider.verifyWebhookSignature(rawBody, signature);
    } catch (err: unknown) {
      this.logger.error(
        `Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new BadRequestException(
        `Invalid Stripe webhook signature: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const providerEventId = event.id;
    const eventType = event.type;

    const existing = await this.prisma.stripeWebhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: 'stripe',
          providerEventId,
        },
      },
    });

    if (existing && existing.processingStatus === StripeWebhookStatus.PROCESSED) {
      this.logger.log(`Webhook event ${providerEventId} already processed (idempotent skip)`);
      return { received: true, deduplicated: true };
    }

    let webhookRecord = existing;
    if (!webhookRecord) {
      webhookRecord = await this.prisma.stripeWebhookEvent.create({
        data: {
          provider: 'stripe',
          providerEventId,
          eventType,
          processingStatus: StripeWebhookStatus.PENDING,
          payload: event as unknown as Prisma.InputJsonValue,
        },
      });
    }

    try {
      await this.dispatchWebhookEvent(event);

      await this.prisma.stripeWebhookEvent.update({
        where: { id: webhookRecord.id },
        data: {
          processingStatus: StripeWebhookStatus.PROCESSED,
          processedAt: new Date(),
          failureReason: null,
        },
      });

      return { received: true };
    } catch (err: unknown) {
      this.logger.error(
        `Failed to process webhook event ${providerEventId}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );

      await this.prisma.stripeWebhookEvent.update({
        where: { id: webhookRecord.id },
        data: {
          processingStatus: StripeWebhookStatus.FAILED,
          failureReason: err instanceof Error ? err.message : String(err),
        },
      });

      throw err;
    }
  }

  private async dispatchWebhookEvent(event: PaymentWebhookEvent): Promise<void> {
    const object = (event.data?.object || event.data || {}) as Record<string, unknown>;
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(object);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(object);
        break;

      case 'invoice.paid':
        await this.handleInvoicePaid(object);
        break;

      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(object);
        break;

      case 'charge.refunded':
        await this.handleChargeRefunded(object);
        break;

      default:
        this.logger.log(`Unhandled webhook event type: ${event.type}`);
        break;
    }
  }

  private async handleCheckoutSessionCompleted(session: Record<string, unknown>): Promise<void> {
    const mode = session.mode as string;
    const metadata = (session.metadata as Record<string, string>) || {};

    if (mode === 'payment' && metadata.paymentPurpose === PaymentPurpose.COMMUNITY_SPONSORSHIP) {
      await this.activateCommunitySponsorshipFromSession(session);
    } else if (mode === 'subscription' || metadata.purpose === 'SUBSCRIPTION') {
      await this.activateSubscriptionFromSession(session);
    }
  }

  private async activateCommunitySponsorshipFromSession(
    session: Record<string, unknown>,
  ): Promise<void> {
    const metadata = (session.metadata as Record<string, string>) || {};
    const paymentId = metadata.paymentId;
    const communityId = metadata.communityId;
    const planId = metadata.planId;
    const sponsorProfileId = metadata.sponsorProfileId;
    const userId = metadata.userId;

    let createdSponsorshipId: string | null = null;

    await this.prisma.$transaction(async (tx) => {
      let payment = null;
      if (paymentId) {
        payment = await tx.payment.findUnique({ where: { id: paymentId } });
      }
      if (!payment && session.id) {
        payment = await tx.payment.findFirst({ where: { stripeCheckoutSessionId: session.id } });
      }

      if (!payment) {
        this.logger.warn(`Payment record not found for session ${session.id}`);
        return;
      }

      if (payment.status === PaymentStatus.SUCCEEDED) {
        this.logger.log(`Payment ${payment.id} already marked SUCCEEDED`);
        return;
      }

      const plan = await tx.communitySponsorshipPlan.findUnique({
        where: { id: planId || ((payment.metadata as Record<string, unknown>)?.planId as string) },
      });

      const memberCapacity = plan?.memberCapacity || 500;
      const durationDays = plan?.durationDays || 30;

      const paymentIntentId =
        typeof session.payment_intent === 'string' ? session.payment_intent : null;
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.SUCCEEDED,
          paidAt: new Date(),
          stripePaymentIntentId: paymentIntentId,
        },
      });

      const startsAt = new Date();
      const endsAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

      const sponsorship = await tx.communitySponsorship.create({
        data: {
          communityId:
            communityId || ((payment.metadata as Record<string, unknown>)?.communityId as string),
          sponsorId: sponsorProfileId || payment.sponsorProfileId!,
          userId: userId || payment.userId,
          planId: plan ? plan.id : planId || '',
          paymentId: payment.id,
          status: CommunitySponsorshipStatus.ACTIVE,
          amount: payment.amount,
          currency: payment.currency,
          sponsoredCapacity: memberCapacity,
          startsAt,
          endsAt,
          stripeCheckoutSessionId: (session.id as string) || null,
        },
      });

      createdSponsorshipId = sponsorship.id;

      await tx.community.update({
        where: { id: communityId },
        data: {
          isSponsored: true,
          isPinned: true,
          memberCapacity,
        },
      });

      await this.outboxService.enqueue(
        {
          aggregateType: 'COMMUNITY_SPONSORSHIP',
          aggregateId: sponsorship.id,
          eventType: 'COMMUNITY_SPONSORSHIP_PAID',
          payload: {
            userId: payment.userId,
            communityId,
            amount: payment.amount.toNumber(),
            currency: payment.currency,
            sponsorshipId: sponsorship.id,
          },
        },
        tx,
      );

      await this.outboxService.enqueue(
        {
          aggregateType: 'COMMUNITY_SPONSORSHIP',
          aggregateId: sponsorship.id,
          eventType: 'COMMUNITY_SPONSORSHIP_ACTIVATED',
          payload: {
            userId: payment.userId,
            communityId,
            memberCapacity,
            endsAt: endsAt.toISOString(),
            sponsorshipId: sponsorship.id,
          },
        },
        tx,
      );
    });

    if (createdSponsorshipId) {
      await this.auditService.log({
        action: 'COMMUNITY_SPONSORSHIP_ACTIVATED',
        resourceType: 'COMMUNITY_SPONSORSHIP',
        resourceId: createdSponsorshipId,
        actorUserId: userId,
        metadata: {
          communityId,
          sponsorProfileId,
          sessionId: session.id,
        },
      });
    }
  }

  private async activateSubscriptionFromSession(session: Record<string, unknown>): Promise<void> {
    const metadata = (session.metadata as Record<string, string>) || {};
    const userId = metadata.userId;
    const planKey = metadata.plan as SubscriptionPlan;
    const profileId = metadata.profileId;
    const stripeSubscriptionId = session.subscription as string;

    if (!userId || !planKey || !stripeSubscriptionId) {
      this.logger.warn(`Incomplete metadata for subscription session ${session.id}`);
      return;
    }

    let createdSubId: string | null = null;

    await this.prisma.$transaction(async (tx) => {
      const planConfig = await tx.subscriptionPlanConfig.findUnique({
        where: { plan: planKey },
      });

      if (!planConfig) {
        throw new BadRequestException(`Subscription plan configuration ${planKey} not found`);
      }

      const isSponsor = planKey.startsWith('SPONSOR_');
      const isVendor = planKey.startsWith('VENDOR_');

      const currentPeriodStart = new Date();
      const currentPeriodEnd = new Date(
        Date.now() +
          (planConfig.interval === SubscriptionBillingInterval.YEAR ? 365 : 30) * 86400000,
      );

      const subscription = await tx.subscription.upsert({
        where: { stripeSubscriptionId },
        update: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart,
          currentPeriodEnd,
          cancelAtPeriodEnd: false,
        },
        create: {
          userId,
          sponsorProfileId: isSponsor ? profileId : null,
          vendorProfileId: isVendor ? profileId : null,
          planConfigId: planConfig.id,
          plan: planConfig.plan,
          status: SubscriptionStatus.ACTIVE,
          amount: planConfig.price,
          currency: planConfig.currency,
          interval: planConfig.interval,
          stripeCustomerId: (session.customer as string) || '',
          stripeSubscriptionId,
          currentPeriodStart,
          currentPeriodEnd,
          cancelAtPeriodEnd: false,
        },
      });

      createdSubId = subscription.id;

      await tx.payment.create({
        data: {
          userId,
          sponsorProfileId: isSponsor ? profileId : null,
          vendorProfileId: isVendor ? profileId : null,
          subscriptionId: subscription.id,
          amount: planConfig.price,
          currency: planConfig.currency,
          status: PaymentStatus.SUCCEEDED,
          purpose: PaymentPurpose.SUBSCRIPTION,
          stripeCheckoutSessionId: (session.id as string) || null,
          stripePaymentIntentId:
            typeof session.payment_intent === 'string' ? session.payment_intent : null,
          paidAt: new Date(),
        },
      });

      await this.outboxService.enqueue(
        {
          aggregateType: 'SUBSCRIPTION',
          aggregateId: subscription.id,
          eventType: 'SUBSCRIPTION_ACTIVATED',
          payload: {
            userId,
            subscriptionId: subscription.id,
            planName: planConfig.name,
            amount: planConfig.price.toNumber(),
            currency: planConfig.currency,
          },
        },
        tx,
      );
    });

    if (createdSubId) {
      await this.auditService.log({
        action: 'SUBSCRIPTION_ACTIVATED',
        resourceType: 'SUBSCRIPTION',
        resourceId: createdSubId,
        actorUserId: userId,
        metadata: {
          plan: planKey,
        },
      });
    }
  }

  private async handleSubscriptionUpdated(stripeSub: Record<string, unknown>): Promise<void> {
    const subId = stripeSub.id as string;
    const statusMap: Record<string, SubscriptionStatus> = {
      active: SubscriptionStatus.ACTIVE,
      trialing: SubscriptionStatus.TRIALING,
      past_due: SubscriptionStatus.PAST_DUE,
      canceled: SubscriptionStatus.CANCELLED,
      unpaid: SubscriptionStatus.UNPAID,
      incomplete: SubscriptionStatus.INCOMPLETE,
    };

    const targetStatus = statusMap[stripeSub.status as string] || SubscriptionStatus.ACTIVE;

    const existing = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId: subId },
    });

    if (!existing) return;

    await this.prisma.subscription.update({
      where: { id: existing.id },
      data: {
        status: targetStatus,
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end ?? false,
        currentPeriodStart:
          typeof stripeSub.current_period_start === 'number'
            ? new Date(stripeSub.current_period_start * 1000)
            : undefined,
        currentPeriodEnd:
          typeof stripeSub.current_period_end === 'number'
            ? new Date(stripeSub.current_period_end * 1000)
            : undefined,
      },
    });
  }

  private async handleSubscriptionDeleted(stripeSub: Record<string, unknown>): Promise<void> {
    const subId = stripeSub.id as string;
    const existing = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId: subId },
      include: { planConfig: true },
    });

    if (!existing) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: existing.id },
        data: {
          status: SubscriptionStatus.CANCELLED,
          canceledAt: new Date(),
        },
      });

      await this.outboxService.enqueue(
        {
          aggregateType: 'SUBSCRIPTION',
          aggregateId: existing.id,
          eventType: 'SUBSCRIPTION_CANCELLED',
          payload: {
            userId: existing.userId,
            subscriptionId: existing.id,
            planName: existing.planConfig.name,
          },
        },
        tx,
      );
    });
  }

  private async handleInvoicePaid(invoice: Record<string, unknown>): Promise<void> {
    const stripeSubscriptionId = invoice.subscription as string;
    if (!stripeSubscriptionId) return;

    const existing = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
      include: { planConfig: true },
    });

    if (!existing) return;

    const amountPaid =
      typeof invoice.amount_paid === 'number'
        ? invoice.amount_paid / 100
        : existing.amount.toNumber();

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          userId: existing.userId,
          sponsorProfileId: existing.sponsorProfileId,
          vendorProfileId: existing.vendorProfileId,
          subscriptionId: existing.id,
          amount: new Prisma.Decimal(amountPaid),
          currency: String(invoice.currency || existing.currency).toUpperCase(),
          status: PaymentStatus.SUCCEEDED,
          purpose: PaymentPurpose.SUBSCRIPTION,
          stripeInvoiceId: (invoice.id as string) || null,
          paidAt: new Date(),
        },
      });

      const invoiceLines = invoice.lines as
        { data?: Array<{ period?: { end?: number } }> } | undefined;
      const periodEndSec = invoiceLines?.data?.[0]?.period?.end;
      if (typeof periodEndSec === 'number') {
        await tx.subscription.update({
          where: { id: existing.id },
          data: {
            status: SubscriptionStatus.ACTIVE,
            currentPeriodEnd: new Date(periodEndSec * 1000),
          },
        });
      }

      await this.outboxService.enqueue(
        {
          aggregateType: 'SUBSCRIPTION',
          aggregateId: existing.id,
          eventType: 'SUBSCRIPTION_RENEWED',
          payload: {
            userId: existing.userId,
            subscriptionId: existing.id,
            planName: existing.planConfig.name,
            amount: amountPaid,
            currency: existing.currency,
          },
        },
        tx,
      );
    });
  }

  private async handleInvoicePaymentFailed(invoice: Record<string, unknown>): Promise<void> {
    const stripeSubscriptionId = invoice.subscription as string;
    if (!stripeSubscriptionId) return;

    const existing = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
      include: { planConfig: true },
    });

    if (!existing) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: existing.id },
        data: { status: SubscriptionStatus.PAST_DUE },
      });

      await this.outboxService.enqueue(
        {
          aggregateType: 'SUBSCRIPTION',
          aggregateId: existing.id,
          eventType: 'SUBSCRIPTION_PAYMENT_FAILED',
          payload: {
            userId: existing.userId,
            subscriptionId: existing.id,
            planName: existing.planConfig?.name || existing.plan,
          },
        },
        tx,
      );
    });
  }

  private async handleChargeRefunded(charge: Record<string, unknown>): Promise<void> {
    const paymentIntentId = charge.payment_intent as string;
    if (!paymentIntentId) return;

    const existingPayment = await this.prisma.payment.findUnique({
      where: { stripePaymentIntentId: paymentIntentId },
    });

    if (!existingPayment || existingPayment.status === PaymentStatus.REFUNDED) return;

    const refundAmount =
      typeof charge.amount_refunded === 'number'
        ? charge.amount_refunded / 100
        : existingPayment.amount.toNumber();

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: existingPayment.id },
        data: {
          status: PaymentStatus.REFUNDED,
          refundAmount: new Prisma.Decimal(refundAmount),
          refundedAt: new Date(),
        },
      });

      await this.outboxService.enqueue(
        {
          aggregateType: 'PAYMENT',
          aggregateId: existingPayment.id,
          eventType: 'PAYMENT_REFUNDED',
          payload: {
            userId: existingPayment.userId,
            paymentId: existingPayment.id,
            amount: refundAmount,
            currency: existingPayment.currency,
          },
        },
        tx,
      );
    });
  }
}
