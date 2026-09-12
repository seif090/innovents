import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class RedeemCouponDto {
  @ApiProperty({
    description: 'Coupon code to redeem',
    example: 'SUMMIT20',
  })
  @IsString()
  @IsNotEmpty({ message: 'code is required' })
  @MaxLength(50)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  code!: string;

  @ApiProperty({
    description: 'Event ID the redemption belongs to',
    example: 'd3b07384-d113-4ec6-a1a7-19803126be1e',
  })
  @IsUUID('4', { message: 'eventId must be a valid UUID' })
  @IsNotEmpty({ message: 'eventId is required' })
  eventId!: string;

  @ApiPropertyOptional({
    description: 'Optional C2B service ID being purchased/booked',
    example: 'd3b07384-d113-4ec6-a1a7-19803126be1e',
  })
  @IsOptional()
  @IsUUID('4')
  serviceId?: string;

  @ApiPropertyOptional({
    description:
      'Client idempotency key preventing duplicate network submissions (DO NOT use timestamp)',
    example: 'coupon-redemption:user123:promo2026',
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
