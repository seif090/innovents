import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionBillingInterval, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';

export class SubscriptionResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  id!: string;

  @ApiProperty({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  userId!: string;

  @ApiPropertyOptional({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  sponsorProfileId?: string | null;

  @ApiPropertyOptional({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  vendorProfileId?: string | null;

  @ApiProperty({ enum: SubscriptionPlan, example: SubscriptionPlan.SPONSOR_MONTHLY })
  plan!: SubscriptionPlan;

  @ApiProperty({ enum: SubscriptionStatus, example: SubscriptionStatus.ACTIVE })
  status!: SubscriptionStatus;

  @ApiProperty({ example: 1500 })
  amount!: number;

  @ApiProperty({ example: 'SAR' })
  currency!: string;

  @ApiProperty({ enum: SubscriptionBillingInterval, example: SubscriptionBillingInterval.MONTH })
  interval!: SubscriptionBillingInterval;

  @ApiPropertyOptional({ example: '2026-09-12T18:00:00.000Z' })
  currentPeriodStart?: Date | null;

  @ApiPropertyOptional({ example: '2026-10-12T18:00:00.000Z' })
  currentPeriodEnd?: Date | null;

  @ApiProperty({ example: false })
  cancelAtPeriodEnd!: boolean;

  @ApiPropertyOptional({ example: '2026-09-12T18:00:00.000Z' })
  canceledAt?: Date | null;

  @ApiProperty({ example: '2026-09-12T18:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-09-12T18:00:00.000Z' })
  updatedAt!: Date;
}

export class PaginatedSubscriptionsDto {
  @ApiProperty({ type: [SubscriptionResponseDto] })
  items!: SubscriptionResponseDto[];

  @ApiProperty({ example: 25 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 2 })
  totalPages!: number;
}
