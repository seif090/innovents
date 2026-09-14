import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { Match } from '../../../common/decorators/match.decorator';

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
    example: 'Karim',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/\S/, {
    message: 'First name cannot be empty',
  })
  firstName!: string;

  @ApiProperty({
    example: 'Yasser',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/\S/, {
    message: 'Last name cannot be empty',
  })
  lastName!: string;

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
    example: 'StrongPassword123',
    description: 'Must match the password field',
  })
  @IsString()
  @IsNotEmpty()
  @Match('password', {
    message: 'Passwords do not match',
  })
  confirmPassword!: string;
}
