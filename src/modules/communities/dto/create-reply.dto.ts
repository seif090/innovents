import {
  IsString,
  IsNotEmpty,
  MaxLength,
  MinLength,
  IsOptional,
  IsUUID,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { COMMUNITY_LIMITS } from '../constants/communities.constants';

export class CreateReplyDto {
  @ApiProperty({
    description: 'Reply text content (1 to 2000 characters)',
    example: 'Completely agree! The attention mechanism details were fascinating.',
    minLength: COMMUNITY_LIMITS.REPLY_MIN_LENGTH,
    maxLength: COMMUNITY_LIMITS.REPLY_MAX_LENGTH,
  })
  @IsString({ message: 'content must be a string' })
  @IsNotEmpty({ message: 'content is required' })
  @MinLength(COMMUNITY_LIMITS.REPLY_MIN_LENGTH, {
    message: `content must be at least ${COMMUNITY_LIMITS.REPLY_MIN_LENGTH} characters`,
  })
  @MaxLength(COMMUNITY_LIMITS.REPLY_MAX_LENGTH, {
    message: `content cannot exceed ${COMMUNITY_LIMITS.REPLY_MAX_LENGTH} characters`,
  })
  content!: string;

  @ApiPropertyOptional({
    description: 'Optional parent reply UUID for threaded / nested discussions',
    example: '22222222-2222-2222-2222-222222222222',
  })
  @IsOptional()
  @IsUUID('4', { message: 'parentReplyId must be a valid UUID v4' })
  parentReplyId?: string;

  @ApiPropertyOptional({
    description: 'Explicit list of mentioned user IDs in this reply',
    example: ['11111111-1111-1111-1111-111111111111'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'Each mentioned user ID must be a valid UUID v4' })
  mentionedUserIds?: string[];
}
