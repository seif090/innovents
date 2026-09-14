import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length, Matches, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { Match } from '@common/decorators/match.decorator';

export class RequestPasswordResetDto {
  @ApiProperty({
    description: 'Email address of the account to reset password for',
    example: 'attendee@example.com',
  })
  @IsEmail({}, { message: 'Invalid email address format' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;
}

export class ConfirmPasswordResetDto {
  @ApiProperty({
    description: 'Email address of the account',
    example: 'attendee@example.com',
  })
  @IsEmail({}, { message: 'Invalid email address format' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @ApiProperty({
    description: '6-digit OTP code received via email',
    example: '123456',
  })
  @IsString()
  @Length(6, 6, {
    message: 'Code must be exactly 6 digits',
  })
  @Matches(/^\d{6}$/, {
    message: 'Code must contain only digits',
  })
  code!: string;

  @ApiProperty({
    description: 'New password (minimum 8 characters, at least one letter and one number)',
    example: 'NewSecurePass2026!',
  })
  @IsString()
  @MinLength(8, {
    message: 'Password must be at least 8 characters long',
  })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'Password must contain at least one letter and one number',
  })
  newPassword!: string;

  @ApiProperty({
    description: 'Confirmation of the new password',
    example: 'NewSecurePass2026!',
  })
  @IsString()
  @IsNotEmpty({
    message: 'Password confirmation is required',
  })
  @Match('newPassword', {
    message: 'Passwords do not match',
  })
  confirmNewPassword!: string;
}
