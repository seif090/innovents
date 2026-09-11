import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateSpeakerDto {
  @ApiProperty({
    description: 'Speaker full name',
    example: 'Dr. Sarah Al-Otaibi',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  fullName!: string;

  @ApiProperty({
    description: 'Professional job title',
    example: 'Chief AI Architect',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty({ message: 'Job title is required' })
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  jobTitle!: string;

  @ApiProperty({
    description: 'Company or institution name',
    example: 'Saudi National AI Center',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty({ message: 'Company is required' })
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  company!: string;

  @ApiPropertyOptional({
    description: 'Speaker biography (max 2000 characters)',
    example: 'Dr. Sarah has 15+ years of research in deep learning and autonomous systems.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  bio?: string;

  @ApiPropertyOptional({
    description: 'Speaker portrait photo URL',
    example: 'https://cdn.innovent.app/speakers/sarah.jpg',
  })
  @IsOptional()
  @IsUrl({}, { message: 'photoUrl must be a valid URL' })
  photoUrl?: string;

  @ApiPropertyOptional({
    description: 'LinkedIn profile URL',
    example: 'https://linkedin.com/in/sarah-alotaibi',
  })
  @IsOptional()
  @IsUrl({}, { message: 'linkedinUrl must be a valid URL' })
  linkedinUrl?: string;
}

export class UpdateSpeakerDto extends PartialType(CreateSpeakerDto) {}

export class SpeakerResponseDto {
  @ApiProperty({ description: 'Speaker ID (UUID)' })
  id!: string;

  @ApiProperty({ description: 'Event ID (UUID)' })
  eventId!: string;

  @ApiProperty({ description: 'Speaker full name' })
  fullName!: string;

  @ApiProperty({ description: 'Job title' })
  jobTitle!: string;

  @ApiProperty({ description: 'Company name' })
  company!: string;

  @ApiPropertyOptional({ description: 'Bio' })
  bio?: string | null;

  @ApiPropertyOptional({ description: 'Photo URL' })
  photoUrl?: string | null;

  @ApiPropertyOptional({ description: 'LinkedIn URL' })
  linkedinUrl?: string | null;

  @ApiProperty({ description: 'Created at (ISO 8601 UTC)' })
  createdAt!: string;

  @ApiProperty({ description: 'Updated at (ISO 8601 UTC)' })
  updatedAt!: string;
}
