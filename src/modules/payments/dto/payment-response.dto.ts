import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentPurpose, PaymentStatus } from '@prisma/client';

export class PaymentResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  id!: string;

  @ApiProperty({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  userId!: string;

  @ApiPropertyOptional({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  sponsorProfileId?: string | null;

  @ApiPropertyOptional({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  vendorProfileId?: string | null;

  @ApiPropertyOptional({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  subscriptionId?: string | null;

  @ApiProperty({ example: 500 })
  amount!: number;

  @ApiProperty({ example: 'SAR' })
  currency!: string;

  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.SUCCEEDED })
  status!: PaymentStatus;

  @ApiProperty({ enum: PaymentPurpose, example: PaymentPurpose.COMMUNITY_SPONSORSHIP })
  purpose!: PaymentPurpose;

  @ApiPropertyOptional({ example: 'cs_test_123' })
  stripeCheckoutSessionId?: string | null;

  @ApiPropertyOptional({ example: 'pi_test_123' })
  stripePaymentIntentId?: string | null;

  @ApiPropertyOptional({ example: '2026-09-12T18:00:00.000Z' })
  paidAt?: Date | null;

  @ApiPropertyOptional({ example: '2026-09-12T18:00:00.000Z' })
  refundedAt?: Date | null;

  @ApiPropertyOptional({ example: 500 })
  refundAmount?: number | null;

  @ApiPropertyOptional({ example: 'Customer requested cancellation' })
  refundReason?: string | null;

  @ApiProperty({ example: '2026-09-12T18:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-09-12T18:00:00.000Z' })
  updatedAt!: Date;
}

export class PaginatedPaymentsDto {
  @ApiProperty({ type: [PaymentResponseDto] })
  items!: PaymentResponseDto[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}
