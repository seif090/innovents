import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommunityPostStatus, CommunityMemberRole } from '@prisma/client';

export class ReplyAuthorResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ enum: CommunityMemberRole })
  communityRole?: CommunityMemberRole | null;
}

export class ReplyResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  postId!: string;

  @ApiProperty()
  authorId!: string;

  @ApiPropertyOptional()
  parentReplyId?: string | null;

  @ApiProperty()
  content!: string;

  @ApiProperty({ enum: CommunityPostStatus })
  status!: CommunityPostStatus;

  @ApiProperty()
  likeCount!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional({ type: ReplyAuthorResponseDto })
  author?: ReplyAuthorResponseDto;

  @ApiPropertyOptional()
  likedByCurrentUser?: boolean;

  @ApiPropertyOptional({ type: () => [ReplyResponseDto] })
  childReplies?: ReplyResponseDto[];
}
