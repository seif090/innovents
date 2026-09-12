import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ReportStatus, ReportTargetType } from '@prisma/client';

export class ReportQueryDto {
  @ApiPropertyOptional({
    description: 'Filter reports by lifecycle status',
    enum: ReportStatus,
    example: ReportStatus.OPEN,
  })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional({
    description: 'Filter reports by target entity type',
    enum: ReportTargetType,
    example: ReportTargetType.COMMUNITY_POST,
  })
  @IsOptional()
  @IsEnum(ReportTargetType)
  targetType?: ReportTargetType;

  @ApiPropertyOptional({
    description: 'Filter reports submitted by a specific user UUID',
    example: '11111111-2222-3333-4444-555555555555',
  })
  @IsOptional()
  @IsUUID('4')
  reporterId?: string;

  @ApiPropertyOptional({ description: 'Page number (default 1)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page (default 20, max 100)',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
