import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { SponsorAdPlacement, SponsorAdStatus } from '@prisma/client';

export class SponsorAdQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by event ID',
    example: 'd3b07384-d113-4ec6-a1a7-19803126be1e',
  })
  @IsOptional()
  @IsUUID('4')
  eventId?: string;

  @ApiPropertyOptional({
    description: 'Filter by ad placement',
    enum: SponsorAdPlacement,
    example: SponsorAdPlacement.MARKETPLACE,
  })
  @IsOptional()
  @IsEnum(SponsorAdPlacement)
  placement?: SponsorAdPlacement;

  @ApiPropertyOptional({
    description: 'Filter by ad status (admin and sponsor only)',
    enum: SponsorAdStatus,
    example: SponsorAdStatus.PENDING_REVIEW,
  })
  @IsOptional()
  @IsEnum(SponsorAdStatus)
  status?: SponsorAdStatus;

  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    default: 1,
    minimum: 1,
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Page size limit (max 100)',
    default: 20,
    minimum: 1,
    maximum: 100,
    example: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  pageSize?: number = 20;
}
