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
import { PaymentsService } from '../services/payments.service';
import {
  CreateCommunitySponsorshipCheckoutDto,
  CheckoutSessionResponseDto,
} from '../dto/create-checkout.dto';
import { PaymentResponseDto } from '../dto/payment-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Payments')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('checkout/community-sponsorship')
  @Roles('SPONSOR')
  @Permissions('create:community_sponsorship')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initiate Stripe Checkout session for Community Sponsorship' })
  @ApiResponse({ status: 201, type: CheckoutSessionResponseDto })
  async createCommunitySponsorshipCheckout(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateCommunitySponsorshipCheckoutDto,
    @Req() req: Request,
  ): Promise<CheckoutSessionResponseDto> {
    return this.paymentsService.createCommunitySponsorshipCheckout(
      userId,
      dto,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }

  @Get(':id')
  @Roles('SPONSOR', 'VENDOR', 'ADMIN')
  @Permissions('read_own:payment')
  @ApiOperation({ summary: 'Get payment details by ID (Owner or Admin only)' })
  @ApiResponse({ status: 200, type: PaymentResponseDto })
  async getPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<PaymentResponseDto> {
    const isAdmin = user?.roles?.includes('ADMIN') || user?.permissions?.includes('manage:all');
    return this.paymentsService.getPaymentById(id, user.sub, isAdmin);
  }
}
