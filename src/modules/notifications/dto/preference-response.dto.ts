import { ApiProperty } from '@nestjs/swagger';
import { NotificationType, NotificationChannel } from '@prisma/client';

export class PreferenceResponseItemDto {
  @ApiProperty({ enum: NotificationType })
  type!: NotificationType;

  @ApiProperty({ enum: NotificationChannel })
  channel!: NotificationChannel;

  @ApiProperty()
  isEnabled!: boolean;

  @ApiProperty({ description: 'Indicates whether this preference can be modified by the user' })
  isConfigurable!: boolean;
}

export class PreferencesResponseDto {
  @ApiProperty({ type: [PreferenceResponseItemDto] })
  preferences!: PreferenceResponseItemDto[];
}
