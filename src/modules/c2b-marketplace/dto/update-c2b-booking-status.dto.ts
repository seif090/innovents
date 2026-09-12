import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { C2bBookingStatus } from '@prisma/client';

export class UpdateC2bBookingStatusDto {
  @ApiProperty({
    description: 'Target booking status update',
    enum: C2bBookingStatus,
    example: C2bBookingStatus.CONFIRMED,
  })
  @IsEnum(C2bBookingStatus, {
    message: 'status must be one of: CONFIRMED, REJECTED, CANCELLED, COMPLETED',
  })
  @IsNotEmpty({ message: 'status is required' })
  status!: C2bBookingStatus;

  @ApiPropertyOptional({
    description: 'Optional provider response notes or instructions to the attendee',
    example: 'Booking confirmed. Your driver contact details have been sent via WhatsApp.',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  providerNotes?: string;
}
