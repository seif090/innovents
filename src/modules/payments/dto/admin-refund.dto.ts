import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class AdminRefundDto {
  @ApiPropertyOptional({
    description: 'Optional partial refund amount. If omitted, full payment amount is refunded.',
    example: 250,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({
    description: 'Reason for issuing the refund',
    example: 'Service dissatisfaction / customer agreement',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
