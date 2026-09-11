import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { SessionResponseDto } from './session-response.dto';

export class ScheduleItemResponseDto {
  @ApiProperty({ description: 'Schedule Entry ID (UUID)' })
  id!: string;

  @ApiProperty({ description: 'User ID (UUID)' })
  userId!: string;

  @ApiProperty({ description: 'Session ID (UUID)' })
  sessionId!: string;

  @ApiProperty({ description: 'Session details', type: SessionResponseDto })
  session!: SessionResponseDto;

  @ApiPropertyOptional({ description: 'Personal note on this session if created' })
  note?: string | null;

  @ApiProperty({ description: 'Added to schedule at (ISO 8601 UTC)' })
  createdAt!: string;
}

export class SaveSessionNoteDto {
  @ApiProperty({
    description: 'Personal note content for this session',
    example: 'Ask speaker about their deployment architecture with Kubernetes.',
    maxLength: 5000,
  })
  @IsString()
  @IsNotEmpty({ message: 'Note content cannot be empty' })
  @MaxLength(5000)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  note!: string;
}

export class SessionNoteResponseDto {
  @ApiProperty({ description: 'Note ID (UUID)' })
  id!: string;

  @ApiProperty({ description: 'User ID (UUID)' })
  userId!: string;

  @ApiProperty({ description: 'Session ID (UUID)' })
  sessionId!: string;

  @ApiProperty({ description: 'Note text' })
  note!: string;

  @ApiProperty({ description: 'Created at (ISO 8601 UTC)' })
  createdAt!: string;

  @ApiProperty({ description: 'Updated at (ISO 8601 UTC)' })
  updatedAt!: string;
}
