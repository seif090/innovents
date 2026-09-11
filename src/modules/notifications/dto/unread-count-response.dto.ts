import { ApiProperty } from '@nestjs/swagger';

export class UnreadCountResponseDto {
  @ApiProperty({ description: 'Total count of unread notifications for the user' })
  unreadCount!: number;
}
