import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { SponsorAdPlacement } from '@prisma/client';

export class CreateSponsorAdDto {
  @ApiPropertyOptional({
    description: 'Optional Event ID this ad is targeted to',
    example: 'd3b07384-d113-4ec6-a1a7-19803126be1e',
  })
  @IsOptional()
  @IsUUID('4', { message: 'eventId must be a valid UUID' })
  eventId?: string;

  @ApiProperty({
    description: 'Ad campaign title',
    example: 'Leading Cloud AI Infrastructure - Special Event Offer',
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty({ message: 'title is required' })
  @MaxLength(200)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  title!: string;

  @ApiProperty({
    description: 'Ad promotional copy and marketing message',
    example: 'Scale your event operations with next-generation generative AI infrastructure.',
  })
  @IsString()
  @IsNotEmpty({ message: 'description is required' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  description!: string;

  @ApiProperty({
    description: 'Ad banner image URL',
    example: 'https://storage.innovent.app/ads/cloud-banner.jpg',
  })
  @IsString()
  @IsNotEmpty({ message: 'imageUrl is required' })
  @MaxLength(500)
  imageUrl!: string;

  @ApiProperty({
    description: 'Landing page destination URL when clicked',
    example: 'https://sponsor.example.com/innovent-special',
  })
  @IsString()
  @IsNotEmpty({ message: 'destinationUrl is required' })
  @MaxLength(500)
  destinationUrl!: string;

  @ApiPropertyOptional({
    description: 'Ad placement position',
    enum: SponsorAdPlacement,
    example: SponsorAdPlacement.MARKETPLACE,
    default: SponsorAdPlacement.MARKETPLACE,
  })
  @IsOptional()
  @IsEnum(SponsorAdPlacement)
  placement?: SponsorAdPlacement;

  @ApiProperty({
    description: 'Campaign start date (ISO string)',
    example: '2026-09-01T00:00:00.000Z',
  })
  @IsDateString({}, { message: 'startsAt must be a valid ISO 8601 date string' })
  @IsNotEmpty({ message: 'startsAt is required' })
  startsAt!: string;

  @ApiProperty({
    description: 'Campaign end date (ISO string)',
    example: '2026-10-31T23:59:59.000Z',
  })
  @IsDateString({}, { message: 'endsAt must be a valid ISO 8601 date string' })
  @IsNotEmpty({ message: 'endsAt is required' })
  endsAt!: string;
}
