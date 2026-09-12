import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReportStatus } from '@prisma/client';

export class ResolveReportDto {
  @ApiProperty({
    description: 'Target lifecycle status for the report',
    enum: [ReportStatus.IN_REVIEW, ReportStatus.RESOLVED, ReportStatus.DISMISSED],
    example: ReportStatus.RESOLVED,
  })
  @IsEnum(ReportStatus)
  @IsNotEmpty()
  status!: ReportStatus;

  @ApiPropertyOptional({
    description: 'Administrative resolution note or moderation rationale',
    example: 'Post hidden and author warned for community guideline violation',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolutionNote?: string;
}
