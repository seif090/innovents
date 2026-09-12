import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class ValidateCouponDto {
  @ApiProperty({
    description: 'Coupon code to validate',
    example: 'SUMMIT20',
  })
  @IsString()
  @IsNotEmpty({ message: 'code is required' })
  @MaxLength(50)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  code!: string;

  @ApiProperty({
    description: 'Event ID context to validate against',
    example: 'd3b07384-d113-4ec6-a1a7-19803126be1e',
  })
  @IsUUID('4', { message: 'eventId must be a valid UUID' })
  @IsNotEmpty({ message: 'eventId is required' })
  eventId!: string;

  @ApiPropertyOptional({
    description: 'Optional C2B service ID context',
    example: 'd3b07384-d113-4ec6-a1a7-19803126be1e',
  })
  @IsOptional()
  @IsUUID('4')
  serviceId?: string;
}
