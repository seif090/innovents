import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class RejectAccountDto {
  @ApiProperty({
    example: 'Commercial registration certificate is illegible or expired.',
    description: 'Mandatory reason for rejecting the business account application',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'Rejection reason must be at least 5 characters long' })
  @MaxLength(1000, { message: 'Rejection reason cannot exceed 1000 characters' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  reason!: string;
}
