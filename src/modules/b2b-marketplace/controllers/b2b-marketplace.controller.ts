import { Controller, Get, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiNotFoundResponse } from '@nestjs/swagger';
import { B2bMarketplaceService } from '../services/b2b-marketplace.service';
import {
  MarketplaceSearchQueryDto,
  VendorDiscoveryQueryDto,
} from '../dto/marketplace-search-query.dto';
import {
  MarketplaceServiceItemDto,
  PaginatedMarketplaceServicesDto,
  PublicVendorSummaryDto,
  PaginatedVendorsDto,
} from '../dto/marketplace-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Public } from '../../auth/decorators/public.decorator';

@ApiTags('B2B Marketplace')
@Controller('b2b')
@UseGuards(JwtAuthGuard)
export class B2bMarketplaceController {
  constructor(private readonly marketplaceService: B2bMarketplaceService) {}

  @Public()
  @Get('services')
  @ApiOperation({
    summary: 'Discover and search active vendor services with multi-criteria filtering',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated marketplace service listings',
    type: PaginatedMarketplaceServicesDto,
  })
  async discoverServices(
    @Query() query: MarketplaceSearchQueryDto,
  ): Promise<PaginatedMarketplaceServicesDto> {
    return this.marketplaceService.discoverServices(query);
  }

  @Public()
  @Get('services/:id')
  @ApiOperation({ summary: 'Get public vendor service details' })
  @ApiResponse({
    status: 200,
    description: 'Marketplace service details',
    type: MarketplaceServiceItemDto,
  })
  @ApiNotFoundResponse({ description: 'Service not found or unavailable' })
  async getServiceDetails(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MarketplaceServiceItemDto> {
    return this.marketplaceService.getServiceDetails(id);
  }

  @Public()
  @Get('vendors')
  @ApiOperation({ summary: 'Discover verified and approved vendor profiles' })
  @ApiResponse({
    status: 200,
    description: 'Paginated public vendor directory',
    type: PaginatedVendorsDto,
  })
  async discoverVendors(@Query() query: VendorDiscoveryQueryDto): Promise<PaginatedVendorsDto> {
    return this.marketplaceService.discoverVendors(query);
  }

  @Public()
  @Get('vendors/:id')
  @ApiOperation({ summary: 'Get public vendor profile by ID' })
  @ApiResponse({
    status: 200,
    description: 'Public vendor details',
    type: PublicVendorSummaryDto,
  })
  @ApiNotFoundResponse({ description: 'Vendor not found' })
  async getVendorDetails(@Param('id', ParseUUIDPipe) id: string): Promise<PublicVendorSummaryDto> {
    return this.marketplaceService.getVendorDetails(id);
  }
}
