import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import {
  PAYMENT_PROVIDER,
  PaymentProvider,
} from '../../../infrastructure/payments/payment.interface';
import {
  CreateSubscriptionCheckoutDto,
  SubscriptionCheckoutResponseDto,
} from '../dto/create-subscription-checkout.dto';
import {
  SubscriptionResponseDto,
  PaginatedSubscriptionsDto,
} from '../dto/subscription-response.dto';
import { CancelSubscriptionDto } from '../dto/cancel-subscription.dto';
import { SubscriptionQueryDto } from '../dto/subscription-query.dto';
import {
  AccountStatus,
  Prisma,
  SubscriptionStatus,
  Subscription,
  SponsorProfile,
  VendorProfile,
} from '@prisma/client';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
  ) {}

  mapToResponse(s: Subscription): SubscriptionResponseDto {
    return {
      id: s.id,
      userId: s.userId,
      sponsorProfileId: s.sponsorProfileId,
      vendorProfileId: s.vendorProfileId,
      plan: s.plan,
      status: s.status,
      amount: s.amount instanceof Prisma.Decimal ? s.amount.toNumber() : Number(s.amount),
      currency: s.currency,
      interval: s.interval,
      currentPeriodStart: s.currentPeriodStart,
      currentPeriodEnd: s.currentPeriodEnd,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      canceledAt: s.canceledAt,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  async createCheckout(
    userId: string,
    dto: CreateSubscriptionCheckoutDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<SubscriptionCheckoutResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        sponsorProfile: true,
        vendorProfile: true,
        userRoles: { include: { role: true } },
      },
    });

    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Only active accounts can purchase subscriptions');
    }

    const planConfig = await this.prisma.subscriptionPlanConfig.findUnique({
      where: { plan: dto.plan },
    });

    if (!planConfig || !planConfig.isActive) {
      throw new NotFoundException(
        `Subscription plan configuration for ${dto.plan} not found or inactive`,
      );
    }

    const isSponsorPlan = dto.plan.startsWith('SPONSOR_');
    const isVendorPlan = dto.plan.startsWith('VENDOR_');

    let profile: SponsorProfile | VendorProfile | null = null;
    if (isSponsorPlan) {
      const hasRole = user.userRoles.some((ur) => ur.role.name === 'SPONSOR');
      if (!hasRole || !user.sponsorProfile) {
        throw new ForbiddenException('Only verified event sponsors can subscribe to Sponsor plans');
      }
      profile = user.sponsorProfile;
    } else if (isVendorPlan) {
      const hasRole = user.userRoles.some((ur) => ur.role.name === 'VENDOR');
      if (!hasRole || !user.vendorProfile) {
        throw new ForbiddenException(
          'Only verified marketplace vendors can subscribe to Vendor plans',
        );
      }
      profile = user.vendorProfile;
    } else {
      throw new ForbiddenException('Invalid subscription plan type');
    }

    const existingActive = await this.prisma.subscription.findFirst({
      where: {
        userId,
        plan: dto.plan,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
        cancelAtPeriodEnd: false,
      },
    });

    if (existingActive) {
      throw new ConflictException('An active subscription already exists for this plan');
    }

    let stripeCustomerId = profile.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await this.paymentProvider.createOrGetCustomer({
        email: profile.contactEmail || user.email,
        name: profile.companyName,
        metadata: {
          profileId: profile.id,
          userId,
          targetRole: planConfig.targetRole,
        },
      });
      stripeCustomerId = customer.id;

      if (isSponsorPlan) {
        await this.prisma.sponsorProfile.update({
          where: { id: profile.id },
          data: { stripeCustomerId },
        });
      } else {
        await this.prisma.vendorProfile.update({
          where: { id: profile.id },
          data: { stripeCustomerId },
        });
      }
    }

    const successUrl =
      dto.successUrl || `https://app.innovent.com/subscriptions/success?plan=${dto.plan}`;
    const cancelUrl =
      dto.cancelUrl || `https://app.innovent.com/subscriptions/cancelled?plan=${dto.plan}`;

    const priceId = planConfig.stripePriceId || `price_mock_${dto.plan.toLowerCase()}`;

    const session = await this.paymentProvider.createCheckoutSession({
      userId,
      stripeCustomerId: stripeCustomerId || undefined,
      mode: 'subscription',
      successUrl,
      cancelUrl,
      lineItems: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        userId,
        profileId: profile.id,
        plan: dto.plan,
        purpose: 'SUBSCRIPTION',
      },
    });

    await this.auditService.log({
      action: 'SUBSCRIPTION_CHECKOUT_INITIATED',
      resourceType: 'SUBSCRIPTION',
      resourceId: session.sessionId,
      actorUserId: userId,
      metadata: {
        plan: dto.plan,
        amount: planConfig.price.toNumber(),
        interval: planConfig.interval,
        sessionId: session.sessionId,
      },
      ipAddress,
      userAgent,
    });

    return {
      checkoutUrl: session.checkoutUrl,
      sessionId: session.sessionId,
    };
  }

  async getCurrentSubscription(userId: string): Promise<SubscriptionResponseDto | null> {
    const sub = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING, SubscriptionStatus.PAST_DUE],
        },
      },
      orderBy: { createdAt: 'desc' },
      include: { planConfig: true },
    });

    return sub ? this.mapToResponse(sub) : null;
  }

  async cancelSubscription(
    subscriptionId: string,
    requestingUserId: string,
    isAdmin: boolean,
    dto: CancelSubscriptionDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<SubscriptionResponseDto> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { planConfig: true },
    });

    if (!sub) {
      throw new NotFoundException('Subscription not found');
    }

    if (!isAdmin && sub.userId !== requestingUserId) {
      throw new ForbiddenException('Access denied: You do not own this subscription');
    }

    if (sub.status === SubscriptionStatus.CANCELLED) {
      throw new ConflictException('Subscription is already cancelled');
    }

    const immediately = dto.immediately ?? false;

    await this.paymentProvider.cancelSubscription(sub.stripeSubscriptionId, immediately);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.subscription.update({
        where: { id: sub.id },
        data: immediately
          ? {
              status: SubscriptionStatus.CANCELLED,
              canceledAt: new Date(),
              cancelAtPeriodEnd: false,
            }
          : {
              cancelAtPeriodEnd: true,
            },
      });

      if (immediately) {
        await this.outboxService.enqueue(
          {
            aggregateType: 'SUBSCRIPTION',
            aggregateId: sub.id,
            eventType: 'SUBSCRIPTION_CANCELLED',
            payload: {
              userId: sub.userId,
              subscriptionId: sub.id,
              planName: sub.planConfig?.name || sub.plan,
              reason: dto.reason,
            },
          },
          tx,
        );
      }

      return result;
    });

    await this.auditService.log({
      action: 'SUBSCRIPTION_CANCELLED',
      resourceType: 'SUBSCRIPTION',
      resourceId: sub.id,
      actorUserId: requestingUserId,
      metadata: {
        immediately,
        reason: dto.reason,
        plan: sub.plan,
      },
      ipAddress,
      userAgent,
    });

    return this.mapToResponse(updated);
  }

  async getSubscriptions(query: SubscriptionQueryDto): Promise<PaginatedSubscriptionsDto> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.SubscriptionWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.plan) where.plan = query.plan;
    if (query.userId) where.userId = query.userId;

    const [items, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return {
      items: items.map((s) => this.mapToResponse(s)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
