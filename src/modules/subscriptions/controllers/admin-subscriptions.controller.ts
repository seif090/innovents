import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SubscriptionsService } from '../services/subscriptions.service';
import { SubscriptionQueryDto } from '../dto/subscription-query.dto';
import { PaginatedSubscriptionsDto } from '../dto/subscription-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';

@ApiTags('Admin Subscriptions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('ADMIN')
@Controller('admin/subscriptions')
export class AdminSubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  @Permissions('manage:subscription')
  @ApiOperation({ summary: 'Paginated listing of all platform subscriptions' })
  @ApiResponse({ status: 200, type: PaginatedSubscriptionsDto })
  async listSubscriptions(
    @Query() query: SubscriptionQueryDto,
  ): Promise<PaginatedSubscriptionsDto> {
    return this.subscriptionsService.getSubscriptions(query);
  }
}
