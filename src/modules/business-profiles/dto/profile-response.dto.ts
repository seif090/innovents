import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountStatus } from '@prisma/client';

/**
 * DTO for the currently authenticated user viewing their own profile.
 * Contains their identity and role-specific profile details.
 */
export class OwnProfileDto {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  id!: string;

  @ApiProperty({ example: 'sponsor@company.com' })
  email!: string;

  @ApiPropertyOptional({ example: '+966501234567' })
  phone?: string | null;

  @ApiProperty({ enum: AccountStatus, example: AccountStatus.ACTIVE })
  status!: AccountStatus;

  @ApiProperty({ example: ['SPONSOR'] })
  roles!: string[];

  @ApiProperty({ example: true })
  emailVerified!: boolean;

  @ApiPropertyOptional({ example: '2026-09-12T10:00:00.000Z' })
  lastLoginAt?: string | null;

  @ApiProperty({ example: '2026-09-10T10:00:00.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({ description: 'Role-specific profile details' })
  profile?: Record<string, unknown> | null;
}

/**
 * Public Business Profile DTO.
 * Strictly sanitized: NO email, NO phone, NO passwordHash, NO isEmailVerified,
 * NO private documents, NO internal audit data.
 */
export class PublicBusinessProfileDto {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  id!: string;

  @ApiProperty({
    example: 'SPONSOR',
    description: 'Business role (SPONSOR, VENDOR, PROVIDER, EVENT_OWNER, MEDIA)',
  })
  role!: string;

  @ApiProperty({ example: 'Tech Innovations Global' })
  name!: string;

  @ApiPropertyOptional({ example: 'https://cdn.innovent.app/logos/sponsor1.png' })
  logoUrl?: string | null;

  @ApiPropertyOptional({ example: 'https://techinnovations.com' })
  website?: string | null;

  @ApiPropertyOptional({ example: 'Global leader in smart enterprise cloud solutions.' })
  description?: string | null;

  @ApiPropertyOptional({ example: 'Information Technology' })
  category?: string | null;

  @ApiPropertyOptional({ example: 'Riyadh' })
  city?: string | null;

  @ApiPropertyOptional({ example: 'Saudi Arabia' })
  country?: string | null;

  @ApiPropertyOptional({ example: ['AI', 'Cloud'] })
  tags?: string[];

  @ApiProperty({ example: '2026-09-10T10:00:00.000Z' })
  createdAt!: string;
}

/**
 * Public User Profile DTO for attendees and organizers.
 * Strictly sanitized: NO email, NO phone, NO passwordHash, NO isEmailVerified.
 */
export class PublicUserProfileDto {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  id!: string;

  @ApiProperty({ example: 'John' })
  firstName!: string;

  @ApiProperty({ example: 'Doe' })
  lastName!: string;

  @ApiPropertyOptional({ example: 'https://cdn.innovent.app/avatars/user1.png' })
  avatarUrl?: string | null;

  @ApiPropertyOptional({ example: 'Senior AI Engineer' })
  bio?: string | null;

  @ApiPropertyOptional({ example: 'Lead Architect' })
  jobTitle?: string | null;

  @ApiPropertyOptional({ example: 'Acme Corp' })
  company?: string | null;

  @ApiPropertyOptional({ example: 'Riyadh' })
  city?: string | null;

  @ApiPropertyOptional({ example: 'Saudi Arabia' })
  country?: string | null;

  @ApiPropertyOptional({ example: ['AI', 'Cloud'] })
  interests?: string[];

  @ApiProperty({ example: '2026-09-10T10:00:00.000Z' })
  createdAt!: string;
}

/**
 * Full Admin Profile DTO.
 * Used exclusively by ADMIN endpoints. Contains full verification, approval status,
 * business documents, and contact details for administrative review.
 */
export class AdminProfileDto {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  id!: string;

  @ApiProperty({ example: 'sponsor@company.com' })
  email!: string;

  @ApiPropertyOptional({ example: '+966501234567' })
  phone?: string | null;

  @ApiProperty({ enum: AccountStatus, example: AccountStatus.PENDING })
  status!: AccountStatus;

  @ApiProperty({ example: ['SPONSOR'] })
  roles!: string[];

  @ApiProperty({ example: true })
  emailVerified!: boolean;

  @ApiPropertyOptional({ example: '2026-09-10T12:00:00.000Z' })
  emailVerifiedAt?: string | null;

  @ApiPropertyOptional({ example: '2026-09-11T12:00:00.000Z' })
  approvedAt?: string | null;

  @ApiPropertyOptional({ example: 'admin-uuid' })
  approvedByUserId?: string | null;

  @ApiPropertyOptional({ example: '2026-09-11T12:00:00.000Z' })
  rejectedAt?: string | null;

  @ApiPropertyOptional({ example: 'Incomplete commercial registration document' })
  rejectionReason?: string | null;

  @ApiPropertyOptional({ example: '2026-09-11T12:00:00.000Z' })
  suspendedAt?: string | null;

  @ApiPropertyOptional({ example: 'Policy violation' })
  suspensionReason?: string | null;

  @ApiProperty({ example: '2026-09-10T10:00:00.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({
    description: 'Role-specific profile details including submitted documents',
  })
  profile?: Record<string, unknown> | null;
}
