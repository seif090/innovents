import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuotationStatus } from '@prisma/client';

export class QuotationItemResponseDto {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  id!: string;

  @ApiPropertyOptional({ example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' })
  rfqItemId?: string | null;

  @ApiProperty({ example: 'P2.6 Ultra HD LED Screen 10x4m' })
  description!: string;

  @ApiProperty({ example: 1 })
  quantity!: number;

  @ApiProperty({ example: 14500.0 })
  unitPrice!: number;

  @ApiProperty({ example: 14500.0 })
  total!: number;

  @ApiPropertyOptional({ example: 'Includes backup processors' })
  notes?: string | null;
}

export class QuotationListItemDto {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  id!: string;

  @ApiProperty({ example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' })
  rfqId!: string;

  @ApiProperty({ example: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33' })
  vendorId!: string;

  @ApiProperty({ example: 1 })
  version!: number;

  @ApiProperty({ enum: QuotationStatus, example: QuotationStatus.PENDING })
  status!: QuotationStatus;

  @ApiProperty({ example: 14500.0 })
  subtotal!: number;

  @ApiProperty({ example: 2175.0 })
  tax!: number;

  @ApiProperty({ example: 500.0 })
  discount!: number;

  @ApiProperty({ example: 16175.0 })
  total!: number;

  @ApiProperty({ example: 'SAR' })
  currency!: string;

  @ApiProperty({ example: '2026-10-15T23:59:59.000Z' })
  validUntil!: string;

  @ApiPropertyOptional({ example: '2026-09-12T12:00:00.000Z' })
  acceptedAt?: string | null;

  @ApiPropertyOptional({ example: null })
  rejectedAt?: string | null;

  @ApiPropertyOptional({ example: null })
  rejectionReason?: string | null;

  @ApiProperty({ example: '2026-09-12T11:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-09-12T11:00:00.000Z' })
  updatedAt!: string;
}

export class QuotationDetailsResponseDto extends QuotationListItemDto {
  @ApiPropertyOptional({ example: 'Quote includes transport, rigging, and 2 certified operators.' })
  notes?: string | null;

  @ApiProperty({ type: [QuotationItemResponseDto] })
  items!: QuotationItemResponseDto[];
}

export class PaginatedQuotationsDto {
  @ApiProperty({ type: [QuotationListItemDto] })
  items!: QuotationListItemDto[];

  @ApiProperty({ example: 5 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;
}
