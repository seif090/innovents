import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountStatus } from '@prisma/client';

export class ApprovalListItemDto {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  id!: string;

  @ApiProperty({ example: 'sponsor@company.com' })
  email!: string;

  @ApiPropertyOptional({ example: '+966501234567' })
  phone?: string | null;

  @ApiProperty({ enum: AccountStatus, example: AccountStatus.PENDING })
  status!: AccountStatus;

  @ApiProperty({ example: 'SPONSOR' })
  role!: string;

  @ApiPropertyOptional({ example: 'Tech Innovations Global' })
  companyOrName?: string | null;

  @ApiProperty({ example: true })
  emailVerified!: boolean;

  @ApiProperty({ example: '2026-09-10T10:00:00.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({ example: '2026-09-11T12:00:00.000Z' })
  approvedAt?: string | null;

  @ApiPropertyOptional({ example: '2026-09-11T12:00:00.000Z' })
  rejectedAt?: string | null;

  @ApiPropertyOptional({ example: '2026-09-11T12:00:00.000Z' })
  suspendedAt?: string | null;
}

export class PaginatedApprovalsDto {
  @ApiProperty({ type: [ApprovalListItemDto] })
  items!: ApprovalListItemDto[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}

export class ApprovalActionResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Account approved successfully' })
  message!: string;

  @ApiProperty({ enum: AccountStatus, example: AccountStatus.ACTIVE })
  status!: AccountStatus;

  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  userId!: string;
}
