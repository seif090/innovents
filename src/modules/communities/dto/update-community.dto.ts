import {
  IsString,
  MaxLength,
  MinLength,
  IsEnum,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsUrl,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { CommunityVisibility } from '@prisma/client';
import { COMMUNITY_LIMITS } from '../constants/communities.constants';

export class UpdateCommunityDto {
  @ApiPropertyOptional({
    description: 'Community name',
    example: 'Updated AI Innovators',
    minLength: COMMUNITY_LIMITS.NAME_MIN_LENGTH,
    maxLength: COMMUNITY_LIMITS.NAME_MAX_LENGTH,
  })
  @IsOptional()
  @IsString({ message: 'name must be a string' })
  @MinLength(COMMUNITY_LIMITS.NAME_MIN_LENGTH, {
    message: `name must be at least ${COMMUNITY_LIMITS.NAME_MIN_LENGTH} characters`,
  })
  @MaxLength(COMMUNITY_LIMITS.NAME_MAX_LENGTH, {
    message: `name cannot exceed ${COMMUNITY_LIMITS.NAME_MAX_LENGTH} characters`,
  })
  name?: string;

  @ApiPropertyOptional({
    description: 'Short bio displayed on card preview',
    minLength: COMMUNITY_LIMITS.BIO_MIN_LENGTH,
    maxLength: COMMUNITY_LIMITS.BIO_MAX_LENGTH,
  })
  @IsOptional()
  @IsString({ message: 'bio must be a string' })
  @MinLength(COMMUNITY_LIMITS.BIO_MIN_LENGTH, {
    message: `bio must be at least ${COMMUNITY_LIMITS.BIO_MIN_LENGTH} characters`,
  })
  @MaxLength(COMMUNITY_LIMITS.BIO_MAX_LENGTH, {
    message: `bio cannot exceed ${COMMUNITY_LIMITS.BIO_MAX_LENGTH} characters`,
  })
  bio?: string;

  @ApiPropertyOptional({
    description: 'Full detailed community description',
    minLength: COMMUNITY_LIMITS.DESCRIPTION_MIN_LENGTH,
    maxLength: COMMUNITY_LIMITS.DESCRIPTION_MAX_LENGTH,
  })
  @IsOptional()
  @IsString({ message: 'description must be a string' })
  @MinLength(COMMUNITY_LIMITS.DESCRIPTION_MIN_LENGTH, {
    message: `description must be at least ${COMMUNITY_LIMITS.DESCRIPTION_MIN_LENGTH} characters`,
  })
  @MaxLength(COMMUNITY_LIMITS.DESCRIPTION_MAX_LENGTH, {
    message: `description cannot exceed ${COMMUNITY_LIMITS.DESCRIPTION_MAX_LENGTH} characters`,
  })
  description?: string;

  @ApiPropertyOptional({
    description: 'Community topic / category',
    maxLength: COMMUNITY_LIMITS.CATEGORY_MAX_LENGTH,
  })
  @IsOptional()
  @IsString({ message: 'category must be a string' })
  @MaxLength(COMMUNITY_LIMITS.CATEGORY_MAX_LENGTH, {
    message: `category cannot exceed ${COMMUNITY_LIMITS.CATEGORY_MAX_LENGTH} characters`,
  })
  category?: string;

  @ApiPropertyOptional({
    description: 'Community visibility',
    enum: CommunityVisibility,
  })
  @IsOptional()
  @IsEnum(CommunityVisibility, { message: 'visibility must be PUBLIC or PRIVATE' })
  visibility?: CommunityVisibility;

  @ApiPropertyOptional({
    description: 'Cover image URL',
  })
  @IsOptional()
  @IsUrl({}, { message: 'coverImageUrl must be a valid URL' })
  coverImageUrl?: string;

  @ApiPropertyOptional({
    description: 'Preferred language: AR, EN, or BILINGUAL',
  })
  @IsOptional()
  @IsString({ message: 'language must be a string' })
  language?: string;

  @ApiPropertyOptional({
    description: 'Maximum member capacity (for sponsored communities)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'memberCapacity must be an integer' })
  @Min(2, { message: 'memberCapacity must be at least 2' })
  @Max(100000, { message: 'memberCapacity cannot exceed 100,000' })
  memberCapacity?: number;
}
