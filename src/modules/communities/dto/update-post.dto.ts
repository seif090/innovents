import {
  IsString,
  MaxLength,
  MinLength,
  IsOptional,
  IsArray,
  IsUrl,
  ArrayMaxSize,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { COMMUNITY_LIMITS } from '../constants/communities.constants';

export class UpdatePostDto {
  @ApiPropertyOptional({
    description: 'Updated post content (10 to 2000 characters)',
    minLength: COMMUNITY_LIMITS.POST_MIN_LENGTH,
    maxLength: COMMUNITY_LIMITS.POST_MAX_LENGTH,
  })
  @IsOptional()
  @IsString({ message: 'content must be a string' })
  @MinLength(COMMUNITY_LIMITS.POST_MIN_LENGTH, {
    message: `content must be at least ${COMMUNITY_LIMITS.POST_MIN_LENGTH} characters`,
  })
  @MaxLength(COMMUNITY_LIMITS.POST_MAX_LENGTH, {
    message: `content cannot exceed ${COMMUNITY_LIMITS.POST_MAX_LENGTH} characters`,
  })
  content?: string;

  @ApiPropertyOptional({
    description: 'Attached media URLs (max 4)',
  })
  @IsOptional()
  @IsArray({ message: 'attachments must be an array of URLs' })
  @ArrayMaxSize(4, { message: 'Maximum 4 attachments allowed' })
  @IsUrl({}, { each: true, message: 'Each attachment must be a valid URL' })
  attachments?: string[];

  @ApiPropertyOptional({
    description: 'External link URL',
  })
  @IsOptional()
  @IsUrl({}, { message: 'linkUrl must be a valid URL' })
  linkUrl?: string;
}
