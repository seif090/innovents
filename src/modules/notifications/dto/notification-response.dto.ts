import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType, NotificationChannel, NotificationStatus } from '@prisma/client';

export class NotificationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ enum: NotificationType })
  type!: NotificationType;

  @ApiProperty({ enum: NotificationChannel })
  channel!: NotificationChannel;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  body!: string;

  @ApiPropertyOptional({ type: Object, nullable: true })
  data?: Record<string, unknown> | null;

  @ApiProperty({ enum: NotificationStatus })
  status!: NotificationStatus;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  readAt?: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  deliveredAt?: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
