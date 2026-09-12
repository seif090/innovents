import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
import { CreateSponsorAdDto } from '../dto/create-sponsor-ad.dto';
import { UpdateSponsorAdDto } from '../dto/update-sponsor-ad.dto';
import { SponsorAdQueryDto } from '../dto/sponsor-ad-query.dto';
import { SponsorAdResponseDto, PaginatedSponsorAdsDto } from '../dto/sponsor-ad-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Sponsor Ads (Sponsor Management)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('SPONSOR')
@Controller('sponsor/ads')
export class SponsorAdsController {
  constructor(private readonly adsService: SponsorAdsService) {}

  @Post()
  @Permissions('manage:sponsor_ad')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new sponsor ad campaign (DRAFT)' })
  @ApiResponse({ status: 201, type: SponsorAdResponseDto })
  async createAd(
    @CurrentUser('sub') sponsorId: string,
    @Body() dto: CreateSponsorAdDto,
    @Req() req: Request,
  ): Promise<SponsorAdResponseDto> {
    return this.adsService.createAd(sponsorId, dto, req.ip, req.headers['user-agent'] as string);
  }

  @Get()
  @Permissions('manage:sponsor_ad')
  @ApiOperation({ summary: 'List own sponsor ad campaigns' })
  @ApiResponse({ status: 200, type: PaginatedSponsorAdsDto })
  async getMyAds(
    @CurrentUser('sub') sponsorId: string,
    @Query() query: SponsorAdQueryDto,
  ): Promise<PaginatedSponsorAdsDto> {
    return this.adsService.getSponsorAds(sponsorId, query);
  }

  @Get(':id')
  @Permissions('manage:sponsor_ad')
  @ApiOperation({ summary: 'Get sponsor ad campaign by ID' })
  @ApiResponse({ status: 200, type: SponsorAdResponseDto })
  async getAdById(
    @CurrentUser('sub') sponsorId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SponsorAdResponseDto> {
    return this.adsService.getSponsorAdById(sponsorId, id);
  }

  @Patch(':id')
  @Permissions('manage:sponsor_ad')
  @ApiOperation({ summary: 'Update sponsor ad campaign details' })
  @ApiResponse({ status: 200, type: SponsorAdResponseDto })
  async updateAd(
    @CurrentUser('sub') sponsorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSponsorAdDto,
    @Req() req: Request,
  ): Promise<SponsorAdResponseDto> {
    return this.adsService.updateAd(
      sponsorId,
      id,
      dto,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }

  @Post(':id/submit')
  @Permissions('manage:sponsor_ad')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit sponsor ad for admin moderation review' })
  @ApiResponse({ status: 200, type: SponsorAdResponseDto })
  async submitAd(
    @CurrentUser('sub') sponsorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<SponsorAdResponseDto> {
    return this.adsService.submitAd(sponsorId, id, req.ip, req.headers['user-agent'] as string);
  }

  @Patch(':id/status')
  @Permissions('manage:sponsor_ad')
  @ApiOperation({ summary: 'Toggle pause or resume on active sponsor ad' })
  @ApiResponse({ status: 200, type: SponsorAdResponseDto })
  async togglePause(
    @CurrentUser('sub') sponsorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<SponsorAdResponseDto> {
    return this.adsService.togglePauseAd(
      sponsorId,
      id,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }

  @Delete(':id')
  @Permissions('manage:sponsor_ad')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete sponsor ad campaign' })
  @ApiResponse({ status: 204, description: 'Ad deleted' })
  async deleteAd(
    @CurrentUser('sub') sponsorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<void> {
    return this.adsService.deleteAd(sponsorId, id, req.ip, req.headers['user-agent'] as string);
  }
}
