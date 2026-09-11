import {
  IsString,
  IsNotEmpty,
  MaxLength,
  MinLength,
  IsDateString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsUrl,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { COMMUNITY_LIMITS } from '../constants/communities.constants';

export class CreateMeetupDto {
  @ApiProperty({
    description: 'Meetup title (pinned at the top of community)',
    example: 'DeepTech Coffee & Agentic AI Jam',
    minLength: COMMUNITY_LIMITS.MEETUP_TITLE_MIN_LENGTH,
    maxLength: COMMUNITY_LIMITS.MEETUP_TITLE_MAX_LENGTH,
  })
  @IsString({ message: 'title must be a string' })
  @IsNotEmpty({ message: 'title is required' })
  @MinLength(COMMUNITY_LIMITS.MEETUP_TITLE_MIN_LENGTH, {
    message: `title must be at least ${COMMUNITY_LIMITS.MEETUP_TITLE_MIN_LENGTH} characters`,
  })
  @MaxLength(COMMUNITY_LIMITS.MEETUP_TITLE_MAX_LENGTH, {
    message: `title cannot exceed ${COMMUNITY_LIMITS.MEETUP_TITLE_MAX_LENGTH} characters`,
  })
  title!: string;

  @ApiProperty({
    description: 'Description of what will happen in the meetup',
    example: 'Casual networking and live demo exchange at Lounge B.',
    minLength: COMMUNITY_LIMITS.MEETUP_DESC_MIN_LENGTH,
    maxLength: COMMUNITY_LIMITS.MEETUP_DESC_MAX_LENGTH,
  })
  @IsString({ message: 'description must be a string' })
  @IsNotEmpty({ message: 'description is required' })
  @MinLength(COMMUNITY_LIMITS.MEETUP_DESC_MIN_LENGTH, {
    message: `description must be at least ${COMMUNITY_LIMITS.MEETUP_DESC_MIN_LENGTH} characters`,
  })
  @MaxLength(COMMUNITY_LIMITS.MEETUP_DESC_MAX_LENGTH, {
    message: `description cannot exceed ${COMMUNITY_LIMITS.MEETUP_DESC_MAX_LENGTH} characters`,
  })
  description!: string;

  @ApiProperty({
    description: 'Start date and time (ISO 8601 UTC)',
    example: '2026-10-15T14:00:00.000Z',
  })
  @IsNotEmpty({ message: 'startsAt is required' })
  @IsDateString({}, { message: 'startsAt must be a valid ISO 8601 date string' })
  startsAt!: string;

  @ApiPropertyOptional({
    description: 'End date and time (ISO 8601 UTC, must be after startsAt)',
    example: '2026-10-15T16:00:00.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'endsAt must be a valid ISO 8601 date string' })
  endsAt?: string;

  @ApiProperty({
    description: 'Physical location inside or outside venue',
    example: 'Hall B - Coffee Corner',
    maxLength: COMMUNITY_LIMITS.MEETUP_LOCATION_MAX_LENGTH,
  })
  @IsString({ message: 'location must be a string' })
  @IsNotEmpty({ message: 'location is required' })
  @MaxLength(COMMUNITY_LIMITS.MEETUP_LOCATION_MAX_LENGTH, {
    message: `location cannot exceed ${COMMUNITY_LIMITS.MEETUP_LOCATION_MAX_LENGTH} characters`,
  })
  location!: string;

  @ApiPropertyOptional({
    description: 'Map URL (e.g. Google Maps location)',
    example: 'https://maps.google.com/?q=24.7136,46.6753',
  })
  @IsOptional()
  @IsUrl({}, { message: 'mapUrl must be a valid URL' })
  mapUrl?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of participants (empty / null = unlimited)',
    example: 25,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'participantLimit must be an integer' })
  @Min(1, { message: 'participantLimit must be at least 1' })
  @Max(10000, { message: 'participantLimit cannot exceed 10,000' })
  participantLimit?: number;
}
