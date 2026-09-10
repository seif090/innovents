import { ApiProperty } from '@nestjs/swagger';
import { AccountStatus } from '@prisma/client';

export class UserProfileResponseDto {
  @ApiProperty({
    description: 'User unique ID (UUID)',
    example: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
  })
  id!: string;

  @ApiProperty({ description: 'User email address', example: 'attendee@example.com' })
  email!: string;

  @ApiProperty({
    description: 'Phone number if registered',
    example: '+966501234567',
    nullable: true,
  })
  phone!: string | null;

  @ApiProperty({
    description: 'Account lifecycle status',
    enum: AccountStatus,
    example: AccountStatus.ACTIVE,
  })
  status!: AccountStatus;

  @ApiProperty({ description: 'Assigned system roles', example: ['ATTENDEE'] })
  roles!: string[];

  @ApiProperty({ description: 'Assigned permissions', example: ['event:read', 'community:join'] })
  permissions!: string[];

  @ApiProperty({ description: 'Whether email has been verified', example: true })
  emailVerified!: boolean;

  @ApiProperty({ description: 'Last login timestamp if recorded', nullable: true })
  lastLoginAt!: string | null;

  @ApiProperty({ description: 'Account creation date' })
  createdAt!: string;
}
