import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsInt, Min, Max, IsDateString, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { NotificationType, NotificationChannel, NotificationStatus } from '@prisma/client';
import { NOTIFICATION_LIMITS } from '../constants/notifications.constants';

export class NotificationQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    default: NOTIFICATION_LIMITS.DEFAULT_PAGE_SIZE,
    maximum: NOTIFICATION_LIMITS.MAX_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(NOTIFICATION_LIMITS.MAX_PAGE_SIZE)
  pageSize: number = NOTIFICATION_LIMITS.DEFAULT_PAGE_SIZE;

  @ApiPropertyOptional({ enum: NotificationType })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @ApiPropertyOptional({ enum: NotificationChannel })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @ApiPropertyOptional({ enum: NotificationStatus })
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @ApiPropertyOptional({ description: 'Filter by read status (true for read, false for unread)' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  isRead?: boolean;

  @ApiPropertyOptional({ description: 'Filter notifications created on or after this ISO date' })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({ description: 'Filter notifications created on or before this ISO date' })
  @IsOptional()
  @IsDateString()
  createdTo?: string;
}
