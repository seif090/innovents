import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CommunityType,
  CommunityVisibility,
  CommunityStatus,
  CommunityMemberRole,
} from '@prisma/client';

export class CommunityCreatorResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;
}

export class CommunityResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  eventId!: string;

  @ApiProperty()
  createdById!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  bio!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  category!: string;

  @ApiProperty({ enum: CommunityType })
  type!: CommunityType;

  @ApiProperty({ enum: CommunityVisibility })
  visibility!: CommunityVisibility;

  @ApiProperty({ enum: CommunityStatus })
  status!: CommunityStatus;

  @ApiPropertyOptional()
  coverImageUrl?: string | null;

  @ApiPropertyOptional()
  language?: string | null;

  @ApiProperty()
  memberCapacity!: number;

  @ApiProperty()
  memberCount!: number;

  @ApiProperty()
  isSponsored!: boolean;

  @ApiProperty()
  isPinned!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional({ type: CommunityCreatorResponseDto })
  creator?: CommunityCreatorResponseDto;

  @ApiPropertyOptional({ enum: CommunityMemberRole })
  currentUserRole?: CommunityMemberRole | null;

  @ApiPropertyOptional()
  isMember?: boolean;
}
