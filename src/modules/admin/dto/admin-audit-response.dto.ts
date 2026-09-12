import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuditLogItemDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional() actorUserId?: string | null;
  @ApiProperty() action!: string;
  @ApiProperty() resourceType!: string;
  @ApiPropertyOptional() resourceId?: string | null;
  @ApiPropertyOptional() metadata?: Record<string, unknown> | null;
  @ApiPropertyOptional() ipAddress?: string | null;
  @ApiPropertyOptional() userAgent?: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional() actorEmail?: string | null;
}

export class PaginatedAuditLogsDto {
  @ApiProperty({ type: [AuditLogItemDto] }) items!: AuditLogItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalPages!: number;
}
