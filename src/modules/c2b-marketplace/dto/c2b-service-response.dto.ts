import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { C2bServiceCategory } from '@prisma/client';

export class PublicProviderSummaryDto {
  @ApiProperty({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  id!: string;

  @ApiProperty({ example: 'Ritz-Carlton Riyadh Hospitality' })
  businessName!: string;

  @ApiPropertyOptional({ example: 'https://storage.innovent.app/logos/ritz.png' })
  logoUrl?: string | null;

  @ApiPropertyOptional({ example: 'Hospitality & Luxury Accommodation' })
  providerType?: string | null;

  @ApiPropertyOptional({ example: 'Riyadh' })
  city?: string | null;

  @ApiPropertyOptional({ example: 'Saudi Arabia' })
  country?: string | null;
}

export class C2bServiceResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  id!: string;

  @ApiProperty({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  providerId!: string;

  @ApiProperty({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  eventId!: string;

  @ApiProperty({ example: 'Luxury 5-Star Hotel Exclusive Conference Package' })
  name!: string;

  @ApiProperty({ enum: C2bServiceCategory, example: C2bServiceCategory.ACCOMMODATION })
  category!: C2bServiceCategory;

  @ApiProperty({ example: 'Includes breakfast and shuttle.' })
  shortDescription!: string;

  @ApiProperty({ example: 'Full terms: valid for delegates...' })
  detailedDescription!: string;

  @ApiProperty({ example: ['https://storage.innovent.app/c2b/hotel-1.jpg'], type: [String] })
  images!: string[];

  @ApiPropertyOptional({ example: 450.0 })
  price?: number | null;

  @ApiPropertyOptional({ example: 25 })
  discountPercentage?: number | null;

  @ApiProperty({ example: 'SAR' })
  currency!: string;

  @ApiProperty({ example: '2026-10-31T23:59:59.000Z' })
  expiresAt!: Date;

  @ApiProperty({ example: 'IN_APP' })
  contactMethod!: string;

  @ApiPropertyOptional({ example: 'concierge@grandhotel.com' })
  contactValue?: string | null;

  @ApiPropertyOptional({ example: 'SUMMIT2026' })
  promotionalCode?: string | null;

  @ApiPropertyOptional({ example: 50 })
  maxBookings?: number | null;

  @ApiProperty({ example: 4 })
  bookingCount!: number;

  @ApiProperty({ example: true })
  isAvailable!: boolean;

  @ApiPropertyOptional({ type: PublicProviderSummaryDto })
  provider?: PublicProviderSummaryDto;

  @ApiProperty({ example: '2026-09-12T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-09-12T12:00:00.000Z' })
  updatedAt!: Date;
}

export class PaginatedC2bServicesDto {
  @ApiProperty({ type: [C2bServiceResponseDto] })
  items!: C2bServiceResponseDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}
