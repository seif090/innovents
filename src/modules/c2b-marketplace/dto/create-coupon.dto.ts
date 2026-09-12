import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { DiscountType } from '@prisma/client';

export class CreateCouponDto {
  @ApiProperty({
    description: 'Target Event ID the coupon is valid for',
    example: 'd3b07384-d113-4ec6-a1a7-19803126be1e',
  })
  @IsUUID('4', { message: 'eventId must be a valid UUID' })
  @IsNotEmpty({ message: 'eventId is required' })
  eventId!: string;

  @ApiPropertyOptional({
    description: 'Optional C2B service this coupon specifically applies to',
    example: 'd3b07384-d113-4ec6-a1a7-19803126be1e',
  })
  @IsOptional()
  @IsUUID('4')
  serviceId?: string;

  @ApiProperty({
    description: 'Coupon code (case-insensitive, normalized)',
    example: 'SUMMIT20',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty({ message: 'code is required' })
  @MaxLength(50)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  code!: string;

  @ApiPropertyOptional({
    description: 'Promotional description or terms',
    example: '20% off all dining during the event',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Discount calculation type (PERCENTAGE or FIXED_AMOUNT)',
    enum: DiscountType,
    example: DiscountType.PERCENTAGE,
    default: DiscountType.PERCENTAGE,
  })
  @IsEnum(DiscountType, { message: 'discountType must be PERCENTAGE or FIXED_AMOUNT' })
  @IsNotEmpty({ message: 'discountType is required' })
  discountType!: DiscountType;

  @ApiProperty({
    description: 'Discount value (percentage e.g. 20.00 or fixed SAR e.g. 50.00)',
    example: 20.0,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Type(() => Number)
  @IsNotEmpty({ message: 'discountValue is required' })
  discountValue!: number;

  @ApiPropertyOptional({
    description: 'Maximum redemptions across all attendees (null for unlimited)',
    example: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  maxRedemptions?: number;

  @ApiPropertyOptional({
    description: 'Valid starts at date (ISO string)',
    example: '2026-09-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiProperty({
    description: 'Expiration date (ISO string). Clamped to event end date.',
    example: '2026-10-31T23:59:59.000Z',
  })
  @IsDateString({}, { message: 'expiresAt must be a valid ISO 8601 date string' })
  @IsNotEmpty({ message: 'expiresAt is required' })
  expiresAt!: string;

  @ApiPropertyOptional({
    description: 'Active status toggle',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
