import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SponsorAdPlacement, SponsorAdStatus } from '@prisma/client';

export class SponsorAdResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  id!: string;

  @ApiProperty({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  sponsorId!: string;

  @ApiPropertyOptional({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  eventId?: string | null;

  @ApiProperty({ example: 'Leading Cloud AI Infrastructure' })
  title!: string;

  @ApiProperty({ example: 'Scale your event operations...' })
  description!: string;

  @ApiProperty({ example: 'https://storage.innovent.app/ads/cloud-banner.jpg' })
  imageUrl!: string;

  @ApiProperty({ example: 'https://sponsor.example.com/innovent-special' })
  destinationUrl!: string;

  @ApiProperty({ enum: SponsorAdPlacement, example: SponsorAdPlacement.MARKETPLACE })
  placement!: SponsorAdPlacement;

  @ApiProperty({ enum: SponsorAdStatus, example: SponsorAdStatus.APPROVED })
  status!: SponsorAdStatus;

  @ApiPropertyOptional({ example: 'Image resolution too low' })
  rejectionReason?: string | null;

  @ApiPropertyOptional({ example: 'd3b07384-d113-4ec6-a1a7-19803126be1e' })
  reviewedByUserId?: string | null;

  @ApiPropertyOptional({ example: '2026-09-12T13:00:00.000Z' })
  reviewedAt?: Date | null;

  @ApiProperty({ example: '2026-09-01T00:00:00.000Z' })
  startsAt!: Date;

  @ApiProperty({ example: '2026-10-31T23:59:59.000Z' })
  endsAt!: Date;

  @ApiPropertyOptional({
    example: {
      companyName: 'Google Cloud EMEA',
      logoUrl: 'https://storage.innovent.app/logos/google.png',
    },
  })
  sponsor?: {
    companyName: string;
    logoUrl?: string | null;
  };

  @ApiProperty({ example: '2026-09-12T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-09-12T12:00:00.000Z' })
  updatedAt!: Date;
}

export class PaginatedSponsorAdsDto {
  @ApiProperty({ type: [SponsorAdResponseDto] })
  items!: SponsorAdResponseDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 15 })
  total!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;
}
