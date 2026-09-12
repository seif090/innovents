import { Controller, Get, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { AdminAuditLogsService } from '../services/admin-audit-logs.service';
import { AdminAuditQueryDto } from '../dto/admin-audit-query.dto';
import { AuditLogItemDto, PaginatedAuditLogsDto } from '../dto/admin-audit-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@ApiTags('Admin Audit Logs')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/audit-logs')
export class AdminAuditLogsController {
  constructor(private readonly auditLogsService: AdminAuditLogsService) {}

  @Get()
  @ApiOperation({ summary: 'Query and filter immutable platform audit logs (Admin only)' })
  @ApiResponse({ status: 200, description: 'Paginated audit logs', type: PaginatedAuditLogsDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async listAuditLogs(@Query() query: AdminAuditQueryDto): Promise<PaginatedAuditLogsDto> {
    return this.auditLogsService.listAuditLogs(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve single immutable audit log record by UUID (Admin only)' })
  @ApiResponse({ status: 200, description: 'Audit log record', type: AuditLogItemDto })
  @ApiNotFoundResponse({ description: 'Audit log record not found' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async getAuditLogById(@Param('id', ParseUUIDPipe) id: string): Promise<AuditLogItemDto> {
    return this.auditLogsService.getAuditLogById(id);
  }
}
