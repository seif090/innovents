import { ApiProperty } from '@nestjs/swagger';
import { AccountStatus } from '@prisma/client';

export class SafeUserDto {
  @ApiProperty({
    description: 'User unique ID (UUID)',
    example: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
  })
  id!: string;

  @ApiProperty({ description: 'User email address', example: 'attendee@example.com' })
  email!: string;

  @ApiProperty({
    description: 'User phone number if provided',
    example: '+966501234567',
    nullable: true,
  })
  phone!: string | null;

  @ApiProperty({
    description: 'Current account status',
    enum: AccountStatus,
    example: AccountStatus.ACTIVE,
  })
  status!: AccountStatus;

  @ApiProperty({ description: 'Assigned system roles', example: ['ATTENDEE'] })
  roles!: string[];

  @ApiProperty({ description: 'Whether email has been verified', example: true })
  emailVerified!: boolean;

  @ApiProperty({ description: 'Account creation timestamp', example: '2026-09-10T22:00:00.000Z' })
  createdAt!: string;
}

export class AuthTokensDto {
  @ApiProperty({
    description: 'JWT Access Token (short-lived)',
    example: 'eyJhbGciOiJIUzI1NiIsIn...',
  })
  accessToken!: string;

  @ApiProperty({
    description: 'Opaque cryptographically secure Refresh Token',
    example: '8f7a6b5c...',
  })
  refreshToken!: string;

  @ApiProperty({ description: 'Access token expiration duration', example: '15m' })
  expiresIn!: string;
}

export class AuthResponseDto {
  @ApiProperty({ description: 'Sanitized user identity data', type: SafeUserDto })
  user!: SafeUserDto;

  @ApiProperty({ description: 'Authentication credentials', type: AuthTokensDto })
  tokens!: AuthTokensDto;
}
