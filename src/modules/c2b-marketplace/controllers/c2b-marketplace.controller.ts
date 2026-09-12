import { Controller, Get, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiNotFoundResponse } from '@nestjs/swagger';
import { C2bServicesService } from '../services/c2b-services.service';
import { C2bDiscoveryQueryDto } from '../dto/c2b-discovery-query.dto';
import { C2bServiceResponseDto, PaginatedC2bServicesDto } from '../dto/c2b-service-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Public } from '../../auth/decorators/public.decorator';

@ApiTags('C2B Marketplace')
@Controller('c2b')
@UseGuards(JwtAuthGuard)
export class C2bMarketplaceController {
  constructor(private readonly servicesService: C2bServicesService) {}

  @Public()
  @Get('services')
  @ApiOperation({
    summary: 'Discover active C2B services (strictly enforces active event & non-expired)',
  })
  @ApiResponse({ status: 200, type: PaginatedC2bServicesDto })
  async discoverServices(@Query() query: C2bDiscoveryQueryDto): Promise<PaginatedC2bServicesDto> {
    return this.servicesService.discoverServices(query);
  }

  @Public()
  @Get('services/:id')
  @ApiOperation({ summary: 'Get public C2B service card details' })
  @ApiResponse({ status: 200, type: C2bServiceResponseDto })
  @ApiNotFoundResponse({ description: 'Service not found or unavailable' })
  async getServiceDetails(@Param('id', ParseUUIDPipe) id: string): Promise<C2bServiceResponseDto> {
    return this.servicesService.getServiceDetails(id);
  }
}
