import {
  IsString,
  IsNotEmpty,
  MaxLength,
  MinLength,
  IsOptional,
  IsArray,
  IsUrl,
  ArrayMaxSize,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { COMMUNITY_LIMITS } from '../constants/communities.constants';

export class CreatePostDto {
  @ApiProperty({
    description: 'Post text content (10 to 2000 characters)',
    example: 'Super excited for the upcoming keynote on generative AI architectures!',
    minLength: COMMUNITY_LIMITS.POST_MIN_LENGTH,
    maxLength: COMMUNITY_LIMITS.POST_MAX_LENGTH,
  })
  @IsString({ message: 'content must be a string' })
  @IsNotEmpty({ message: 'content is required' })
  @MinLength(COMMUNITY_LIMITS.POST_MIN_LENGTH, {
    message: `content must be at least ${COMMUNITY_LIMITS.POST_MIN_LENGTH} characters`,
  })
  @MaxLength(COMMUNITY_LIMITS.POST_MAX_LENGTH, {
    message: `content cannot exceed ${COMMUNITY_LIMITS.POST_MAX_LENGTH} characters`,
  })
  content!: string;

  @ApiPropertyOptional({
    description: 'Attached media URLs (max 4 images or 1 video)',
    example: ['https://cdn.innovent.app/posts/image1.jpg'],
  })
  @IsOptional()
  @IsArray({ message: 'attachments must be an array of URLs' })
  @ArrayMaxSize(4, { message: 'Maximum 4 attachments allowed' })
  @IsUrl({}, { each: true, message: 'Each attachment must be a valid URL' })
  attachments?: string[] = [];

  @ApiPropertyOptional({
    description: 'External link URL with optional preview',
    example: 'https://arxiv.org/abs/2301.00000',
  })
  @IsOptional()
  @IsUrl({}, { message: 'linkUrl must be a valid URL' })
  linkUrl?: string;

  @ApiPropertyOptional({
    description: 'Explicit list of mentioned user IDs in this post',
    example: ['11111111-1111-1111-1111-111111111111'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'Each mentioned user ID must be a valid UUID v4' })
  mentionedUserIds?: string[];
}
