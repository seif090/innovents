import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventType, EventStatus, EventVisibility, TicketType } from '@prisma/client';

export class EventResponseDto {
  @ApiProperty({ description: 'Unique Event ID (UUID)' })
  id!: string;

  @ApiProperty({ description: 'Event Owner user ID (UUID)' })
  ownerId!: string;

  @ApiProperty({ description: 'Official event name' })
  name!: string;

  @ApiProperty({ description: 'Category type', enum: EventType })
  type!: EventType;

  @ApiProperty({ description: 'Short summary for cards' })
  shortDescription!: string;

  @ApiProperty({ description: 'Full description' })
  description!: string;

  @ApiProperty({ description: 'Event start datetime (ISO 8601 UTC)' })
  startsAt!: string;

  @ApiProperty({ description: 'Event end datetime (ISO 8601 UTC)' })
  endsAt!: string;

  @ApiProperty({ description: 'Venue / facility name' })
  venueName!: string;

  @ApiProperty({ description: 'Full address' })
  address!: string;

  @ApiProperty({ description: 'City' })
  city!: string;

  @ApiProperty({ description: 'Country' })
  country!: string;

  @ApiProperty({ description: 'Total registration capacity' })
  capacity!: number;

  @ApiProperty({ description: 'Current registered attendee count' })
  registeredCount!: number;

  @ApiProperty({ description: 'Cover banner URL' })
  coverImageUrl!: string;

  @ApiProperty({ description: 'Logo URL' })
  logoUrl!: string;

  @ApiProperty({ description: 'Promo video URL' })
  mainVideoUrl!: string;

  @ApiProperty({ description: 'Category tags', type: [String] })
  tags!: string[];

  @ApiProperty({ description: 'Official languages', type: [String] })
  officialLanguages!: string[];

  @ApiProperty({ description: 'Visibility', enum: EventVisibility })
  visibility!: EventVisibility;

  @ApiProperty({ description: 'Ticket type', enum: TicketType })
  ticketType!: TicketType;

  @ApiPropertyOptional({ description: 'Official website URL' })
  websiteUrl?: string | null;

  @ApiProperty({ description: 'Hybrid / virtual attendance supported' })
  isHybrid!: boolean;

  @ApiProperty({ description: 'Event lifecycle status', enum: EventStatus })
  status!: EventStatus;

  @ApiProperty({ description: 'Creation timestamp (ISO 8601 UTC)' })
  createdAt!: string;

  @ApiProperty({ description: 'Last update timestamp (ISO 8601 UTC)' })
  updatedAt!: string;
}

export class PaginatedEventsResponseDto {
  @ApiProperty({ description: 'List of events for current page', type: [EventResponseDto] })
  items!: EventResponseDto[];

  @ApiProperty({ description: 'Current page number (1-indexed)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items requested per page', example: 20 })
  pageSize!: number;

  @ApiProperty({ description: 'Total number of items matching filters', example: 42 })
  total!: number;

  @ApiProperty({ description: 'Total number of pages available', example: 3 })
  totalPages!: number;
}
