import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportStatus, ReportTargetType } from '@prisma/client';

export class ReportUserSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;
}

export class ReportResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  reporterId!: string;

  @ApiProperty({ enum: ReportTargetType })
  targetType!: ReportTargetType;

  @ApiProperty()
  targetId!: string;

  @ApiProperty()
  reason!: string;

  @ApiPropertyOptional()
  description?: string | null;

  @ApiProperty({ enum: ReportStatus })
  status!: ReportStatus;

  @ApiPropertyOptional()
  resolvedByUserId?: string | null;

  @ApiPropertyOptional()
  resolvedAt?: Date | null;

  @ApiPropertyOptional()
  resolutionNote?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional({ type: ReportUserSummaryDto })
  reporter?: ReportUserSummaryDto | null;

  @ApiPropertyOptional({ type: ReportUserSummaryDto })
  resolvedBy?: ReportUserSummaryDto | null;
}

export class PaginatedReportsDto {
  @ApiProperty({ type: [ReportResponseDto] })
  items!: ReportResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  totalPages!: number;
}
