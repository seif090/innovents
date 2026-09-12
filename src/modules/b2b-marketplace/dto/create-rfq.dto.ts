import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsDateString,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsInt,
  Min,
  IsNumber,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateRfqItemDto {
  @ApiPropertyOptional({
    description: 'Optional referenced vendor service UUID (must belong to target vendor)',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @IsOptional()
  @IsUUID('4', { message: 'vendorServiceId must be a valid UUID' })
  vendorServiceId?: string;

  @ApiProperty({
    description: 'Item or requirement specification',
    example: 'Main Stage P2.6 Ultra HD LED Screen 10x4m',
  })
  @IsString()
  @IsNotEmpty({ message: 'Item description is required' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  description!: string;

  @ApiProperty({
    description: 'Requested quantity',
    example: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Unit of measure (e.g. units, meters, days, hours)',
    example: 'set',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string;

  @ApiPropertyOptional({
    description: 'Target or expected unit price (optional sponsor budget indicator)',
    example: 12000.0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  targetPrice?: number;

  @ApiPropertyOptional({
    description: 'Specific notes or technical requirements for this line item',
    example: 'Must support HDMI 2.1 and SDI inputs',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateRfqDto {
  @ApiProperty({
    description: 'Target Vendor UUID who will receive this RFQ',
    example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  })
  @IsUUID('4', { message: 'vendorId must be a valid UUID' })
  vendorId!: string;

  @ApiPropertyOptional({
    description: 'Optional Event UUID to associate this RFQ with an event',
    example: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
  })
  @IsOptional()
  @IsUUID('4', { message: 'eventId must be a valid UUID' })
  eventId?: string;

  @ApiProperty({
    description: 'RFQ title or project headline',
    example: 'Audio Visual & Staging Setup for Tech Summit 2026',
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(200)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  title!: string;

  @ApiProperty({
    description: 'General project overview and scope of work',
    example:
      'We require complete AV equipment and 3 days on-site technician support for our upcoming conference.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Description is required' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  description!: string;

  @ApiPropertyOptional({
    description: 'Detailed technical or logistical specifications',
    example: 'Load-in must start October 10 at 06:00 AM.',
  })
  @IsOptional()
  @IsString()
  requirements?: string;

  @ApiProperty({
    description: 'RFQ expiration timestamp (must be in the future)',
    example: '2026-10-01T23:59:59.000Z',
  })
  @IsDateString({}, { message: 'expiresAt must be a valid ISO-8601 date string' })
  expiresAt!: string;

  @ApiProperty({
    description: 'Requested items or line services (at least 1 required)',
    type: [CreateRfqItemDto],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one RFQ item is required' })
  @ValidateNested({ each: true })
  @Type(() => CreateRfqItemDto)
  items!: CreateRfqItemDto[];
}
