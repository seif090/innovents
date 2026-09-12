import { Controller, Get, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiNotFoundResponse } from '@nestjs/swagger';
import { SponsorAdsService } from '../services/sponsor-ads.service';
import { SponsorAdQueryDto } from '../dto/sponsor-ad-query.dto';
import { SponsorAdResponseDto, PaginatedSponsorAdsDto } from '../dto/sponsor-ad-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Public } from '../../auth/decorators/public.decorator';

@ApiTags('Public Sponsor Ads')
@Controller('c2b/ads')
@UseGuards(JwtAuthGuard)
export class PublicAdsController {
  constructor(private readonly adsService: SponsorAdsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary:
      'Discover active and approved sponsor ads (strictly enforces campaign dates and event validity)',
  })
  @ApiResponse({ status: 200, type: PaginatedSponsorAdsDto })
  async discoverPublicAds(@Query() query: SponsorAdQueryDto): Promise<PaginatedSponsorAdsDto> {
    return this.adsService.discoverPublicAds(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get single active public ad details' })
  @ApiResponse({ status: 200, type: SponsorAdResponseDto })
  @ApiNotFoundResponse({ description: 'Ad not found or inactive' })
  async getPublicAdById(@Param('id', ParseUUIDPipe) id: string): Promise<SponsorAdResponseDto> {
    return this.adsService.getPublicAdById(id);
  }
}
