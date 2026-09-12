import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { ReportsService } from '../services/reports.service';
import { ReportQueryDto } from '../dto/report-query.dto';
import { ResolveReportDto } from '../dto/resolve-report.dto';
import { ReportResponseDto, PaginatedReportsDto } from '../dto/report-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Admin Reports')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  @ApiOperation({ summary: 'List all content and user violation reports (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated platform reports',
    type: PaginatedReportsDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async getAdminReports(@Query() query: ReportQueryDto): Promise<PaginatedReportsDto> {
    return this.reportsService.getAdminReports(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific violation report (Admin only)' })
  @ApiResponse({ status: 200, description: 'Report detail', type: ReportResponseDto })
  @ApiNotFoundResponse({ description: 'Report not found' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async getAdminReportById(@Param('id', ParseUUIDPipe) id: string): Promise<ReportResponseDto> {
    return this.reportsService.getAdminReportById(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Review and update report resolution status (Admin only)' })
  @ApiResponse({ status: 200, description: 'Report status resolved', type: ReportResponseDto })
  @ApiNotFoundResponse({ description: 'Report not found' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async resolveReport(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') adminId: string,
    @Body() dto: ResolveReportDto,
    @Req() req: Request,
  ): Promise<ReportResponseDto> {
    return this.reportsService.resolveReport(
      id,
      adminId,
      dto,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }
}
