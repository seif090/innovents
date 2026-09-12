import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateC2bBookingDto {
  @ApiProperty({
    description: 'Service ID the attendee wants to contact or book',
    example: 'd3b07384-d113-4ec6-a1a7-19803126be1e',
  })
  @IsUUID('4', { message: 'serviceId must be a valid UUID' })
  @IsNotEmpty({ message: 'serviceId is required' })
  serviceId!: string;

  @ApiPropertyOptional({
    description: 'Optional attendee message, requests, or booking instructions',
    example: 'Need airport pickup on arrival at 2 PM, 2 passengers.',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  notes?: string;

  @ApiPropertyOptional({
    description: 'Preferred contact method (e.g. IN_APP, EMAIL, PHONE, WHATSAPP)',
    example: 'WHATSAPP',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactMethod?: string;

  @ApiPropertyOptional({
    description: 'Attendee contact detail (phone number, WhatsApp number, or email)',
    example: '+966501234567',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactValue?: string;

  @ApiPropertyOptional({
    description: 'Requested date and time for service fulfillment',
    example: '2026-10-25T14:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  requestedDate?: string;
}
