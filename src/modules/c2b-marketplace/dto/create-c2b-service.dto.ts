import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
  IsArray,
  IsBoolean,
  IsNumber,
  IsUUID,
  IsDateString,
  ArrayMaxSize,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { C2bServiceCategory } from '@prisma/client';

export class CreateC2bServiceDto {
  @ApiProperty({
    description: 'Target Event ID this service is scoped to',
    example: 'd3b07384-d113-4ec6-a1a7-19803126be1e',
  })
  @IsUUID('4', { message: 'eventId must be a valid UUID' })
  @IsNotEmpty({ message: 'eventId is required' })
  eventId!: string;

  @ApiProperty({
    description: 'Service or offer name',
    example: 'Luxury 5-Star Hotel Exclusive Conference Package',
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty({ message: 'Service name is required' })
  @MaxLength(200)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @ApiProperty({
    description: 'C2B Service Category',
    enum: C2bServiceCategory,
    example: C2bServiceCategory.ACCOMMODATION,
  })
  @IsEnum(C2bServiceCategory, {
    message:
      'category must be one of: ACCOMMODATION, TRANSPORTATION, RESTAURANTS, COUPONS, TRAVEL_SERVICES, OTHER',
  })
  @IsNotEmpty({ message: 'category is required' })
  category!: C2bServiceCategory;

  @ApiProperty({
    description: 'Brief summary for service cards',
    example: 'Includes breakfast, shuttle to convention center, and late checkout.',
    maxLength: 300,
  })
  @IsString()
  @IsNotEmpty({ message: 'shortDescription is required' })
  @MaxLength(300)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  shortDescription!: string;

  @ApiProperty({
    description: 'Detailed description, terms, and conditions',
    example:
      'Full terms: valid for delegates with confirmed badge. Cancellation free up to 48h prior.',
  })
  @IsString()
  @IsNotEmpty({ message: 'detailedDescription is required' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  detailedDescription!: string;

  @ApiPropertyOptional({
    description: 'Up to 6 image URLs displaying the service/offer',
    example: ['https://storage.innovent.app/c2b/hotel-1.jpg'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6, { message: 'Maximum 6 images are allowed' })
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional({
    description: 'Local price before/after discount',
    example: 450.0,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  price?: number;

  @ApiPropertyOptional({
    description: 'Discount percentage (1 to 100)',
    example: 25,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  discountPercentage?: number;

  @ApiPropertyOptional({
    description: '3-letter ISO currency code',
    example: 'SAR',
    default: 'SAR',
  })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiProperty({
    description: 'Service expiration date (ISO string). Clamped to event end date.',
    example: '2026-10-31T23:59:59.000Z',
  })
  @IsDateString({}, { message: 'expiresAt must be a valid ISO 8601 date string' })
  @IsNotEmpty({ message: 'expiresAt is required' })
  expiresAt!: string;

  @ApiProperty({
    description: 'Preferred contact method for booking (e.g. IN_APP, EMAIL, PHONE, WHATSAPP)',
    example: 'IN_APP',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty({ message: 'contactMethod is required' })
  @MaxLength(50)
  contactMethod!: string;

  @ApiPropertyOptional({
    description: 'Contact value (email address, phone number, WhatsApp link)',
    example: 'concierge@grandhotel.com',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactValue?: string;

  @ApiPropertyOptional({
    description: 'Promotional discount coupon code',
    example: 'SUMMIT2026',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  promotionalCode?: string;

  @ApiPropertyOptional({
    description: 'Maximum available booking requests (capacity)',
    example: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  maxBookings?: number;

  @ApiPropertyOptional({
    description: 'Availability toggle',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
