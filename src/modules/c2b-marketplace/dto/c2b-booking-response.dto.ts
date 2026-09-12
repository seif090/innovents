import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { C2bBookingStatus } from '@prisma/client';

export class C2bBookingResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  id!: string;

  @ApiProperty({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  serviceId!: string;

  @ApiProperty({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  attendeeId!: string;

  @ApiProperty({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  providerId!: string;

  @ApiProperty({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  eventId!: string;

  @ApiProperty({ enum: C2bBookingStatus, example: C2bBookingStatus.PENDING })
  status!: C2bBookingStatus;

  @ApiPropertyOptional({ example: 'Need airport pickup on arrival at 2 PM.' })
  notes?: string | null;

  @ApiPropertyOptional({ example: 'Driver assigned: Ali (+966500000000)' })
  providerNotes?: string | null;

  @ApiPropertyOptional({ example: 'WHATSAPP' })
  contactMethod?: string | null;

  @ApiPropertyOptional({ example: '+966501234567' })
  contactValue?: string | null;

  @ApiPropertyOptional({ example: '2026-10-25T14:00:00.000Z' })
  requestedDate?: Date | null;

  @ApiPropertyOptional({ example: '2026-09-12T14:30:00.000Z' })
  confirmedAt?: Date | null;

  @ApiPropertyOptional({ example: '2026-09-12T14:30:00.000Z' })
  cancelledAt?: Date | null;

  @ApiPropertyOptional({ example: '2026-09-12T14:30:00.000Z' })
  completedAt?: Date | null;

  @ApiProperty({ example: '2026-09-12T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-09-12T12:00:00.000Z' })
  updatedAt!: Date;

  @ApiPropertyOptional({
    example: { name: 'Airport VIP Shuttle Service', category: 'TRANSPORTATION' },
  })
  service?: {
    name: string;
    category: string;
    price?: number | null;
    currency?: string;
  };

  @ApiPropertyOptional({
    example: { businessName: 'Ritz-Carlton Hospitality' },
  })
  provider?: {
    businessName: string;
    contactEmail?: string | null;
    contactPhone?: string | null;
  };

  @ApiPropertyOptional({
    example: { email: 'attendee@innovent.app' },
  })
  attendee?: {
    email: string;
    phone?: string | null;
  };
}

export class PaginatedC2bBookingsDto {
  @ApiProperty({ type: [C2bBookingResponseDto] })
  items!: C2bBookingResponseDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 10 })
  total!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;
}
