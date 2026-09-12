import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsInt,
  Min,
  IsNumber,
  MaxLength,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateQuotationItemDto {
  @ApiPropertyOptional({
    description: 'Optional referenced RFQ Item UUID',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @IsOptional()
  @IsUUID('4')
  rfqItemId?: string;

  @ApiProperty({
    description: 'Line item description or quote line specification',
    example: 'P2.6 Ultra HD LED Screen 10x4m (including ground support truss & processors)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Line item description is required' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  description!: string;

  @ApiProperty({
    description: 'Quantity',
    example: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity!: number;

  @ApiProperty({
    description: 'Unit price (non-negative)',
    example: 14500.0,
    minimum: 0,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Unit price cannot be negative' })
  unitPrice!: number;

  @ApiPropertyOptional({
    description: 'Line item notes or warranty information',
    example: 'Includes backup processors and cabling',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateQuotationDto {
  @ApiProperty({
    description: 'Target RFQ UUID to provide quote for',
    example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  })
  @IsUUID('4', { message: 'rfqId must be a valid UUID' })
  rfqId!: string;

  @ApiProperty({
    description: 'Quotation expiration timestamp (must be in the future)',
    example: '2026-10-15T23:59:59.000Z',
  })
  @IsDateString({}, { message: 'validUntil must be a valid ISO-8601 date string' })
  validUntil!: string;

  @ApiPropertyOptional({
    description: 'Three-letter currency code',
    example: 'SAR',
    default: 'SAR',
    maxLength: 3,
  })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : 'SAR',
  )
  currency?: string;

  @ApiPropertyOptional({
    description: 'Tax amount (non-negative, default 0)',
    example: 2175.0,
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Tax cannot be negative' })
  tax?: number;

  @ApiPropertyOptional({
    description: 'Discount amount (non-negative, default 0)',
    example: 500.0,
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Discount cannot be negative' })
  discount?: number;

  @ApiPropertyOptional({
    description: 'Commercial terms, notes, or payment conditions',
    example: 'Quote includes transport, rigging, and 2 certified operators for 3 conference days.',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    description: 'Quotation line items (at least 1 required)',
    type: [CreateQuotationItemDto],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one quotation item is required' })
  @ValidateNested({ each: true })
  @Type(() => CreateQuotationItemDto)
  items!: CreateQuotationItemDto[];
}
