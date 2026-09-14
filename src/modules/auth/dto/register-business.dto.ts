import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Match } from '../../../common/decorators/match.decorator';

export enum AllowedBusinessRegistrationRole {
  SPONSOR = 'SPONSOR',
  VENDOR = 'VENDOR',
  PROVIDER = 'PROVIDER',
  EVENT_OWNER = 'EVENT_OWNER',
  MEDIA = 'MEDIA',
}

export class RegisterBusinessDto {
  @ApiProperty({
    enum: AllowedBusinessRegistrationRole,
    example: AllowedBusinessRegistrationRole.SPONSOR,
  })
  @IsEnum(AllowedBusinessRegistrationRole)
  role!: AllowedBusinessRegistrationRole;

  @ApiProperty({
    example: 'company@example.com',
  })
  @IsEmail({}, { message: 'Invalid email address format' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @ApiPropertyOptional({
    example: '+201001234567',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  phone?: string;

  @ApiProperty({
    example: 'Password123',
  })
  @IsString()
  @MinLength(8, {
    message: 'Password must be at least 8 characters long',
  })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'Password must contain at least one letter and one number',
  })
  password!: string;

  @ApiProperty({
    example: 'Password123',
  })
  @IsString()
  @IsNotEmpty()
  @Match('password', {
    message: 'Passwords do not match',
  })
  confirmPassword!: string;

  // -------------------------
  // Sponsor / Vendor
  // -------------------------

  @ApiPropertyOptional({
    example: 'ABC Events Company',
  })
  @ValidateIf(
    (o: RegisterBusinessDto) =>
      o.role === AllowedBusinessRegistrationRole.SPONSOR ||
      o.role === AllowedBusinessRegistrationRole.VENDOR,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  companyName?: string;

  // -------------------------
  // Vendor only
  // -------------------------

  @ApiPropertyOptional({
    example: 'Catering',
  })
  @ValidateIf((o: RegisterBusinessDto) => o.role === AllowedBusinessRegistrationRole.VENDOR)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  serviceCategory?: string;

  // -------------------------
  // Provider only
  // -------------------------

  @ApiPropertyOptional({
    example: 'Premium Transportation',
  })
  @ValidateIf((o: RegisterBusinessDto) => o.role === AllowedBusinessRegistrationRole.PROVIDER)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  businessName?: string;

  @ApiPropertyOptional({
    example: 'Transportation',
  })
  @ValidateIf((o: RegisterBusinessDto) => o.role === AllowedBusinessRegistrationRole.PROVIDER)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  providerType?: string;

  // -------------------------
  // Event Owner only
  // -------------------------

  @ApiPropertyOptional({
    example: 'INOVENT Events',
  })
  @ValidateIf((o: RegisterBusinessDto) => o.role === AllowedBusinessRegistrationRole.EVENT_OWNER)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  organizationName?: string;

  // -------------------------
  // Media only
  // -------------------------

  @ApiPropertyOptional({
    example: 'Tech News Egypt',
  })
  @ValidateIf((o: RegisterBusinessDto) => o.role === AllowedBusinessRegistrationRole.MEDIA)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  mediaOutlet?: string;

  // -------------------------
  // Common optional fields
  // -------------------------

  @ApiPropertyOptional({
    example: 'Karim Yasser',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactName?: string;

  @ApiPropertyOptional({
    example: 'https://example.com',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;

  @ApiPropertyOptional({
    example: 'Event management and marketing company',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 'Alexandria',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({
    example: 'Egypt',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;
}
