import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCommunitySponsorshipCheckoutDto {
  @ApiProperty({
    description: 'Target community ID to sponsor',
    example: 'd3b07384-d113-4ec6-a1a7-19803126be1e',
  })
  @IsUUID('4')
  communityId!: string;

  @ApiPropertyOptional({
    description: 'Community sponsorship plan ID (defaults to active standard plan)',
    example: 'd3b07384-d113-4ec6-a1a7-19803126be1e',
  })
  @IsOptional()
  @IsUUID('4')
  planId?: string;

  @ApiPropertyOptional({
    description: 'Redirect URL on successful Stripe checkout',
    example: 'https://app.innovent.com/communities/123?payment=success',
  })
  @IsOptional()
  @IsString()
  successUrl?: string;

  @ApiPropertyOptional({
    description: 'Redirect URL if checkout was cancelled',
    example: 'https://app.innovent.com/communities/123?payment=cancelled',
  })
  @IsOptional()
  @IsString()
  cancelUrl?: string;
}

export class CheckoutSessionResponseDto {
  @ApiProperty({ description: 'Stripe Checkout Session URL to redirect user' })
  checkoutUrl!: string;

  @ApiProperty({ description: 'Stripe Checkout Session ID' })
  sessionId!: string;

  @ApiProperty({ description: 'Internal payment record ID' })
  paymentId!: string;
}
