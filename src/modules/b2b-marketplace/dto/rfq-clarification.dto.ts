import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateRfqClarificationDto {
  @ApiProperty({
    description: 'Clarification query, question, or response message',
    example: 'Could you confirm the ceiling height in Hall B for truss rigging?',
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty({ message: 'Clarification message cannot be empty' })
  @MaxLength(2000)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  message!: string;
}

export class RfqClarificationResponseDto {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  id!: string;

  @ApiProperty({ example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' })
  rfqId!: string;

  @ApiProperty({ example: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33' })
  senderId!: string;

  @ApiProperty({ example: 'Could you confirm the ceiling height in Hall B for truss rigging?' })
  message!: string;

  @ApiProperty({ example: '2026-09-12T11:00:00.000Z' })
  createdAt!: string;
}
