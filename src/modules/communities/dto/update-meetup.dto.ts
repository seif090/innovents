import {
  IsString,
  MaxLength,
  MinLength,
  IsDateString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsUrl,
  IsEnum,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { CommunityMeetupStatus } from '@prisma/client';
import { COMMUNITY_LIMITS } from '../constants/communities.constants';

export class UpdateMeetupDto {
  @ApiPropertyOptional({
    description: 'Meetup title',
    minLength: COMMUNITY_LIMITS.MEETUP_TITLE_MIN_LENGTH,
    maxLength: COMMUNITY_LIMITS.MEETUP_TITLE_MAX_LENGTH,
  })
  @IsOptional()
  @IsString({ message: 'title must be a string' })
  @MinLength(COMMUNITY_LIMITS.MEETUP_TITLE_MIN_LENGTH, {
    message: `title must be at least ${COMMUNITY_LIMITS.MEETUP_TITLE_MIN_LENGTH} characters`,
  })
  @MaxLength(COMMUNITY_LIMITS.MEETUP_TITLE_MAX_LENGTH, {
    message: `title cannot exceed ${COMMUNITY_LIMITS.MEETUP_TITLE_MAX_LENGTH} characters`,
  })
  title?: string;

  @ApiPropertyOptional({
    description: 'Description of what will happen in the meetup',
    minLength: COMMUNITY_LIMITS.MEETUP_DESC_MIN_LENGTH,
    maxLength: COMMUNITY_LIMITS.MEETUP_DESC_MAX_LENGTH,
  })
  @IsOptional()
  @IsString({ message: 'description must be a string' })
  @MinLength(COMMUNITY_LIMITS.MEETUP_DESC_MIN_LENGTH, {
    message: `description must be at least ${COMMUNITY_LIMITS.MEETUP_DESC_MIN_LENGTH} characters`,
  })
  @MaxLength(COMMUNITY_LIMITS.MEETUP_DESC_MAX_LENGTH, {
    message: `description cannot exceed ${COMMUNITY_LIMITS.MEETUP_DESC_MAX_LENGTH} characters`,
  })
  description?: string;

  @ApiPropertyOptional({
    description: 'Start date and time (ISO 8601 UTC)',
  })
  @IsOptional()
  @IsDateString({}, { message: 'startsAt must be a valid ISO 8601 date string' })
  startsAt?: string;

  @ApiPropertyOptional({
    description: 'End date and time (ISO 8601 UTC)',
  })
  @IsOptional()
  @IsDateString({}, { message: 'endsAt must be a valid ISO 8601 date string' })
  endsAt?: string;

  @ApiPropertyOptional({
    description: 'Physical location',
    maxLength: COMMUNITY_LIMITS.MEETUP_LOCATION_MAX_LENGTH,
  })
  @IsOptional()
  @IsString({ message: 'location must be a string' })
  @MaxLength(COMMUNITY_LIMITS.MEETUP_LOCATION_MAX_LENGTH, {
    message: `location cannot exceed ${COMMUNITY_LIMITS.MEETUP_LOCATION_MAX_LENGTH} characters`,
  })
  location?: string;

  @ApiPropertyOptional({
    description: 'Map URL',
  })
  @IsOptional()
  @IsUrl({}, { message: 'mapUrl must be a valid URL' })
  mapUrl?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of participants',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'participantLimit must be an integer' })
  @Min(1, { message: 'participantLimit must be at least 1' })
  @Max(10000, { message: 'participantLimit cannot exceed 10,000' })
  participantLimit?: number;

  @ApiPropertyOptional({
    description: 'Meetup status',
    enum: CommunityMeetupStatus,
  })
  @IsOptional()
  @IsEnum(CommunityMeetupStatus)
  status?: CommunityMeetupStatus;
}
