import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommunityMemberRole, CommunityMemberStatus } from '@prisma/client';

export class MemberUserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;
}

export class CommunityMemberResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  communityId!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ enum: CommunityMemberRole })
  role!: CommunityMemberRole;

  @ApiProperty({ enum: CommunityMemberStatus })
  status!: CommunityMemberStatus;

  @ApiProperty()
  joinedAt!: Date;

  @ApiPropertyOptional()
  leftAt?: Date | null;

  @ApiPropertyOptional()
  bannedAt?: Date | null;

  @ApiPropertyOptional({ type: MemberUserResponseDto })
  user?: MemberUserResponseDto;
}
