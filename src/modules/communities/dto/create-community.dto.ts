import {
  IsString,
  IsNotEmpty,
  MaxLength,
  MinLength,
  IsUUID,
  IsEnum,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsUrl,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { CommunityType, CommunityVisibility } from '@prisma/client';
import { COMMUNITY_LIMITS } from '../constants/communities.constants';

export class CreateCommunityDto {
  @ApiProperty({
    description: 'Target Event UUID to which this community belongs',
    example: '11111111-1111-1111-1111-111111111111',
  })
  @IsUUID('4', { message: 'eventId must be a valid UUID v4' })
  @IsNotEmpty({ message: 'eventId is required' })
  eventId!: string;

  @ApiProperty({
    description: 'Community name (card header)',
    example: 'AI & DeepTech Innovators',
    minLength: COMMUNITY_LIMITS.NAME_MIN_LENGTH,
    maxLength: COMMUNITY_LIMITS.NAME_MAX_LENGTH,
  })
  @IsString({ message: 'name must be a string' })
  @IsNotEmpty({ message: 'name is required' })
  @MinLength(COMMUNITY_LIMITS.NAME_MIN_LENGTH, {
    message: `name must be at least ${COMMUNITY_LIMITS.NAME_MIN_LENGTH} characters`,
  })
  @MaxLength(COMMUNITY_LIMITS.NAME_MAX_LENGTH, {
    message: `name cannot exceed ${COMMUNITY_LIMITS.NAME_MAX_LENGTH} characters`,
  })
  name!: string;

  @ApiProperty({
    description: 'Short bio displayed on card preview',
    example: 'Discussing autonomous agents, foundational models, and frontier research.',
    minLength: COMMUNITY_LIMITS.BIO_MIN_LENGTH,
    maxLength: COMMUNITY_LIMITS.BIO_MAX_LENGTH,
  })
  @IsString({ message: 'bio must be a string' })
  @IsNotEmpty({ message: 'bio is required' })
  @MinLength(COMMUNITY_LIMITS.BIO_MIN_LENGTH, {
    message: `bio must be at least ${COMMUNITY_LIMITS.BIO_MIN_LENGTH} characters`,
  })
  @MaxLength(COMMUNITY_LIMITS.BIO_MAX_LENGTH, {
    message: `bio cannot exceed ${COMMUNITY_LIMITS.BIO_MAX_LENGTH} characters`,
  })
  bio!: string;

  @ApiProperty({
    description: 'Full detailed community description',
    example:
      'Welcome to the official AI Innovators community for INOVENT. Join discussions, meet peers, and coordinate mini events.',
    minLength: COMMUNITY_LIMITS.DESCRIPTION_MIN_LENGTH,
    maxLength: COMMUNITY_LIMITS.DESCRIPTION_MAX_LENGTH,
  })
  @IsString({ message: 'description must be a string' })
  @IsNotEmpty({ message: 'description is required' })
  @MinLength(COMMUNITY_LIMITS.DESCRIPTION_MIN_LENGTH, {
    message: `description must be at least ${COMMUNITY_LIMITS.DESCRIPTION_MIN_LENGTH} characters`,
  })
  @MaxLength(COMMUNITY_LIMITS.DESCRIPTION_MAX_LENGTH, {
    message: `description cannot exceed ${COMMUNITY_LIMITS.DESCRIPTION_MAX_LENGTH} characters`,
  })
  description!: string;

  @ApiProperty({
    description: 'Community topic / category',
    example: 'Technology',
    maxLength: COMMUNITY_LIMITS.CATEGORY_MAX_LENGTH,
  })
  @IsString({ message: 'category must be a string' })
  @IsNotEmpty({ message: 'category is required' })
  @MaxLength(COMMUNITY_LIMITS.CATEGORY_MAX_LENGTH, {
    message: `category cannot exceed ${COMMUNITY_LIMITS.CATEGORY_MAX_LENGTH} characters`,
  })
  category!: string;

  @ApiPropertyOptional({
    description: 'Community type: FREE (default, 20 max members) or SPONSORED (Sponsor/Admin only)',
    enum: CommunityType,
    default: CommunityType.FREE,
  })
  @IsOptional()
  @IsEnum(CommunityType, { message: 'type must be FREE or SPONSORED' })
  type?: CommunityType = CommunityType.FREE;

  @ApiPropertyOptional({
    description: 'Community visibility: PUBLIC (discoverable) or PRIVATE (invite only)',
    enum: CommunityVisibility,
    default: CommunityVisibility.PUBLIC,
  })
  @IsOptional()
  @IsEnum(CommunityVisibility, { message: 'visibility must be PUBLIC or PRIVATE' })
  visibility?: CommunityVisibility = CommunityVisibility.PUBLIC;

  @ApiPropertyOptional({
    description: 'Cover image URL (recommended 1200x628)',
    example: 'https://cdn.innovent.app/communities/cover.jpg',
  })
  @IsOptional()
  @IsUrl({}, { message: 'coverImageUrl must be a valid URL' })
  coverImageUrl?: string;

  @ApiPropertyOptional({
    description: 'Preferred language: AR, EN, or BILINGUAL',
    example: 'BILINGUAL',
  })
  @IsOptional()
  @IsString({ message: 'language must be a string' })
  language?: string;

  @ApiPropertyOptional({
    description:
      'Maximum member capacity (capped at 20 for FREE communities, configurable for SPONSORED)',
    example: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'memberCapacity must be an integer' })
  @Min(2, { message: 'memberCapacity must be at least 2' })
  @Max(100000, { message: 'memberCapacity cannot exceed 100,000' })
  memberCapacity?: number;
}
