import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ValidateNested, IsEnum, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationType, NotificationChannel } from '@prisma/client';

export class PreferenceItemDto {
  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type!: NotificationType;

  @ApiProperty({ enum: NotificationChannel })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @ApiProperty()
  @IsBoolean()
  isEnabled!: boolean;
}

export class UpdatePreferencesDto {
  @ApiProperty({ type: [PreferenceItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreferenceItemDto)
  preferences!: PreferenceItemDto[];
}
