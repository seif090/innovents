import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  IsArray,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { EventType, EventVisibility, TicketType } from '@prisma/client';

export class CreateEventDto {
  @ApiProperty({
    description: 'Official event name',
    example: 'Riyadh Global Tech Summit 2026',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty({ message: 'Event name is required' })
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @ApiProperty({
    description: 'Event type category',
    enum: EventType,
    example: EventType.CONFERENCE,
  })
  @IsEnum(EventType, {
    message: 'Type must be one of: CONFERENCE, EXHIBITION, SUMMIT, WORKSHOP, FESTIVAL, NETWORKING',
  })
  type!: EventType;

  @ApiProperty({
    description: 'Short promotional summary for cards and discovery previews (max 200 characters)',
    example: 'The leading artificial intelligence and technology summit in the MENA region.',
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty({ message: 'Short description is required' })
  @MaxLength(200)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  shortDescription!: string;

  @ApiProperty({
    description: 'Detailed event description (max 2000 characters)',
    example:
      'Join 10,000+ technology leaders, founders, and innovators for three days of keynotes, workshops, and networking.',
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty({ message: 'Detailed description is required' })
  @MaxLength(2000)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  description!: string;

  @ApiProperty({
    description: 'Event start datetime in ISO 8601 UTC format',
    example: '2026-11-15T09:00:00.000Z',
  })
  @IsDateString({}, { message: 'startsAt must be a valid ISO 8601 date string' })
  startsAt!: string;

  @ApiProperty({
    description: 'Event end datetime in ISO 8601 UTC format (must be after startsAt)',
    example: '2026-11-17T18:00:00.000Z',
  })
  @IsDateString({}, { message: 'endsAt must be a valid ISO 8601 date string' })
  endsAt!: string;

  @ApiProperty({
    description: 'Physical venue name or facility title',
    example: 'Riyadh Front Exhibition & Convention Center',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty({ message: 'Venue name is required' })
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  venueName!: string;

  @ApiProperty({
    description: 'Full street address',
    example: 'Airport Road, King Khalid International Airport, Riyadh 13412',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty({ message: 'Address is required' })
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  address!: string;

  @ApiProperty({
    description: 'City name',
    example: 'Riyadh',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty({ message: 'City is required' })
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  city!: string;

  @ApiProperty({
    description: 'Country name',
    example: 'Saudi Arabia',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty({ message: 'Country is required' })
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  country!: string;

  @ApiProperty({
    description: 'Maximum attendee capacity (positive integer)',
    example: 1500,
    minimum: 1,
  })
  @IsInt()
  @Min(1, { message: 'Capacity must be at least 1' })
  capacity!: number;

  @ApiProperty({
    description: 'Banner / cover image URL (1200x628px recommended)',
    example: 'https://cdn.innovent.app/events/covers/summit2026.png',
  })
  @IsString()
  @IsNotEmpty({ message: 'Cover image URL is required' })
  @IsUrl({}, { message: 'coverImageUrl must be a valid URL' })
  coverImageUrl!: string;

  @ApiProperty({
    description: 'Transparent PNG event logo URL',
    example: 'https://cdn.innovent.app/events/logos/summit2026.png',
  })
  @IsString()
  @IsNotEmpty({ message: 'Logo URL is required' })
  @IsUrl({}, { message: 'logoUrl must be a valid URL' })
  logoUrl!: string;

  @ApiProperty({
    description: 'Promotional intro video URL',
    example: 'https://cdn.innovent.app/events/videos/summit2026.mp4',
  })
  @IsString()
  @IsNotEmpty({ message: 'Main video URL is required' })
  @IsUrl({}, { message: 'mainVideoUrl must be a valid URL' })
  mainVideoUrl!: string;

  @ApiProperty({
    description: 'Tags / categories for filtering',
    example: ['AI', 'Fintech', 'Robotics'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ message: 'At least one tag is required' })
  tags!: string[];

  @ApiProperty({
    description: 'Official event languages',
    example: ['Arabic', 'English'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ message: 'At least one official language is required' })
  officialLanguages!: string[];

  @ApiPropertyOptional({
    description: 'Event visibility status',
    enum: EventVisibility,
    default: EventVisibility.PUBLIC,
  })
  @IsOptional()
  @IsEnum(EventVisibility)
  visibility?: EventVisibility;

  @ApiPropertyOptional({
    description: 'Ticket type structure',
    enum: TicketType,
    default: TicketType.FREE,
  })
  @IsOptional()
  @IsEnum(TicketType)
  ticketType?: TicketType;

  @ApiPropertyOptional({
    description: 'Official event website URL',
    example: 'https://techsummit.innovent.app',
  })
  @IsOptional()
  @IsUrl({}, { message: 'websiteUrl must be a valid URL' })
  websiteUrl?: string;

  @ApiPropertyOptional({
    description: 'Whether the event supports virtual/hybrid attendance',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isHybrid?: boolean;
}
