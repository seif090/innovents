import { ApiProperty } from '@nestjs/swagger';
import { DevicePlatform } from '@prisma/client';

export class UserDeviceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: DevicePlatform })
  platform!: DevicePlatform;

  @ApiProperty({ description: 'Masked token for identification without revealing raw credentials' })
  maskedToken!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  lastSeenAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
