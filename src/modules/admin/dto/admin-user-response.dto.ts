import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountStatus } from '@prisma/client';

export class AdminUserSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiPropertyOptional() phone?: string | null;
  @ApiProperty({ enum: AccountStatus }) status!: AccountStatus;
  @ApiPropertyOptional() emailVerifiedAt?: Date | null;
  @ApiPropertyOptional() lastLoginAt?: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: [String] }) roles!: string[];
}

export class AdminUserDetailDto extends AdminUserSummaryDto {
  @ApiPropertyOptional() approvedAt?: Date | null;
  @ApiPropertyOptional() rejectedAt?: Date | null;
  @ApiPropertyOptional() rejectionReason?: string | null;
  @ApiPropertyOptional() suspendedAt?: Date | null;
  @ApiPropertyOptional() suspensionReason?: string | null;
  @ApiPropertyOptional() deletedAt?: Date | null;
  @ApiPropertyOptional() profiles?: Record<string, unknown> | null;
}

export class PaginatedAdminUsersDto {
  @ApiProperty({ type: [AdminUserSummaryDto] }) items!: AdminUserSummaryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalPages!: number;
}
