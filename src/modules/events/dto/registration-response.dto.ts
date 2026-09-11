import { ApiProperty } from '@nestjs/swagger';
import { RegistrationStatus } from '@prisma/client';

export class RegistrationResponseDto {
  @ApiProperty({ description: 'Registration ID (UUID)' })
  id!: string;

  @ApiProperty({ description: 'Event ID (UUID)' })
  eventId!: string;

  @ApiProperty({ description: 'Registered attendee User ID (UUID)' })
  userId!: string;

  @ApiProperty({ description: 'Registered attendee email' })
  userEmail!: string;

  @ApiProperty({ description: 'Registration status', enum: RegistrationStatus })
  status!: RegistrationStatus;

  @ApiProperty({ description: 'Registration timestamp (ISO 8601 UTC)' })
  registeredAt!: string;

  @ApiProperty({ description: 'Cancellation timestamp if cancelled', nullable: true })
  cancelledAt!: string | null;
}

export class PaginatedRegistrationsResponseDto {
  @ApiProperty({ description: 'List of registrations', type: [RegistrationResponseDto] })
  items!: RegistrationResponseDto[];

  @ApiProperty({ description: 'Current page number', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  pageSize!: number;

  @ApiProperty({ description: 'Total registrations', example: 150 })
  total!: number;

  @ApiProperty({ description: 'Total pages', example: 8 })
  totalPages!: number;
}
