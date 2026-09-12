import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ReportTargetType } from '@prisma/client';

export class CreateReportDto {
  @ApiProperty({
    description: 'Target type of the resource being reported',
    enum: ReportTargetType,
    example: ReportTargetType.COMMUNITY_POST,
  })
  @IsEnum(ReportTargetType)
  @IsNotEmpty()
  targetType!: ReportTargetType;

  @ApiProperty({
    description: 'UUID of the target resource being reported',
    example: '11111111-2222-3333-4444-555555555555',
  })
  @IsUUID('4')
  @IsNotEmpty()
  targetId!: string;

  @ApiProperty({
    description: 'Primary reason for the report (e.g. SPAM, HARASSMENT, INAPPROPRIATE_CONTENT)',
    example: 'SPAM',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  reason!: string;

  @ApiPropertyOptional({
    description: 'Additional contextual description or evidence',
    example: 'This post contains repetitive promotional links violating community guidelines',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
