import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaymentPurpose } from '@prisma/client';

export class RevenueReportQueryDto {
  @ApiPropertyOptional({ description: 'Start date filter (ISO string)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date filter (ISO string)' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ enum: PaymentPurpose })
  @IsOptional()
  @IsEnum(PaymentPurpose)
  purpose?: PaymentPurpose;

  @ApiPropertyOptional({ description: 'Currency filter (default: SAR)', example: 'SAR' })
  @IsOptional()
  @IsString()
  currency?: string;
}

export class PurposeRevenueBreakdownDto {
  @ApiProperty({ example: 10000 })
  gross!: number;

  @ApiProperty({ example: 500 })
  refunds!: number;

  @ApiProperty({ example: 9500 })
  net!: number;

  @ApiProperty({ example: 20 })
  count!: number;
}

export class RevenueReportResponseDto {
  @ApiProperty({ example: 25000 })
  totalGrossRevenue!: number;

  @ApiProperty({ example: 1000 })
  totalRefunds!: number;

  @ApiProperty({ example: 24000 })
  netRevenue!: number;

  @ApiProperty({ example: 'SAR' })
  currency!: string;

  @ApiProperty({ example: 50 })
  successfulTransactions!: number;

  @ApiProperty({ example: 2 })
  refundedTransactions!: number;

  @ApiProperty({
    type: Object,
    example: {
      COMMUNITY_SPONSORSHIP: { gross: 10000, refunds: 500, net: 9500, count: 20 },
      SUBSCRIPTION: { gross: 15000, refunds: 500, net: 14500, count: 30 },
    },
  })
  breakdownByPurpose!: Record<string, PurposeRevenueBreakdownDto>;
}
