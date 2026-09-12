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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { QuotationService } from '../services/quotation.service';
import { CreateQuotationDto } from '../dto/create-quotation.dto';
import { RejectQuotationDto } from '../dto/quotation-action.dto';
import { QuotationDetailsResponseDto, PaginatedQuotationsDto } from '../dto/quotation-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('B2B Quotations')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('b2b/quotations')
export class QuotationController {
  constructor(private readonly quotationService: QuotationService) {}

  @Post()
  @Roles('VENDOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a quotation (or next version) for an RFQ (Vendor only)' })
  @ApiResponse({
    status: 201,
    description: 'Quotation created',
    type: QuotationDetailsResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Requires active VENDOR role' })
  @ApiBadRequestResponse({ description: 'Invalid calculation or RFQ status' })
  async createQuotation(
    @CurrentUser('sub') vendorId: string,
    @Body() dto: CreateQuotationDto,
    @Req() req: Request,
  ): Promise<QuotationDetailsResponseDto> {
    return this.quotationService.createQuotation(vendorId, dto, req.ip, req.headers['user-agent']);
  }

  @Get()
  @Roles('SPONSOR', 'VENDOR', 'ADMIN')
  @ApiOperation({ summary: 'List all quotations for a specific RFQ' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of quotations',
    type: PaginatedQuotationsDto,
  })
  @ApiBadRequestResponse({ description: 'rfqId query parameter is required' })
  async getQuotationsForRfq(
    @CurrentUser('sub') userId: string,
    @Query('rfqId', ParseUUIDPipe) rfqId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedQuotationsDto> {
    return this.quotationService.getQuotationsForRfq(
      userId,
      rfqId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  @Get(':id')
  @Roles('SPONSOR', 'VENDOR', 'ADMIN')
  @ApiOperation({ summary: 'Get quotation details by ID' })
  @ApiResponse({
    status: 200,
    description: 'Quotation details with line items',
    type: QuotationDetailsResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Quotation not found' })
  @ApiForbiddenResponse({ description: 'Access denied to this quotation' })
  async getQuotationById(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<QuotationDetailsResponseDto> {
    return this.quotationService.getQuotationById(userId, id);
  }

  @Post(':id/accept')
  @Roles('SPONSOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a pending quotation (Sponsor only)' })
  @ApiResponse({
    status: 200,
    description: 'Quotation accepted',
    type: QuotationDetailsResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Quotation not found' })
  @ApiConflictResponse({ description: 'Quotation/RFQ already accepted or conflict' })
  @ApiBadRequestResponse({ description: 'Quotation is expired or not pending' })
  async acceptQuotation(
    @CurrentUser('sub') sponsorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<QuotationDetailsResponseDto> {
    return this.quotationService.acceptQuotation(sponsorId, id, req.ip, req.headers['user-agent']);
  }

  @Post(':id/reject')
  @Roles('SPONSOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a pending quotation with reason (Sponsor only)' })
  @ApiResponse({
    status: 200,
    description: 'Quotation rejected',
    type: QuotationDetailsResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Quotation not found' })
  @ApiBadRequestResponse({ description: 'Quotation is not pending' })
  async rejectQuotation(
    @CurrentUser('sub') sponsorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectQuotationDto,
    @Req() req: Request,
  ): Promise<QuotationDetailsResponseDto> {
    return this.quotationService.rejectQuotation(
      sponsorId,
      id,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }
}
