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
import { C2bServicesService } from '../services/c2b-services.service';
import { CreateC2bServiceDto } from '../dto/create-c2b-service.dto';
import { UpdateC2bServiceDto } from '../dto/update-c2b-service.dto';
import { C2bServiceResponseDto, PaginatedC2bServicesDto } from '../dto/c2b-service-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Provider C2B Services')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('PROVIDER')
@Controller('provider/services')
export class ProviderServicesController {
  constructor(private readonly servicesService: C2bServicesService) {}

  @Post()
  @Permissions('manage:c2b_service')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new C2B service offering (Active Providers only)' })
  @ApiResponse({ status: 201, type: C2bServiceResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Requires active PROVIDER role' })
  async createService(
    @CurrentUser('sub') providerId: string,
    @Body() dto: CreateC2bServiceDto,
    @Req() req: Request,
  ): Promise<C2bServiceResponseDto> {
    return this.servicesService.createService(
      providerId,
      dto,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }

  @Get()
  @Permissions('manage:c2b_service')
  @ApiOperation({ summary: "List provider's own C2B services" })
  @ApiResponse({ status: 200, type: PaginatedC2bServicesDto })
  async getMyServices(
    @CurrentUser('sub') providerId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<PaginatedC2bServicesDto> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const sizeNum = pageSize ? parseInt(pageSize, 10) : 20;
    return this.servicesService.getProviderServices(providerId, pageNum, sizeNum);
  }

  @Get(':id')
  @Permissions('manage:c2b_service')
  @ApiOperation({ summary: 'Get details of own C2B service by ID' })
  @ApiResponse({ status: 200, type: C2bServiceResponseDto })
  @ApiNotFoundResponse({ description: 'Service not found' })
  async getServiceById(
    @CurrentUser('sub') providerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<C2bServiceResponseDto> {
    return this.servicesService.getProviderServiceById(providerId, id);
  }

  @Patch(':id')
  @Permissions('manage:c2b_service')
  @ApiOperation({ summary: 'Update own C2B service offering' })
  @ApiResponse({ status: 200, type: C2bServiceResponseDto })
  @ApiNotFoundResponse({ description: 'Service not found' })
  async updateService(
    @CurrentUser('sub') providerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateC2bServiceDto,
    @Req() req: Request,
  ): Promise<C2bServiceResponseDto> {
    return this.servicesService.updateService(
      providerId,
      id,
      dto,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }

  @Delete(':id')
  @Permissions('manage:c2b_service')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete own C2B service offering' })
  @ApiResponse({ status: 204, description: 'Service deleted' })
  @ApiNotFoundResponse({ description: 'Service not found' })
  async deleteService(
    @CurrentUser('sub') providerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<void> {
    return this.servicesService.deleteService(
      providerId,
      id,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }
}
