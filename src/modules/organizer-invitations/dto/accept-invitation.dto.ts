import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class AcceptInvitationDto {
  @ApiProperty({
    example: 'd4f9b8c3a21045e789abcdef1234567890abcdef1234567890abcdef12345678',
    description: 'The secret invitation token received in the invitation email',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  token!: string;

  @ApiPropertyOptional({
    example: 'SecurePass2026!',
    description: 'Password for new organizer account (required if account does not yet exist)',
  })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'Password must contain at least one letter and one number',
  })
  password?: string;

  @ApiPropertyOptional({ example: 'Khaled' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  firstName?: string;

  @ApiPropertyOptional({ example: 'Al-Hassan' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  lastName?: string;

  @ApiPropertyOptional({ example: '+966591234567' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;
}
