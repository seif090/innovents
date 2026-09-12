import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { AdminOperationalReportsService } from '../services/admin-operational-reports.service';
import {
  UsersReportDto,
  EventsReportDto,
  CommunitiesReportDto,
  MarketplaceReportDto,
} from '../dto/operational-reports.dto';
import { RevenueReportResponseDto } from '../../payments/dto/revenue-report.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@ApiTags('Admin Operational Reports')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/reports')
export class AdminOperationalReportsController {
  constructor(private readonly reportsService: AdminOperationalReportsService) {}

  @Get('users')
  @ApiOperation({ summary: 'User domain aggregation metrics (Admin only)' })
  @ApiResponse({ status: 200, description: 'User report data', type: UsersReportDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async getUsersReport(): Promise<UsersReportDto> {
    return this.reportsService.getUsersReport();
  }

  @Get('events')
  @ApiOperation({ summary: 'Event domain aggregation metrics (Admin only)' })
  @ApiResponse({ status: 200, description: 'Event report data', type: EventsReportDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async getEventsReport(): Promise<EventsReportDto> {
    return this.reportsService.getEventsReport();
  }

  @Get('communities')
  @ApiOperation({ summary: 'Community domain aggregation metrics (Admin only)' })
  @ApiResponse({ status: 200, description: 'Community report data', type: CommunitiesReportDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async getCommunitiesReport(): Promise<CommunitiesReportDto> {
    return this.reportsService.getCommunitiesReport();
  }

  @Get('marketplace')
  @ApiOperation({ summary: 'Marketplace domain aggregation metrics (Admin only)' })
  @ApiResponse({ status: 200, description: 'Marketplace report data', type: MarketplaceReportDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async getMarketplaceReport(): Promise<MarketplaceReportDto> {
    return this.reportsService.getMarketplaceReport();
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Authoritative financial revenue analytics (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Authoritative revenue analytics',
    type: RevenueReportResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async getRevenueReport(): Promise<RevenueReportResponseDto> {
    return this.reportsService.getRevenueReport();
  }
}
