/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { OutboxService } from '../../outbox/outbox.service';
import { AuditService } from '../../audit/audit.service';
import { AccountStatus, Prisma } from '@prisma/client';
import { CreateCouponDto } from '../dto/create-coupon.dto';
import { UpdateCouponDto } from '../dto/update-coupon.dto';
import { ValidateCouponDto } from '../dto/validate-coupon.dto';
import { RedeemCouponDto } from '../dto/redeem-coupon.dto';
import {
  CouponResponseDto,
  CouponValidationResultDto,
  CouponRedemptionResponseDto,
} from '../dto/coupon-response.dto';

@Injectable()
export class CouponsService {
  private readonly logger = new Logger(CouponsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Asserts active provider
   */
  async assertActiveProvider(userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user) {
      throw new NotFoundException('Provider account not found');
    }

    if (user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException(
        `Account is ${user.status}. Only active providers can manage coupons.`,
      );
    }

    const hasProviderRole = user.userRoles.some((ur) => ur.role.name === 'PROVIDER');
    if (!hasProviderRole) {
      throw new ForbiddenException('Only providers can manage coupons.');
    }
  }

  /**
   * Provider creates coupon
   */
  async createCoupon(
    providerId: string,
    dto: CreateCouponDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<CouponResponseDto> {
    await this.assertActiveProvider(providerId);

    const event = await this.prisma.event.findFirst({
      where: { id: dto.eventId, deletedAt: null },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const now = new Date();
    if (event.endsAt <= now) {
      throw new BadRequestException('Cannot create coupon for an event that has already ended');
    }

    const requestedExpiresAt = new Date(dto.expiresAt);
    const clampedExpiresAt = requestedExpiresAt > event.endsAt ? event.endsAt : requestedExpiresAt;

    const normalizedCode = dto.code.trim().toUpperCase();

    // Check unique normalized code
    const existing = await this.prisma.coupon.findUnique({
      where: { normalizedCode },
    });

    if (existing) {
      throw new ConflictException(`Coupon code '${normalizedCode}' already exists`);
    }

    const coupon = await this.prisma.coupon.create({
      data: {
        providerId,
        eventId: dto.eventId,
        serviceId: dto.serviceId || null,
        code: dto.code.trim(),
        normalizedCode,
        description: dto.description,
        discountType: dto.discountType,
        discountValue: new Prisma.Decimal(dto.discountValue),
        maxRedemptions: dto.maxRedemptions ?? null,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        expiresAt: clampedExpiresAt,
        isActive: dto.isActive ?? true,
      },
    });

    await this.auditService.log({
      actorUserId: providerId,
      action: 'COUPON_CREATED',
      resourceType: 'coupon',
      resourceId: coupon.id,
      ipAddress,
      userAgent,
      metadata: { code: normalizedCode, eventId: dto.eventId },
    });

    return this.mapToDto(coupon);
  }

  /**
   * Provider updates coupon
   */
  async updateCoupon(
    providerId: string,
    couponId: string,
    dto: UpdateCouponDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<CouponResponseDto> {
    await this.assertActiveProvider(providerId);

    const coupon = await this.prisma.coupon.findFirst({
      where: { id: couponId, deletedAt: null },
      include: { event: true },
    });

    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    if (coupon.providerId !== providerId) {
      throw new ForbiddenException('You are not authorized to update this coupon');
    }

    let clampedExpiresAt = coupon.expiresAt;
    if (dto.expiresAt) {
      const requested = new Date(dto.expiresAt);
      clampedExpiresAt = requested > coupon.event.endsAt ? coupon.event.endsAt : requested;
    }

    const updated = await this.prisma.coupon.update({
      where: { id: couponId },
      data: {
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.discountType && { discountType: dto.discountType }),
        ...(dto.discountValue !== undefined && {
          discountValue: new Prisma.Decimal(dto.discountValue),
        }),
        ...(dto.maxRedemptions !== undefined && { maxRedemptions: dto.maxRedemptions }),
        ...(dto.startsAt && { startsAt: new Date(dto.startsAt) }),
        ...(dto.expiresAt && { expiresAt: clampedExpiresAt }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    await this.auditService.log({
      actorUserId: providerId,
      action: 'COUPON_UPDATED',
      resourceType: 'coupon',
      resourceId: couponId,
      ipAddress,
      userAgent,
      metadata: { changes: dto },
    });

    return this.mapToDto(updated);
  }

  /**
   * Provider lists their coupons
   */
  async getProviderCoupons(providerId: string): Promise<CouponResponseDto[]> {
    await this.assertActiveProvider(providerId);

    const coupons = await this.prisma.coupon.findMany({
      where: { providerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return coupons.map((c) => this.mapToDto(c));
  }

  /**
   * Validate coupon code for an attendee
   */
  async validateCoupon(
    dto: ValidateCouponDto,
    attendeeId?: string,
  ): Promise<CouponValidationResultDto> {
    const normalizedCode = dto.code.trim().toUpperCase();
    const now = new Date();

    const coupon = await this.prisma.coupon.findFirst({
      where: {
        normalizedCode,
        deletedAt: null,
      },
      include: {
        provider: true,
        event: true,
      },
    });

    if (!coupon) {
      return { valid: false, message: 'Invalid coupon code' };
    }

    if (!coupon.isActive) {
      return { valid: false, message: 'Coupon is not active' };
    }

    if (coupon.expiresAt <= now || coupon.event.endsAt <= now) {
      return { valid: false, message: 'Coupon has expired' };
    }

    if (coupon.startsAt && coupon.startsAt > now) {
      return { valid: false, message: 'Coupon is not yet active' };
    }

    if (coupon.eventId !== dto.eventId) {
      return { valid: false, message: 'Coupon is not valid for this event' };
    }

    if (coupon.serviceId && dto.serviceId && coupon.serviceId !== dto.serviceId) {
      return { valid: false, message: 'Coupon is not valid for this service' };
    }

    if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions) {
      return { valid: false, message: 'Coupon redemption limit reached' };
    }

    if (coupon.provider.status !== AccountStatus.ACTIVE) {
      return { valid: false, message: 'Coupon provider is not active' };
    }

    // Check if attendee already redeemed
    if (attendeeId) {
      const existing = await this.prisma.couponRedemption.findUnique({
        where: {
          couponId_attendeeId: {
            couponId: coupon.id,
            attendeeId,
          },
        },
      });

      if (existing) {
        return { valid: false, message: 'You have already redeemed this coupon' };
      }
    }

    return {
      valid: true,
      message: 'Coupon is valid',
      coupon: this.mapToDto(coupon),
      estimatedDiscount: Number(coupon.discountValue),
    };
  }

  /**
   * Atomically and transaction-safely redeem a coupon
   */
  async redeemCoupon(
    attendeeId: string,
    dto: RedeemCouponDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<CouponRedemptionResponseDto> {
    const normalizedCode = dto.code.trim().toUpperCase();

    // Check idempotency if key is supplied
    if (dto.idempotencyKey) {
      const existingIdempotent = await this.prisma.couponRedemption.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { coupon: true },
      });
      if (existingIdempotent) {
        return {
          redemptionId: existingIdempotent.id,
          couponId: existingIdempotent.couponId,
          code: existingIdempotent.coupon.code,
          discountAmount: Number(existingIdempotent.discountAmount || 0),
          redeemedAt: existingIdempotent.redeemedAt,
        };
      }
    }

    const validation = await this.validateCoupon(dto, attendeeId);
    if (!validation.valid || !validation.coupon) {
      throw new BadRequestException(validation.message || 'Invalid coupon redemption request');
    }

    const couponId = validation.coupon.id;

    // Execute atomic transaction
    const redemption = await this.prisma.$transaction(async (tx) => {
      // 1. Guard against duplicate redemption by same attendee
      const alreadyRedeemed = await tx.couponRedemption.findUnique({
        where: { couponId_attendeeId: { couponId, attendeeId } },
      });
      if (alreadyRedeemed) {
        throw new ConflictException('Coupon has already been redeemed by this attendee');
      }

      // 2. Atomic conditional update on coupon table
      const updateResult = await tx.$executeRaw`
        UPDATE coupons
        SET redemption_count = redemption_count + 1
        WHERE id = ${couponId}::uuid
          AND is_active = true
          AND expires_at > NOW()
          AND (starts_at IS NULL OR starts_at <= NOW())
          AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
          AND deleted_at IS NULL
      `;

      if (updateResult === 0) {
        throw new ConflictException('Coupon has reached its maximum redemptions or has expired');
      }

      // 3. Create redemption record
      const newRedemption = await tx.couponRedemption.create({
        data: {
          couponId,
          attendeeId,
          eventId: dto.eventId,
          serviceId: dto.serviceId || null,
          discountAmount: new Prisma.Decimal(validation.estimatedDiscount || 0),
          idempotencyKey: dto.idempotencyKey || null,
        },
        include: { coupon: true },
      });

      // 4. Outbox notification to provider
      await this.outboxService.enqueue(
        {
          eventType: 'COUPON_REDEEMED',
          aggregateType: 'coupon',
          aggregateId: couponId,
          payload: {
            redemptionId: newRedemption.id,
            providerId: validation.coupon!.providerId,
            attendeeId,
            code: validation.coupon!.code,
          },
        },
        tx,
      );

      return newRedemption;
    });

    await this.auditService.log({
      actorUserId: attendeeId,
      action: 'COUPON_REDEEMED',
      resourceType: 'coupon_redemption',
      resourceId: redemption.id,
      ipAddress,
      userAgent,
      metadata: { couponId, code: normalizedCode },
    });

    this.logger.log(`Coupon ${normalizedCode} redeemed by attendee ${attendeeId}`);
    return {
      redemptionId: redemption.id,
      couponId: redemption.couponId,
      code: redemption.coupon.code,
      discountAmount: Number(redemption.discountAmount || 0),
      redeemedAt: redemption.redeemedAt,
    };
  }

  private mapToDto(coupon: any): CouponResponseDto {
    return {
      id: coupon.id,
      providerId: coupon.providerId,
      eventId: coupon.eventId,
      serviceId: coupon.serviceId,
      code: coupon.code,
      normalizedCode: coupon.normalizedCode,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: Number(coupon.discountValue),
      maxRedemptions: coupon.maxRedemptions,
      redemptionCount: coupon.redemptionCount,
      startsAt: coupon.startsAt,
      expiresAt: coupon.expiresAt,
      isActive: coupon.isActive,
      createdAt: coupon.createdAt,
      updatedAt: coupon.updatedAt,
    };
  }
}
