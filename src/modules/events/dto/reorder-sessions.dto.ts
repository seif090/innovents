import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsNotEmpty, IsUUID } from 'class-validator';

export class ReorderSessionsDto {
  @ApiProperty({
    description: 'Ordered array of Session UUIDs belonging to the event',
    example: ['f81d4fae-7dec-11d0-a765-00a0c91e6bf6', 'a24e931b-1234-4a21-9988-112233445566'],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'sessionIds must contain at least one session ID' })
  @IsUUID('4', { each: true, message: 'Each session ID must be a valid UUID' })
  @IsNotEmpty()
  sessionIds!: string[];
}
