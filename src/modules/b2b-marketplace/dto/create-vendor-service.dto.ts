import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  IsArray,
  IsBoolean,
  IsNumber,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PricingModel } from '@prisma/client';

export class CreateVendorServiceDto {
  @ApiProperty({
    description: 'Service title or package name',
    example: 'Premium Stage Audio & Visual Production',
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty({ message: 'Service name is required' })
  @MaxLength(200)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @ApiProperty({
    description: 'Detailed service description, inclusions, and specifications',
    example:
      'Full 4K LED wall setup, sound engineering, wireless microphones, and on-site technicians.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Service description is required' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  description!: string;

  @ApiProperty({
    description: 'Service category (e.g. Production & AV, Catering, Staging, Logistics)',
    example: 'Production & AV',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty({ message: 'Service category is required' })
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  category!: string;

  @ApiPropertyOptional({
    description: 'Pricing model',
    enum: PricingModel,
    example: PricingModel.FIXED,
    default: PricingModel.FIXED,
  })
  @IsOptional()
  @IsEnum(PricingModel, {
    message: 'pricingModel must be one of: FIXED, HOURLY, DAILY, PER_UNIT, CUSTOM',
  })
  pricingModel?: PricingModel;

  @ApiProperty({
    description: 'Base price (non-negative)',
    example: 15000.0,
    minimum: 0,
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Price must be a valid monetary number with up to 2 decimals' },
  )
  @Min(0, { message: 'Price cannot be negative' })
  price!: number;

  @ApiPropertyOptional({
    description: 'Three-letter currency code',
    example: 'SAR',
    default: 'SAR',
    maxLength: 3,
  })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : 'SAR',
  )
  currency?: string;

  @ApiProperty({
    description: 'Delivery duration or turnaround timeline',
    example: '3 days setup prior to event opening',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty({ message: 'Delivery duration is required' })
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  deliveryDuration!: string;

  @ApiPropertyOptional({
    description: 'Service coverage areas or regions',
    example: ['Riyadh', 'Jeddah', 'Eastern Province'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceAreas?: string[];

  @ApiPropertyOptional({
    description: 'Search and classification tags (max 20 tags)',
    example: ['sound', 'lighting', 'led-wall', 'conference'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Minimum order units',
    example: 1,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Minimum order must be at least 1' })
  minimumOrder?: number;

  @ApiPropertyOptional({
    description: 'Whether the service is active and discoverable',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
