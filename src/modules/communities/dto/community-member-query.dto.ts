import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CommunityMemberRole, CommunityMemberStatus } from '@prisma/client';

export class CommunityMemberQueryDto {
  @ApiPropertyOptional({ description: 'Page number (1-indexed)', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page (max 100)',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @ApiPropertyOptional({ description: 'Filter by member role', enum: CommunityMemberRole })
  @IsOptional()
  @IsEnum(CommunityMemberRole)
  role?: CommunityMemberRole;

  @ApiPropertyOptional({
    description: 'Filter by member status',
    enum: CommunityMemberStatus,
    default: CommunityMemberStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(CommunityMemberStatus)
  status?: CommunityMemberStatus = CommunityMemberStatus.ACTIVE;
}
