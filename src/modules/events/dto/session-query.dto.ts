import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class SessionQueryDto {
  @ApiPropertyOptional({
    description: 'Filter sessions for a specific date (YYYY-MM-DD)',
    example: '2026-11-15',
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({
    description: 'Filter sessions by venue/hall ID',
    example: 'e3b8a5c2-1234-5678-90ab-cdef12345678',
  })
  @IsOptional()
  @IsUUID('4', { message: 'venueId must be a valid UUID' })
  venueId?: string;
}
