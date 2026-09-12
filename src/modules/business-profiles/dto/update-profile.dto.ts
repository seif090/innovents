import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  IsObject,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateAttendeeProfileDto {
  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  lastName?: string;

  @ApiPropertyOptional({ example: 'https://cdn.innovent.app/avatars/user1.png' })
  @IsOptional()
  @IsUrl({}, { message: 'avatarUrl must be a valid URL' })
  @MaxLength(500)
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'Senior AI Engineer & Tech Speaker' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({ example: 'Lead Architect' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  jobTitle?: string;

  @ApiPropertyOptional({ example: 'Acme Corp' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  company?: string;

  @ApiPropertyOptional({ example: ['AI', 'Cloud', 'Networking'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @ApiPropertyOptional({ example: 'Riyadh' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'Saudi Arabia' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ example: { linkedin: 'https://linkedin.com/in/johndoe' } })
  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, unknown>;
}

export class UpdateSponsorProfileDto {
  @ApiPropertyOptional({ example: 'Tech Innovations Global' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  companyName?: string;

  @ApiPropertyOptional({ example: 'https://cdn.innovent.app/logos/sponsor1.png' })
  @IsOptional()
  @IsUrl({}, { message: 'logoUrl must be a valid URL' })
  @MaxLength(500)
  logoUrl?: string;

  @ApiPropertyOptional({ example: 'https://techinnovations.com' })
  @IsOptional()
  @IsUrl({}, { message: 'website must be a valid URL' })
  @MaxLength(500)
  website?: string;

  @ApiPropertyOptional({ example: 'Global leader in smart enterprise cloud solutions.' })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @ApiPropertyOptional({ example: 'Information Technology' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @ApiPropertyOptional({ example: 'PLATINUM' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  tier?: string;

  @ApiPropertyOptional({ example: 'Sarah Connor' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactName?: string;

  @ApiPropertyOptional({ example: 'partnerships@techinnovations.com' })
  @IsOptional()
  @IsEmail({}, { message: 'contactEmail must be a valid email format' })
  @MaxLength(255)
  contactEmail?: string;

  @ApiPropertyOptional({ example: '+966501234567' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactPhone?: string;

  @ApiPropertyOptional({ example: 'King Fahd Road, Al Olaya' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ example: 'Riyadh' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'Saudi Arabia' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ example: { crNumber: '1010123456' } })
  @IsOptional()
  @IsObject()
  documents?: Record<string, unknown>;
}

export class UpdateVendorProfileDto {
  @ApiPropertyOptional({ example: 'Apex Audio-Visual & Staging' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  companyName?: string;

  @ApiPropertyOptional({ example: 'https://cdn.innovent.app/logos/vendor1.png' })
  @IsOptional()
  @IsUrl({}, { message: 'logoUrl must be a valid URL' })
  @MaxLength(500)
  logoUrl?: string;

  @ApiPropertyOptional({ example: 'https://apexav.com' })
  @IsOptional()
  @IsUrl({}, { message: 'website must be a valid URL' })
  @MaxLength(500)
  website?: string;

  @ApiPropertyOptional({ example: 'High-end stage production and audio visual rental.' })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @ApiPropertyOptional({ example: 'AV & Production' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  serviceCategory?: string;

  @ApiPropertyOptional({ example: 'Tariq Al-Mansoor' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactName?: string;

  @ApiPropertyOptional({ example: 'operations@apexav.com' })
  @IsOptional()
  @IsEmail({}, { message: 'contactEmail must be a valid email format' })
  @MaxLength(255)
  contactEmail?: string;

  @ApiPropertyOptional({ example: '+966551234567' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactPhone?: string;

  @ApiPropertyOptional({ example: '1010987654' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  crNumber?: string;

  @ApiPropertyOptional({ example: '300123456700003' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  taxNumber?: string;

  @ApiPropertyOptional({ example: 'Al Malaz Industrial Area' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ example: 'Riyadh' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'Saudi Arabia' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ example: { portfolio: 'https://cdn.innovent.app/docs/deck.pdf' } })
  @IsOptional()
  @IsObject()
  documents?: Record<string, unknown>;
}

export class UpdateProviderProfileDto {
  @ApiPropertyOptional({ example: 'Luxury Hospitality Partners' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  businessName?: string;

  @ApiPropertyOptional({ example: 'https://cdn.innovent.app/logos/provider1.png' })
  @IsOptional()
  @IsUrl({}, { message: 'logoUrl must be a valid URL' })
  @MaxLength(500)
  logoUrl?: string;

  @ApiPropertyOptional({ example: 'https://luxurypartners.com' })
  @IsOptional()
  @IsUrl({}, { message: 'website must be a valid URL' })
  @MaxLength(500)
  website?: string;

  @ApiPropertyOptional({ example: 'VIP hotel bookings and executive transport for event guests.' })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @ApiPropertyOptional({ example: 'Hospitality & Travel' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  providerType?: string;

  @ApiPropertyOptional({ example: ['VIP Transport', 'Hotel Logistics'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ example: 'Fahad Al-Sabah' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactName?: string;

  @ApiPropertyOptional({ example: 'reservations@luxurypartners.com' })
  @IsOptional()
  @IsEmail({}, { message: 'contactEmail must be a valid email format' })
  @MaxLength(255)
  contactEmail?: string;

  @ApiPropertyOptional({ example: '+966541234567' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactPhone?: string;

  @ApiPropertyOptional({ example: 'https://luxurypartners.com/portfolio' })
  @IsOptional()
  @IsUrl({}, { message: 'portfolioUrl must be a valid URL' })
  @MaxLength(500)
  portfolioUrl?: string;

  @ApiPropertyOptional({ example: 'Jeddah' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'Saudi Arabia' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;
}

export class UpdateEventOwnerProfileDto {
  @ApiPropertyOptional({ example: 'Middle East Tech Summits LLC' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  organizationName?: string;

  @ApiPropertyOptional({ example: 'https://cdn.innovent.app/logos/org1.png' })
  @IsOptional()
  @IsUrl({}, { message: 'logoUrl must be a valid URL' })
  @MaxLength(500)
  logoUrl?: string;

  @ApiPropertyOptional({ example: 'https://metechsummits.com' })
  @IsOptional()
  @IsUrl({}, { message: 'website must be a valid URL' })
  @MaxLength(500)
  website?: string;

  @ApiPropertyOptional({ example: 'Leading organizer of global AI and fintech conferences.' })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @ApiPropertyOptional({ example: 'Noura Al-Otaibi' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactName?: string;

  @ApiPropertyOptional({ example: 'contact@metechsummits.com' })
  @IsOptional()
  @IsEmail({}, { message: 'contactEmail must be a valid email format' })
  @MaxLength(255)
  contactEmail?: string;

  @ApiPropertyOptional({ example: '+966561234567' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactPhone?: string;

  @ApiPropertyOptional({ example: 'Riyadh' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'Saudi Arabia' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;
}

export class UpdateOrganizerProfileDto {
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

  @ApiPropertyOptional({ example: 'https://cdn.innovent.app/avatars/org1.png' })
  @IsOptional()
  @IsUrl({}, { message: 'avatarUrl must be a valid URL' })
  @MaxLength(500)
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'Operations Lead' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  jobTitle?: string;

  @ApiPropertyOptional({ example: 'Tech Summits Team' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  organization?: string;

  @ApiPropertyOptional({ example: '+966591234567' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;
}

export class UpdateMediaProfileDto {
  @ApiPropertyOptional({ example: 'Tech News Arabia' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  mediaOutlet?: string;

  @ApiPropertyOptional({ example: 'Digital Publication' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  outletType?: string;

  @ApiPropertyOptional({ example: 'https://cdn.innovent.app/logos/press1.png' })
  @IsOptional()
  @IsUrl({}, { message: 'logoUrl must be a valid URL' })
  @MaxLength(500)
  logoUrl?: string;

  @ApiPropertyOptional({ example: 'https://technews-arabia.com' })
  @IsOptional()
  @IsUrl({}, { message: 'website must be a valid URL' })
  @MaxLength(500)
  website?: string;

  @ApiPropertyOptional({ example: 'PRESS-2026-9812' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  pressCardNumber?: string;

  @ApiPropertyOptional({ example: 'Hassan Zaki' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactName?: string;

  @ApiPropertyOptional({ example: 'press@technews-arabia.com' })
  @IsOptional()
  @IsEmail({}, { message: 'contactEmail must be a valid email format' })
  @MaxLength(255)
  contactEmail?: string;

  @ApiPropertyOptional({ example: '+966581234567' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactPhone?: string;

  @ApiPropertyOptional({ example: ['AI', 'Startups', 'Fintech'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  coverageInterests?: string[];
}
