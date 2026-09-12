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
import { SponsorAdsService } from '../services/sponsor-ads.service';
import { RejectSponsorAdDto } from '../dto/review-sponsor-ad.dto';
import { SponsorAdQueryDto } from '../dto/sponsor-ad-query.dto';
import { SponsorAdResponseDto, PaginatedSponsorAdsDto } from '../dto/sponsor-ad-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Admin Ads Moderation')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('ADMIN')
@Controller('admin/ads')
export class AdminAdsController {
  constructor(private readonly adsService: SponsorAdsService) {}

  @Get()
  @Permissions('review:sponsor_ad')
  @ApiOperation({ summary: 'List sponsor ads for moderation and administrative review' })
  @ApiResponse({ status: 200, type: PaginatedSponsorAdsDto })
  async getAdsForModeration(@Query() query: SponsorAdQueryDto): Promise<PaginatedSponsorAdsDto> {
    return this.adsService.getAdminAds(query);
  }

  @Post(':id/approve')
  @Permissions('review:sponsor_ad')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a submitted sponsor ad' })
  @ApiResponse({ status: 200, type: SponsorAdResponseDto })
  async approveAd(
    @CurrentUser('sub') adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<SponsorAdResponseDto> {
    return this.adsService.approveAd(adminId, id, req.ip, req.headers['user-agent'] as string);
  }

  @Post(':id/reject')
  @Permissions('review:sponsor_ad')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a submitted sponsor ad with reason' })
  @ApiResponse({ status: 200, type: SponsorAdResponseDto })
  async rejectAd(
    @CurrentUser('sub') adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectSponsorAdDto,
    @Req() req: Request,
  ): Promise<SponsorAdResponseDto> {
    return this.adsService.rejectAd(adminId, id, dto, req.ip, req.headers['user-agent'] as string);
  }
}
