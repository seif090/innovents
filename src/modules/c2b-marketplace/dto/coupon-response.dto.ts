import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DiscountType } from '@prisma/client';

export class CouponResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  id!: string;

  @ApiProperty({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  providerId!: string;

  @ApiProperty({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  eventId!: string;

  @ApiPropertyOptional({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  serviceId?: string | null;

  @ApiProperty({ example: 'SUMMIT20' })
  code!: string;

  @ApiProperty({ example: 'SUMMIT20' })
  normalizedCode!: string;

  @ApiPropertyOptional({ example: '20% off all dining' })
  description?: string | null;

  @ApiProperty({ enum: DiscountType, example: DiscountType.PERCENTAGE })
  discountType!: DiscountType;

  @ApiProperty({ example: 20.0 })
  discountValue!: number;

  @ApiPropertyOptional({ example: 100 })
  maxRedemptions?: number | null;

  @ApiProperty({ example: 15 })
  redemptionCount!: number;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00.000Z' })
  startsAt?: Date | null;

  @ApiProperty({ example: '2026-10-31T23:59:59.000Z' })
  expiresAt!: Date;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2026-09-12T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-09-12T12:00:00.000Z' })
  updatedAt!: Date;
}

export class CouponValidationResultDto {
  @ApiProperty({ example: true })
  valid!: boolean;

  @ApiPropertyOptional({ example: 'Coupon code is valid' })
  message?: string;

  @ApiPropertyOptional({ type: CouponResponseDto })
  coupon?: CouponResponseDto;

  @ApiPropertyOptional({ example: 20.0 })
  estimatedDiscount?: number;
}

export class CouponRedemptionResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  redemptionId!: string;

  @ApiProperty({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  couponId!: string;

  @ApiProperty({ example: 'SUMMIT20' })
  code!: string;

  @ApiProperty({ example: 20.0 })
  discountAmount!: number;

  @ApiProperty({ example: '2026-09-12T15:00:00.000Z' })
  redeemedAt!: Date;
}
