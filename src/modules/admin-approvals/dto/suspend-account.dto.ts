import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class SuspendAccountDto {
  @ApiPropertyOptional({
    example: 'Suspicious login activity or platform terms of service violation.',
    description: 'Reason for suspending the account',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Suspension reason cannot exceed 1000 characters' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  reason?: string;
}
