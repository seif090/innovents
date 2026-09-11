import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateVenueDto {
  @ApiProperty({
    description: 'Venue/Hall name',
    example: 'Main Auditorium A',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty({ message: 'Venue name is required' })
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @ApiPropertyOptional({
    description: 'Description or notes regarding the venue/hall',
    example: 'Equipped with 4K projection, 4 wireless mics, and translation booths.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Maximum seating / room capacity (positive integer)',
    example: 350,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Capacity must be at least 1' })
  capacity?: number;

  @ApiPropertyOptional({
    description: 'Floor or level indicator',
    example: '2nd Floor',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  floor?: string;

  @ApiPropertyOptional({
    description: 'Physical location or wing inside facility',
    example: 'North Wing, Hall 3',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;
}

export class UpdateVenueDto extends PartialType(CreateVenueDto) {}

export class VenueResponseDto {
  @ApiProperty({ description: 'Venue ID (UUID)' })
  id!: string;

  @ApiProperty({ description: 'Associated Event ID (UUID)' })
  eventId!: string;

  @ApiProperty({ description: 'Venue/Hall name' })
  name!: string;

  @ApiPropertyOptional({ description: 'Description' })
  description?: string | null;

  @ApiPropertyOptional({ description: 'Capacity' })
  capacity?: number | null;

  @ApiPropertyOptional({ description: 'Floor' })
  floor?: string | null;

  @ApiPropertyOptional({ description: 'Location details' })
  location?: string | null;

  @ApiProperty({ description: 'Created at (ISO 8601 UTC)' })
  createdAt!: string;

  @ApiProperty({ description: 'Updated at (ISO 8601 UTC)' })
  updatedAt!: string;
}
