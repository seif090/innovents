import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { SessionStatus } from '@prisma/client';

export class CreateSessionDto {
  @ApiProperty({
    description: 'Session title',
    example: 'Keynote: Generative AI in Smart Cities',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty({ message: 'Session title is required' })
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  title!: string;

  @ApiPropertyOptional({
    description: 'Session description (max 2000 characters)',
    example: 'An overview of large foundation models deployed in municipal automation.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  description?: string;

  @ApiProperty({
    description: 'Session start datetime in ISO 8601 UTC format',
    example: '2026-11-15T10:00:00.000Z',
  })
  @IsDateString({}, { message: 'startsAt must be a valid ISO 8601 date string' })
  startsAt!: string;

  @ApiProperty({
    description: 'Session end datetime in ISO 8601 UTC format (must be after startsAt)',
    example: '2026-11-15T11:00:00.000Z',
  })
  @IsDateString({}, { message: 'endsAt must be a valid ISO 8601 date string' })
  endsAt!: string;

  @ApiPropertyOptional({
    description: 'Assigned venue/hall ID (must belong to this same event)',
    example: 'e3b8a5c2-1234-5678-90ab-cdef12345678',
  })
  @IsOptional()
  @IsUUID('4', { message: 'venueId must be a valid UUID' })
  venueId?: string;

  @ApiPropertyOptional({
    description: 'Array of speaker IDs assigned to this session (must belong to this event)',
    example: ['f4c9b6d3-2345-6789-01bc-def012345679'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'Each speakerId must be a valid UUID' })
  speakerIds?: string[];

  @ApiPropertyOptional({
    description: 'Display order priority in agenda timeline',
    example: 0,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional({
    description: 'Session operational status',
    enum: SessionStatus,
    default: SessionStatus.SCHEDULED,
  })
  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;
}
