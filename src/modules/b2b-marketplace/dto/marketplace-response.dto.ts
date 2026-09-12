import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PricingModel } from '@prisma/client';

export class PublicVendorSummaryDto {
  @ApiProperty({ example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' })
  id!: string;

  @ApiProperty({ example: 'Global Audio Visuals Ltd' })
  companyName!: string;

  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  logoUrl?: string | null;

  @ApiProperty({ example: 'Production & AV' })
  serviceCategory!: string;

  @ApiPropertyOptional({ example: 'Riyadh' })
  city?: string | null;

  @ApiPropertyOptional({ example: 'SA' })
  country?: string | null;

  @ApiPropertyOptional({ example: 'https://audiovisual.example.com' })
  website?: string | null;

  @ApiPropertyOptional({ example: 'Enterprise event production and staging.' })
  description?: string | null;
}

export class MarketplaceServiceItemDto {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  id!: string;

  @ApiProperty({ example: 'Premium Stage Audio & Visual Production' })
  name!: string;

  @ApiProperty({ example: 'Full 4K LED wall setup, sound engineering, and technicians.' })
  description!: string;

  @ApiProperty({ example: 'Production & AV' })
  category!: string;

  @ApiProperty({ enum: PricingModel, example: PricingModel.FIXED })
  pricingModel!: PricingModel;

  @ApiProperty({ example: 15000.0 })
  price!: number;

  @ApiProperty({ example: 'SAR' })
  currency!: string;

  @ApiProperty({ example: '3 days setup' })
  deliveryDuration!: string;

  @ApiProperty({ example: ['Riyadh', 'Jeddah'], type: [String] })
  serviceAreas!: string[];

  @ApiProperty({ example: ['sound', 'lighting'], type: [String] })
  tags!: string[];

  @ApiProperty({ example: 1 })
  minimumOrder!: number;

  @ApiProperty({ type: PublicVendorSummaryDto })
  vendor!: PublicVendorSummaryDto;

  @ApiProperty({ example: '2026-09-12T10:00:00.000Z' })
  createdAt!: string;
}

export class PaginatedMarketplaceServicesDto {
  @ApiProperty({ type: [MarketplaceServiceItemDto] })
  items!: MarketplaceServiceItemDto[];

  @ApiProperty({ example: 100 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 5 })
  totalPages!: number;
}

export class PaginatedVendorsDto {
  @ApiProperty({ type: [PublicVendorSummaryDto] })
  items!: PublicVendorSummaryDto[];

  @ApiProperty({ example: 30 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 2 })
  totalPages!: number;
}
