import {
  Injectable,
  NotFoundException,
  BadRequestException,
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
  CreateCommunitySponsorshipCheckoutDto,
  CheckoutSessionResponseDto,
} from '../dto/create-checkout.dto';
import { PaymentResponseDto, PaginatedPaymentsDto } from '../dto/payment-response.dto';
import { PaymentQueryDto } from '../dto/payment-query.dto';
import { AdminRefundDto } from '../dto/admin-refund.dto';
import {
  AccountStatus,
  CommunitySponsorshipStatus,
  PaymentPurpose,
  PaymentStatus,
  Payment,
  Prisma,
} from '@prisma/client';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
  ) {}

  mapToResponse(p: Payment): PaymentResponseDto {
    return {
      id: p.id,
      userId: p.userId,
      sponsorProfileId: p.sponsorProfileId,
      vendorProfileId: p.vendorProfileId,
      subscriptionId: p.subscriptionId,
      amount: p.amount instanceof Prisma.Decimal ? p.amount.toNumber() : Number(p.amount),
      currency: p.currency,
      status: p.status,
      purpose: p.purpose,
      stripeCheckoutSessionId: p.stripeCheckoutSessionId,
      stripePaymentIntentId: p.stripePaymentIntentId,
      paidAt: p.paidAt,
      refundedAt: p.refundedAt,
      refundAmount: p.refundAmount
        ? p.refundAmount instanceof Prisma.Decimal
          ? p.refundAmount.toNumber()
          : Number(p.refundAmount)
        : null,
      refundReason: p.refundReason,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  async createCommunitySponsorshipCheckout(
    userId: string,
    dto: CreateCommunitySponsorshipCheckoutDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<CheckoutSessionResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        sponsorProfile: true,
        userRoles: { include: { role: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('User account not found');
    }

    if (user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Only active sponsor accounts can sponsor communities');
    }

    const hasSponsorRole = user.userRoles.some((ur) => ur.role.name === 'SPONSOR');
    if (!hasSponsorRole || !user.sponsorProfile) {
      throw new ForbiddenException(
        'Only active sponsors with a valid business profile can sponsor communities',
      );
    }

    const sponsorProfile = user.sponsorProfile;

    const community = await this.prisma.community.findFirst({
      where: { id: dto.communityId, deletedAt: null },
    });

    if (!community) {
      throw new NotFoundException('Community not found');
    }

    const existingActiveSponsorship = await this.prisma.communitySponsorship.findFirst({
      where: {
        communityId: dto.communityId,
        status: CommunitySponsorshipStatus.ACTIVE,
        endsAt: { gt: new Date() },
      },
    });

    if (existingActiveSponsorship) {
      throw new ConflictException('This community already has an active, unexpired sponsorship');
    }

    let plan = null;
    if (dto.planId) {
      plan = await this.prisma.communitySponsorshipPlan.findFirst({
        where: { id: dto.planId, isActive: true },
      });
    } else {
      plan = await this.prisma.communitySponsorshipPlan.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (!plan) {
      throw new NotFoundException('No active community sponsorship plan configuration found');
    }

    let stripeCustomerId = sponsorProfile.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await this.paymentProvider.createOrGetCustomer({
        email: sponsorProfile.contactEmail || user.email,
        name: sponsorProfile.companyName,
        metadata: {
          sponsorProfileId: sponsorProfile.id,
          userId,
        },
      });
      stripeCustomerId = customer.id;

      await this.prisma.sponsorProfile.update({
        where: { id: sponsorProfile.id },
        data: { stripeCustomerId },
      });
    }

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        sponsorProfileId: sponsorProfile.id,
        amount: plan.price,
        currency: plan.currency,
        status: PaymentStatus.PENDING,
        purpose: PaymentPurpose.COMMUNITY_SPONSORSHIP,
        metadata: {
          communityId: community.id,
          communityName: community.name,
          planId: plan.id,
          memberCapacity: plan.memberCapacity,
          durationDays: plan.durationDays,
        },
      },
    });

    const successUrl =
      dto.successUrl ||
      `https://app.innovent.com/communities/${community.id}?payment=success&payment_id=${payment.id}`;
    const cancelUrl =
      dto.cancelUrl ||
      `https://app.innovent.com/communities/${community.id}?payment=cancelled&payment_id=${payment.id}`;

    const unitAmountCents = Math.round(plan.price.toNumber() * 100);

    const session = await this.paymentProvider.createCheckoutSession({
      userId,
      stripeCustomerId: stripeCustomerId || undefined,
      mode: 'payment',
      successUrl,
      cancelUrl,
      lineItems: [
        {
          priceData: {
            currency: plan.currency.toLowerCase(),
            unitAmount: unitAmountCents,
            productData: {
              name: `Community Sponsorship: ${community.name}`,
              description:
                plan.description ||
                `${plan.durationDays}-day sponsorship with ${plan.memberCapacity} members capacity`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        paymentId: payment.id,
        paymentPurpose: PaymentPurpose.COMMUNITY_SPONSORSHIP,
        communityId: community.id,
        planId: plan.id,
        userId,
        sponsorProfileId: sponsorProfile.id,
      },
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { stripeCheckoutSessionId: session.sessionId },
    });

    await this.auditService.log({
      action: 'COMMUNITY_SPONSORSHIP_CHECKOUT_INITIATED',
      resourceType: 'PAYMENT',
      resourceId: payment.id,
      actorUserId: userId,
      metadata: {
        communityId: community.id,
        planId: plan.id,
        amount: plan.price.toNumber(),
        currency: plan.currency,
        sessionId: session.sessionId,
      },
      ipAddress,
      userAgent,
    });

    return {
      checkoutUrl: session.checkoutUrl,
      sessionId: session.sessionId,
      paymentId: payment.id,
    };
  }

  async getPaymentById(
    paymentId: string,
    requestingUserId: string,
    isAdmin: boolean,
  ): Promise<PaymentResponseDto> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        sponsorProfile: true,
        vendorProfile: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (!isAdmin) {
      const isDirectOwner = payment.userId === requestingUserId;
      const isSponsorOwner = payment.sponsorProfile?.userId === requestingUserId;
      const isVendorOwner = payment.vendorProfile?.userId === requestingUserId;

      if (!isDirectOwner && !isSponsorOwner && !isVendorOwner) {
        throw new ForbiddenException('Access denied: You do not own this payment record');
      }
    }

    return this.mapToResponse(payment);
  }

  async getPayments(query: PaymentQueryDto): Promise<PaginatedPaymentsDto> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.purpose) where.purpose = query.purpose;
    if (query.userId) where.userId = query.userId;
    if (query.sponsorProfileId) where.sponsorProfileId = query.sponsorProfileId;
    if (query.vendorProfileId) where.vendorProfileId = query.vendorProfileId;

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      items: items.map((p) => this.mapToResponse(p)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async refundPayment(
    paymentId: string,
    adminUserId: string,
    dto: AdminRefundDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<PaymentResponseDto> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        communitySponsorship: true,
        subscription: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (
      payment.status !== PaymentStatus.SUCCEEDED &&
      payment.status !== PaymentStatus.PARTIALLY_REFUNDED
    ) {
      throw new BadRequestException(
        `Payment status is ${payment.status}. Only succeeded payments can be refunded.`,
      );
    }

    const currentRefunded = payment.refundAmount ? payment.refundAmount.toNumber() : 0;
    const paymentAmount = payment.amount.toNumber();
    const maxRefundable = paymentAmount - currentRefunded;

    const targetRefund = dto.amount !== undefined ? dto.amount : maxRefundable;

    if (targetRefund <= 0 || targetRefund > maxRefundable) {
      throw new BadRequestException(
        `Invalid refund amount: ${targetRefund}. Max refundable remaining is ${maxRefundable} ${payment.currency}.`,
      );
    }

    // 1. External Stripe call OUTSIDE database transaction
    if (payment.stripePaymentIntentId) {
      await this.paymentProvider.refundPayment(
        payment.stripePaymentIntentId,
        Math.round(targetRefund * 100),
        dto.reason,
      );
    }

    // 2. Database transaction for local financial state and side effects
    const updated = await this.prisma.$transaction(async (tx) => {
      const newTotalRefunded = new Prisma.Decimal(currentRefunded + targetRefund);
      const isFullRefund = newTotalRefunded.greaterThanOrEqualTo(payment.amount);

      const nextStatus = isFullRefund ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED;

      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: nextStatus,
          refundAmount: newTotalRefunded,
          refundReason: dto.reason || 'Admin processed refund',
          refundedAt: new Date(),
        },
      });

      if (isFullRefund && payment.communitySponsorship) {
        await tx.communitySponsorship.update({
          where: { id: payment.communitySponsorship.id },
          data: { status: CommunitySponsorshipStatus.CANCELLED },
        });

        const remainingActive = await tx.communitySponsorship.findFirst({
          where: {
            communityId: payment.communitySponsorship.communityId,
            status: CommunitySponsorshipStatus.ACTIVE,
            endsAt: { gt: new Date() },
            id: { not: payment.communitySponsorship.id },
          },
        });

        if (!remainingActive) {
          await tx.community.update({
            where: { id: payment.communitySponsorship.communityId },
            data: {
              isSponsored: false,
              isPinned: false,
              memberCapacity: 20,
            },
          });
        }
      }

      await this.outboxService.enqueue(
        {
          aggregateType: 'PAYMENT',
          aggregateId: payment.id,
          eventType: 'PAYMENT_REFUNDED',
          payload: {
            userId: payment.userId,
            paymentId: payment.id,
            amount: targetRefund,
            currency: payment.currency,
            reason: dto.reason,
          },
        },
        tx,
      );

      return updatedPayment;
    });

    await this.auditService.log({
      action: 'PAYMENT_REFUNDED',
      resourceType: 'PAYMENT',
      resourceId: payment.id,
      actorUserId: adminUserId,
      metadata: {
        refundAmount: targetRefund,
        currency: payment.currency,
        reason: dto.reason,
      },
      ipAddress,
      userAgent,
    });

    return this.mapToResponse(updated);
  }
}
