import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CancelRfqDto {
  @ApiPropertyOptional({
    description: 'Reason for cancelling the RFQ',
    example: 'Event requirements changed; budget re-allocated.',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  reason?: string;
}

export class RejectRfqDto {
  @ApiPropertyOptional({
    description: 'Reason for rejecting the RFQ',
    example: 'Capacity fully booked for requested dates.',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  reason?: string;
}
