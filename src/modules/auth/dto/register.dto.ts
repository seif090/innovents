import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum AllowedRegistrationRole {
  ATTENDEE = 'ATTENDEE',
  SPONSOR = 'SPONSOR',
  VENDOR = 'VENDOR',
  PROVIDER = 'PROVIDER',
  EVENT_OWNER = 'EVENT_OWNER',
  MEDIA = 'MEDIA',
}

export class RegisterDto {
  @ApiProperty({
    description: 'User email address',
    example: 'attendee@example.com',
  })
  @IsEmail({}, { message: 'Invalid email address format' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @ApiProperty({
    description: 'International phone number with country code',
    example: '+966501234567',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  phone?: string;

  @ApiProperty({
    description: 'Password (minimum 8 characters, at least one letter and one number)',
    example: 'SecurePass2026!',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'Password must contain at least one letter and one number',
  })
  password!: string;

  @ApiProperty({
    description: 'Account role to register for',
    enum: AllowedRegistrationRole,
    example: AllowedRegistrationRole.ATTENDEE,
  })
  @IsEnum(AllowedRegistrationRole, {
    message:
      'Role must be one of: ATTENDEE, SPONSOR, VENDOR, PROVIDER, EVENT_OWNER, MEDIA. Organizers are invitation-only.',
  })
  @IsNotEmpty()
  role!: AllowedRegistrationRole;
}
