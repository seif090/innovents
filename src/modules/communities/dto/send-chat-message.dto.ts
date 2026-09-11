import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { COMMUNITY_LIMITS } from '../constants/communities.constants';

export class SendChatMessageDto {
  @ApiProperty({
    description: 'Chat message content (1 to 2000 characters)',
    example: 'Hey everyone, meeting by the coffee booth in 5 minutes!',
    minLength: COMMUNITY_LIMITS.CHAT_MESSAGE_MIN_LENGTH,
    maxLength: COMMUNITY_LIMITS.CHAT_MESSAGE_MAX_LENGTH,
  })
  @IsString({ message: 'content must be a string' })
  @IsNotEmpty({ message: 'content is required' })
  @MinLength(COMMUNITY_LIMITS.CHAT_MESSAGE_MIN_LENGTH, {
    message: `content must be at least ${COMMUNITY_LIMITS.CHAT_MESSAGE_MIN_LENGTH} characters`,
  })
  @MaxLength(COMMUNITY_LIMITS.CHAT_MESSAGE_MAX_LENGTH, {
    message: `content cannot exceed ${COMMUNITY_LIMITS.CHAT_MESSAGE_MAX_LENGTH} characters`,
  })
  content!: string;
}
