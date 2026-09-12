import {
  Controller,
  Get,
  Post,
  Patch,
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
import { CouponsService } from '../services/coupons.service';
import { CreateCouponDto } from '../dto/create-coupon.dto';
import { UpdateCouponDto } from '../dto/update-coupon.dto';
import { ValidateCouponDto } from '../dto/validate-coupon.dto';
import { RedeemCouponDto } from '../dto/redeem-coupon.dto';
import {
  CouponResponseDto,
  CouponValidationResultDto,
  CouponRedemptionResponseDto,
} from '../dto/coupon-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';

@ApiTags('Coupons')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller()
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  // -------------------------------------------------------------
  // Provider Coupon Management (/api/v1/provider/coupons)
  // -------------------------------------------------------------

  @Post('provider/coupons')
  @Roles('PROVIDER')
  @Permissions('manage:coupon')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new promotional discount coupon (Active Providers only)' })
  @ApiResponse({ status: 201, type: CouponResponseDto })
  async createCoupon(
    @CurrentUser('sub') providerId: string,
    @Body() dto: CreateCouponDto,
    @Req() req: Request,
  ): Promise<CouponResponseDto> {
    return this.couponsService.createCoupon(
      providerId,
      dto,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }

  @Get('provider/coupons')
  @Roles('PROVIDER')
  @Permissions('manage:coupon')
  @ApiOperation({ summary: 'List provider promotional coupons' })
  @ApiResponse({ status: 200, type: [CouponResponseDto] })
  async getProviderCoupons(@CurrentUser('sub') providerId: string): Promise<CouponResponseDto[]> {
    return this.couponsService.getProviderCoupons(providerId);
  }

  @Patch('provider/coupons/:id')
  @Roles('PROVIDER')
  @Permissions('manage:coupon')
  @ApiOperation({ summary: 'Update coupon details or active status' })
  @ApiResponse({ status: 200, type: CouponResponseDto })
  async updateCoupon(
    @CurrentUser('sub') providerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCouponDto,
    @Req() req: Request,
  ): Promise<CouponResponseDto> {
    return this.couponsService.updateCoupon(
      providerId,
      id,
      dto,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }

  // -------------------------------------------------------------
  // Attendee / Public Coupon Operations (/api/v1/c2b/coupons)
  // -------------------------------------------------------------

  @Public()
  @Post('c2b/coupons/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate a coupon code against event / service scope' })
  @ApiResponse({ status: 200, type: CouponValidationResultDto })
  async validateCoupon(@Body() dto: ValidateCouponDto): Promise<CouponValidationResultDto> {
    return this.couponsService.validateCoupon(dto);
  }

  @Post('c2b/coupons/redeem')
  @Roles('ATTENDEE')
  @Permissions('redeem:coupon')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Atomically redeem a coupon (enforces limits and anti-replay)' })
  @ApiResponse({ status: 200, type: CouponRedemptionResponseDto })
  async redeemCoupon(
    @CurrentUser('sub') attendeeId: string,
    @Body() dto: RedeemCouponDto,
    @Req() req: Request,
  ): Promise<CouponRedemptionResponseDto> {
    return this.couponsService.redeemCoupon(
      attendeeId,
      dto,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }
}
