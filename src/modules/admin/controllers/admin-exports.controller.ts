import { Controller, Get, Query, Res, UseGuards, Req } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { Response, Request } from 'express';
import { AdminExportsService } from '../services/admin-exports.service';
import { ExportQueryDto } from '../dto/export-query.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Admin CSV Exports')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/exports')
export class AdminExportsController {
  constructor(private readonly exportsService: AdminExportsService) {}

  @Get('users')
  @ApiOperation({ summary: 'Export platform users as sanitized CSV (Admin only)' })
  @ApiResponse({ status: 200, description: 'Sanitized CSV file stream' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async exportUsers(
    @Res() res: Response,
    @CurrentUser('sub') adminId: string,
    @Query() query: ExportQueryDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.exportsService.exportUsers(
      res,
      adminId,
      query,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }

  @Get('events')
  @ApiOperation({ summary: 'Export events as sanitized CSV (Admin only)' })
  @ApiResponse({ status: 200, description: 'Sanitized CSV file stream' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async exportEvents(
    @Res() res: Response,
    @CurrentUser('sub') adminId: string,
    @Query() query: ExportQueryDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.exportsService.exportEvents(
      res,
      adminId,
      query,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Export financial transactions as sanitized CSV (Admin only)' })
  @ApiResponse({ status: 200, description: 'Sanitized CSV file stream' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async exportTransactions(
    @Res() res: Response,
    @CurrentUser('sub') adminId: string,
    @Query() query: ExportQueryDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.exportsService.exportTransactions(
      res,
      adminId,
      query,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Export audit logs as sanitized CSV (Admin only)' })
  @ApiResponse({ status: 200, description: 'Sanitized CSV file stream' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async exportAuditLogs(
    @Res() res: Response,
    @CurrentUser('sub') adminId: string,
    @Query() query: ExportQueryDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.exportsService.exportAuditLogs(
      res,
      adminId,
      query,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }

  @Get('reports')
  @ApiOperation({ summary: 'Export violation reports as sanitized CSV (Admin only)' })
  @ApiResponse({ status: 200, description: 'Sanitized CSV file stream' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async exportReports(
    @Res() res: Response,
    @CurrentUser('sub') adminId: string,
    @Query() query: ExportQueryDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.exportsService.exportReports(
      res,
      adminId,
      query,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }
}
