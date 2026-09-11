import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Length } from 'class-validator';
import { DevicePlatform } from '@prisma/client';
import { NOTIFICATION_LIMITS } from '../constants/notifications.constants';

export class RegisterDeviceDto {
  @ApiProperty({ enum: DevicePlatform })
  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;

  @ApiProperty({
    description:
      'Device registration token from FCM or APNs (never exposed or logged in plain text)',
    minLength: NOTIFICATION_LIMITS.DEVICE_TOKEN_MIN_LENGTH,
    maxLength: NOTIFICATION_LIMITS.DEVICE_TOKEN_MAX_LENGTH,
  })
  @IsString()
  @Length(NOTIFICATION_LIMITS.DEVICE_TOKEN_MIN_LENGTH, NOTIFICATION_LIMITS.DEVICE_TOKEN_MAX_LENGTH)
  token!: string;
}
