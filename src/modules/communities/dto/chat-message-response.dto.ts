import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommunityMemberRole } from '@prisma/client';

export class ChatSenderResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ enum: CommunityMemberRole })
  role?: CommunityMemberRole | null;
}

export class ChatMessageResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  communityId!: string;

  @ApiProperty()
  senderId!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional({ type: ChatSenderResponseDto })
  sender?: ChatSenderResponseDto;
}
