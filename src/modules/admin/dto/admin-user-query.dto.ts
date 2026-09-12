import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { AccountStatus } from '@prisma/client';

export class AdminUserQueryDto {
  @ApiPropertyOptional({ description: 'Search term for email or phone' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by role name (e.g. ADMIN, SPONSOR, VENDOR, ATTENDEE)',
  })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ enum: AccountStatus, description: 'Filter by account lifecycle status' })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @ApiPropertyOptional({ description: 'Filter by email verification status' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  emailVerified?: boolean;

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
