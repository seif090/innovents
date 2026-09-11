import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SessionStatus } from '@prisma/client';
import { VenueResponseDto } from './venue-response.dto';
import { SpeakerResponseDto } from './speaker-response.dto';

export class SessionResponseDto {
  @ApiProperty({ description: 'Session ID (UUID)' })
  id!: string;

  @ApiProperty({ description: 'Event ID (UUID)' })
  eventId!: string;

  @ApiPropertyOptional({ description: 'Venue/Hall ID (UUID)' })
  venueId?: string | null;

  @ApiProperty({ description: 'Session title' })
  title!: string;

  @ApiPropertyOptional({ description: 'Session description' })
  description?: string | null;

  @ApiProperty({ description: 'Start datetime (ISO 8601 UTC)' })
  startsAt!: string;

  @ApiProperty({ description: 'End datetime (ISO 8601 UTC)' })
  endsAt!: string;

  @ApiProperty({ description: 'Display order priority in agenda' })
  displayOrder!: number;

  @ApiProperty({ description: 'Session status', enum: SessionStatus })
  status!: SessionStatus;

  @ApiPropertyOptional({ description: 'Assigned venue details', type: VenueResponseDto })
  venue?: VenueResponseDto | null;

  @ApiProperty({ description: 'Assigned speakers', type: [SpeakerResponseDto] })
  speakers!: SpeakerResponseDto[];

  @ApiProperty({ description: 'Creation timestamp (ISO 8601 UTC)' })
  createdAt!: string;

  @ApiProperty({ description: 'Update timestamp (ISO 8601 UTC)' })
  updatedAt!: string;
}
