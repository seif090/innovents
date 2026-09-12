import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PricingModel } from '@prisma/client';

export class VendorServiceResponseDto {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  id!: string;

  @ApiProperty({ example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' })
  vendorId!: string;

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

  @ApiProperty({ example: '3 days setup prior to event opening' })
  deliveryDuration!: string;

  @ApiProperty({ example: ['Riyadh', 'Jeddah'], type: [String] })
  serviceAreas!: string[];

  @ApiProperty({ example: ['sound', 'lighting'], type: [String] })
  tags!: string[];

  @ApiProperty({ example: 1 })
  minimumOrder!: number;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2026-09-12T10:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-09-12T12:00:00.000Z' })
  updatedAt!: string;

  @ApiPropertyOptional({ example: null })
  deletedAt?: string | null;
}

export class PaginatedVendorServicesDto {
  @ApiProperty({ type: [VendorServiceResponseDto] })
  items!: VendorServiceResponseDto[];

  @ApiProperty({ example: 25 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 2 })
  totalPages!: number;
}
