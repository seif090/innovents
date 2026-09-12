import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CancelSubscriptionDto {
  @ApiPropertyOptional({
    description:
      'If true, cancels subscription immediately instead of waiting for period end (default: false)',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  immediately?: boolean = false;

  @ApiPropertyOptional({
    description: 'Cancellation reason',
    example: 'Switching to another organization tier',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
