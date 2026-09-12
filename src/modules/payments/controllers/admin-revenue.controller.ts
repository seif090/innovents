import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentsService } from '../services/payments.service';
import { RevenueService } from '../services/revenue.service';
import { PaymentReconciliationService } from '../services/payment-reconciliation.service';
import { PaymentQueryDto } from '../dto/payment-query.dto';
import { PaymentResponseDto, PaginatedPaymentsDto } from '../dto/payment-response.dto';
import { AdminRefundDto } from '../dto/admin-refund.dto';
import { RevenueReportQueryDto, RevenueReportResponseDto } from '../dto/revenue-report.dto';
import { ReconcileQueryDto, ReconciliationReportDto } from '../dto/reconcile-query.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Admin Revenue & Payments')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('ADMIN')
@Controller('admin')
export class AdminRevenueController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly revenueService: RevenueService,
    private readonly reconciliationService: PaymentReconciliationService,
  ) {}

  @Get('revenue')
  @Permissions('read:revenue')
  @ApiOperation({ summary: 'Get aggregated financial revenue metrics and breakdowns' })
  @ApiResponse({ status: 200, type: RevenueReportResponseDto })
  async getRevenue(@Query() query: RevenueReportQueryDto): Promise<RevenueReportResponseDto> {
    return this.revenueService.getRevenueReport(query);
  }

  @Get('payments')
  @Permissions('manage:payment')
  @ApiOperation({ summary: 'Paginated payments listing with filtering' })
  @ApiResponse({ status: 200, type: PaginatedPaymentsDto })
  async listPayments(@Query() query: PaymentQueryDto): Promise<PaginatedPaymentsDto> {
    return this.paymentsService.getPayments(query);
  }

  @Post('payments/:id/refund')
  @Permissions('refund:payment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute administrative refund for payment' })
  @ApiResponse({ status: 200, type: PaymentResponseDto })
  async refundPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') adminUserId: string,
    @Body() dto: AdminRefundDto,
    @Req() req: Request,
  ): Promise<PaymentResponseDto> {
    return this.paymentsService.refundPayment(
      id,
      adminUserId,
      dto,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }

  @Post('payments/reconcile')
  @Permissions('manage:payment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reconcile stale pending payments against Stripe' })
  @ApiResponse({ status: 200, type: ReconciliationReportDto })
  async reconcilePayments(@Query() query: ReconcileQueryDto): Promise<ReconciliationReportDto> {
    return this.reconciliationService.reconcileStalePendingPayments(query);
  }
}
