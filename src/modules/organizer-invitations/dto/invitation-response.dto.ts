import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvitationStatus } from '@prisma/client';

export class InvitationDetailsDto {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  id!: string;

  @ApiProperty({ example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' })
  eventId!: string;

  @ApiProperty({ example: 'organizer@example.com' })
  email!: string;

  @ApiProperty({ enum: InvitationStatus, example: InvitationStatus.PENDING })
  status!: InvitationStatus;

  @ApiProperty({ example: '2026-09-19T10:00:00.000Z' })
  expiresAt!: string;

  @ApiPropertyOptional({ example: '2026-09-13T10:00:00.000Z' })
  acceptedAt?: string | null;

  @ApiPropertyOptional({ example: '2026-09-12T12:00:00.000Z' })
  revokedAt?: string | null;

  @ApiProperty({ example: '2026-09-12T10:00:00.000Z' })
  createdAt!: string;
}

export class CreatedInvitationResponseDto {
  @ApiProperty({ type: InvitationDetailsDto })
  invitation!: InvitationDetailsDto;

  @ApiProperty({
    example: 'd4f9b8c3a21045e789abcdef1234567890abcdef1234567890abcdef12345678',
    description: 'One-time plaintext invitation token for inviter reference/direct delivery',
  })
  token!: string;

  @ApiProperty({
    example: 'https://innovent.app/invitations/accept?token=d4f9b8c3a210...',
    description: 'Direct acceptance link',
  })
  invitationUrl!: string;
}

export class AcceptedInvitationResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Invitation accepted successfully' })
  message!: string;

  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  userId!: string;

  @ApiProperty({ example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' })
  eventId!: string;

  @ApiPropertyOptional({ example: 'jwt-access-token' })
  accessToken?: string;

  @ApiPropertyOptional({ example: 'jwt-refresh-token' })
  refreshToken?: string;
}
