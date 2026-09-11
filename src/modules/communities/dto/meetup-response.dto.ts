import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommunityMeetupStatus } from '@prisma/client';

export class MeetupCreatorResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;
}

export class MeetupResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  communityId!: string;

  @ApiProperty()
  eventId!: string;

  @ApiProperty()
  createdById!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  startsAt!: Date;

  @ApiPropertyOptional()
  endsAt?: Date | null;

  @ApiProperty()
  location!: string;

  @ApiPropertyOptional()
  mapUrl?: string | null;

  @ApiPropertyOptional()
  participantLimit?: number | null;

  @ApiProperty()
  participantCount!: number;

  @ApiProperty()
  isPinned!: boolean;

  @ApiProperty({ enum: CommunityMeetupStatus })
  status!: CommunityMeetupStatus;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional({ type: MeetupCreatorResponseDto })
  creator?: MeetupCreatorResponseDto;

  @ApiPropertyOptional()
  isParticipating?: boolean;
}
