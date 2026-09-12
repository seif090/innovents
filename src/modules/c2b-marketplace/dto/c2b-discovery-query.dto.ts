import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Max,
  IsBoolean,
  IsNumber,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { C2bServiceCategory } from '@prisma/client';

export class C2bDiscoveryQueryDto {
  @ApiPropertyOptional({
    description:
      'Event ID to filter services for. If omitted, services across active events are returned.',
    example: 'd3b07384-d113-4ec6-a1a7-19803126be1e',
  })
  @IsOptional()
  @IsUUID('4')
  eventId?: string;

  @ApiPropertyOptional({
    description: 'Service category filter',
    enum: C2bServiceCategory,
    example: C2bServiceCategory.ACCOMMODATION,
  })
  @IsOptional()
  @IsEnum(C2bServiceCategory)
  category?: C2bServiceCategory;

  @ApiPropertyOptional({
    description: 'Provider ID filter',
    example: 'd3b07384-d113-4ec6-a1a7-19803126be1e',
  })
  @IsOptional()
  @IsUUID('4')
  providerId?: string;

  @ApiPropertyOptional({
    description: 'Search keyword matching service name or descriptions',
    example: 'hotel',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @ApiPropertyOptional({
    description: 'Minimum price filter',
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minPrice?: number;

  @ApiPropertyOptional({
    description: 'Maximum price filter',
    example: 1000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxPrice?: number;

  @ApiPropertyOptional({
    description: 'Filter only services that currently have remaining booking capacity',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  availableNow?: boolean;

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

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['createdAt', 'price', 'expiresAt'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  sortBy?: 'createdAt' | 'price' | 'expiresAt' = 'createdAt';

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
