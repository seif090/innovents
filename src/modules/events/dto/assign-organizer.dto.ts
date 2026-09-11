import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class AssignOrganizerDto {
  @ApiProperty({
    description: 'User ID of the organizer to assign (must have ORGANIZER role and ACTIVE status)',
    example: 'd9b7f58a-3c8e-42f9-a912-b7a3e74b5c6d',
  })
  @IsUUID('4', { message: 'userId must be a valid UUID' })
  @IsNotEmpty({ message: 'userId is required' })
  userId!: string;
}

export class OrganizerResponseDto {
  @ApiProperty({ description: 'Assignment ID' })
  id!: string;

  @ApiProperty({ description: 'Event ID' })
  eventId!: string;

  @ApiProperty({ description: 'User ID of assigned organizer' })
  userId!: string;

  @ApiProperty({ description: 'Organizer user email' })
  email!: string;

  @ApiProperty({ description: 'Assignment timestamp (ISO 8601 UTC)' })
  assignedAt!: string;
}
