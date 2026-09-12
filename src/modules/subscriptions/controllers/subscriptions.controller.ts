import { JwtPayload } from '../../auth/services/token.service';
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { SubscriptionsService } from '../services/subscriptions.service';
import {
  CreateSubscriptionCheckoutDto,
  SubscriptionCheckoutResponseDto,
} from '../dto/create-subscription-checkout.dto';
import { SubscriptionResponseDto } from '../dto/subscription-response.dto';
import { CancelSubscriptionDto } from '../dto/cancel-subscription.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Subscriptions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post('checkout')
  @Roles('SPONSOR', 'VENDOR')
  @Permissions('create:subscription')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create Stripe Checkout session for a platform subscription' })
  @ApiResponse({ status: 201, type: SubscriptionCheckoutResponseDto })
  async createCheckout(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateSubscriptionCheckoutDto,
    @Req() req: Request,
  ): Promise<SubscriptionCheckoutResponseDto> {
    return this.subscriptionsService.createCheckout(
      userId,
      dto,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }

  @Get('current')
  @Roles('SPONSOR', 'VENDOR', 'ADMIN')
  @Permissions('read_own:subscription')
  @ApiOperation({ summary: 'Get current active subscription for the authenticated user' })
  @ApiResponse({ status: 200, type: SubscriptionResponseDto })
  async getCurrentSubscription(
    @CurrentUser('sub') userId: string,
  ): Promise<SubscriptionResponseDto | null> {
    return this.subscriptionsService.getCurrentSubscription(userId);
  }

  @Post(':id/cancel')
  @Roles('SPONSOR', 'VENDOR', 'ADMIN')
  @Permissions('read_own:subscription')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel active subscription (owner or admin)' })
  @ApiResponse({ status: 200, type: SubscriptionResponseDto })
  async cancelSubscription(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CancelSubscriptionDto,
    @Req() req: Request,
  ): Promise<SubscriptionResponseDto> {
    const isAdmin = user?.roles?.includes('ADMIN') || user?.permissions?.includes('manage:all');
    return this.subscriptionsService.cancelSubscription(
      id,
      user.sub,
      isAdmin,
      dto,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }
}
