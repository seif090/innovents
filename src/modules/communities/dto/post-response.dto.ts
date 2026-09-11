import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommunityPostStatus, CommunityMemberRole } from '@prisma/client';

export class PostAuthorResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ enum: CommunityMemberRole })
  communityRole?: CommunityMemberRole | null;
}

export class PostResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  communityId!: string;

  @ApiProperty()
  authorId!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty({ type: [String] })
  attachments!: string[];

  @ApiPropertyOptional()
  linkUrl?: string | null;

  @ApiProperty()
  isPinned!: boolean;

  @ApiProperty({ enum: CommunityPostStatus })
  status!: CommunityPostStatus;

  @ApiProperty()
  likeCount!: number;

  @ApiProperty()
  replyCount!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional({ type: PostAuthorResponseDto })
  author?: PostAuthorResponseDto;

  @ApiPropertyOptional()
  likedByCurrentUser?: boolean;
}
