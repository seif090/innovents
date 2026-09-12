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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { VendorServicesService } from '../services/vendor-services.service';
import { CreateVendorServiceDto } from '../dto/create-vendor-service.dto';
import { UpdateVendorServiceDto } from '../dto/update-vendor-service.dto';
import {
  VendorServiceResponseDto,
  PaginatedVendorServicesDto,
} from '../dto/vendor-service-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Vendor Services')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('VENDOR')
@Controller('vendor/services')
export class VendorServicesController {
  constructor(private readonly vendorServicesService: VendorServicesService) {}

  @Post()
  @Permissions('manage:vendor_service')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new vendor service offering (Active Vendors only)' })
  @ApiResponse({
    status: 201,
    description: 'Service offering created',
    type: VendorServiceResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Requires active VENDOR role' })
  async createService(
    @CurrentUser('sub') vendorId: string,
    @Body() dto: CreateVendorServiceDto,
    @Req() req: Request,
  ): Promise<VendorServiceResponseDto> {
    return this.vendorServicesService.createService(
      vendorId,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Get()
  @Permissions('manage:vendor_service')
  @ApiOperation({ summary: 'List all service offerings for authenticated vendor' })
  @ApiResponse({
    status: 200,
    description: 'Paginated vendor services',
    type: PaginatedVendorServicesDto,
  })
  async getMyServices(
    @CurrentUser('sub') vendorId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedVendorServicesDto> {
    return this.vendorServicesService.getMyServices(
      vendorId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  @Get(':id')
  @Permissions('manage:vendor_service')
  @ApiOperation({ summary: 'Get specific vendor service offering by ID' })
  @ApiResponse({
    status: 200,
    description: 'Service details',
    type: VendorServiceResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Service not found' })
  async getMyServiceById(
    @CurrentUser('sub') vendorId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VendorServiceResponseDto> {
    return this.vendorServicesService.getMyServiceById(vendorId, id);
  }

  @Patch(':id')
  @Permissions('manage:vendor_service')
  @ApiOperation({ summary: 'Update a vendor service offering' })
  @ApiResponse({
    status: 200,
    description: 'Service updated',
    type: VendorServiceResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Service not found' })
  async updateService(
    @CurrentUser('sub') vendorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorServiceDto,
    @Req() req: Request,
  ): Promise<VendorServiceResponseDto> {
    return this.vendorServicesService.updateService(
      vendorId,
      id,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post(':id/activate')
  @Permissions('manage:vendor_service')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate a vendor service offering' })
  @ApiResponse({
    status: 200,
    description: 'Service activated',
    type: VendorServiceResponseDto,
  })
  async activateService(
    @CurrentUser('sub') vendorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<VendorServiceResponseDto> {
    return this.vendorServicesService.activateService(
      vendorId,
      id,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post(':id/deactivate')
  @Permissions('manage:vendor_service')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a vendor service offering' })
  @ApiResponse({
    status: 200,
    description: 'Service deactivated',
    type: VendorServiceResponseDto,
  })
  async deactivateService(
    @CurrentUser('sub') vendorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<VendorServiceResponseDto> {
    return this.vendorServicesService.deactivateService(
      vendorId,
      id,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Delete(':id')
  @Permissions('manage:vendor_service')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete a vendor service offering' })
  @ApiResponse({ status: 200, description: 'Service deleted successfully' })
  @ApiNotFoundResponse({ description: 'Service not found' })
  async deleteService(
    @CurrentUser('sub') vendorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<{ success: boolean; message: string }> {
    return this.vendorServicesService.deleteService(
      vendorId,
      id,
      req.ip,
      req.headers['user-agent'],
    );
  }
}
