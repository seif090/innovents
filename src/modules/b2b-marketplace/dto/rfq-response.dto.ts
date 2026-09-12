import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RfqStatus } from '@prisma/client';
import { RfqClarificationResponseDto } from './rfq-clarification.dto';

export class RfqItemResponseDto {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  id!: string;

  @ApiPropertyOptional({ example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' })
  vendorServiceId?: string | null;

  @ApiProperty({ example: 'Main Stage P2.6 Ultra HD LED Screen 10x4m' })
  description!: string;

  @ApiProperty({ example: 1 })
  quantity!: number;

  @ApiPropertyOptional({ example: 'set' })
  unit?: string | null;

  @ApiPropertyOptional({ example: 12000.0 })
  targetPrice?: number | null;

  @ApiPropertyOptional({ example: 'Must support HDMI 2.1' })
  notes?: string | null;

  @ApiProperty({ example: '2026-09-12T10:00:00.000Z' })
  createdAt!: string;
}

export class RfqListItemDto {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  id!: string;

  @ApiProperty({ example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' })
  sponsorId!: string;

  @ApiProperty({ example: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33' })
  vendorId!: string;

  @ApiPropertyOptional({ example: 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44' })
  eventId?: string | null;

  @ApiProperty({ example: 'Audio Visual & Staging Setup for Tech Summit 2026' })
  title!: string;

  @ApiProperty({ enum: RfqStatus, example: RfqStatus.SENT })
  status!: RfqStatus;

  @ApiProperty({ example: '2026-10-01T23:59:59.000Z' })
  expiresAt!: string;

  @ApiPropertyOptional({ example: '2026-09-12T10:30:00.000Z' })
  sentAt?: string | null;

  @ApiPropertyOptional({ example: '2026-09-12T10:35:00.000Z' })
  viewedAt?: string | null;

  @ApiPropertyOptional({ example: '2026-09-12T11:00:00.000Z' })
  acceptedAt?: string | null;

  @ApiPropertyOptional({ example: null })
  rejectedAt?: string | null;

  @ApiPropertyOptional({ example: null })
  cancelledAt?: string | null;

  @ApiProperty({ example: 3 })
  itemCount!: number;

  @ApiProperty({ example: '2026-09-12T10:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-09-12T10:00:00.000Z' })
  updatedAt!: string;
}

export class RfqDetailsResponseDto extends RfqListItemDto {
  @ApiProperty({
    example: 'We require complete AV equipment and 3 days on-site technician support.',
  })
  description!: string;

  @ApiPropertyOptional({ example: 'Load-in must start October 10 at 06:00 AM.' })
  requirements?: string | null;

  @ApiPropertyOptional({ example: 'Event was rescheduled.' })
  cancellationReason?: string | null;

  @ApiPropertyOptional({ example: 'Out of stock.' })
  rejectionReason?: string | null;

  @ApiProperty({ type: [RfqItemResponseDto] })
  items!: RfqItemResponseDto[];

  @ApiProperty({ type: [RfqClarificationResponseDto] })
  clarifications!: RfqClarificationResponseDto[];
}

export class PaginatedRfqsDto {
  @ApiProperty({ type: [RfqListItemDto] })
  items!: RfqListItemDto[];

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;
}
