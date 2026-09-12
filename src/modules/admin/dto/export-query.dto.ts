import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ExportQueryDto {
  @ApiPropertyOptional({
    description: 'Bounded number of records to export (max 5000)',
    default: 1000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit: number = 1000;

  @ApiPropertyOptional({ description: 'Filter export by start date (ISO8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Filter export by end date (ISO8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
