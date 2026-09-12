import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AdminAuditQueryDto {
  @ApiPropertyOptional({ description: 'Filter by actor User UUID' })
  @IsOptional()
  @IsUUID('4')
  actorUserId?: string;

  @ApiPropertyOptional({
    description: 'Filter by action verb (e.g. USER_SUSPENDED, REPORT_RESOLVED)',
  })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ description: 'Filter by resource type (e.g. USER, REPORT, PAYMENT)' })
  @IsOptional()
  @IsString()
  resourceType?: string;

  @ApiPropertyOptional({ description: 'Filter by specific resource ID' })
  @IsOptional()
  @IsString()
  resourceId?: string;

  @ApiPropertyOptional({ description: 'Start date filter (ISO8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date filter (ISO8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ description: 'Limit per page (max 100)', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
