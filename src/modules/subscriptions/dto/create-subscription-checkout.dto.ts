import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { SubscriptionPlan } from '@prisma/client';

export class CreateSubscriptionCheckoutDto {
  @ApiProperty({
    enum: SubscriptionPlan,
    example: SubscriptionPlan.SPONSOR_MONTHLY,
    description: 'Target platform subscription plan',
  })
  @IsEnum(SubscriptionPlan)
  plan!: SubscriptionPlan;

  @ApiPropertyOptional({
    description: 'Redirect URL on successful Stripe checkout',
    example: 'https://app.innovent.com/subscriptions/success',
  })
  @IsOptional()
  @IsString()
  successUrl?: string;

  @ApiPropertyOptional({
    description: 'Redirect URL if checkout was cancelled',
    example: 'https://app.innovent.com/subscriptions/cancel',
  })
  @IsOptional()
  @IsString()
  cancelUrl?: string;
}

export class SubscriptionCheckoutResponseDto {
  @ApiProperty({ description: 'Stripe Checkout Session URL to redirect user' })
  checkoutUrl!: string;

  @ApiProperty({ description: 'Stripe Checkout Session ID' })
  sessionId!: string;
}
