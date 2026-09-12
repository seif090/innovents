import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { AdminDashboardService } from '../services/admin-dashboard.service';
import { AdminDashboardResponseDto } from '../dto/dashboard-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@ApiTags('Admin Dashboard')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Get unified platform operational dashboard metrics (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Aggregated operational KPIs across all platform domains',
    type: AdminDashboardResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async getDashboard(): Promise<AdminDashboardResponseDto> {
    return this.dashboardService.getDashboardMetrics();
  }
}
