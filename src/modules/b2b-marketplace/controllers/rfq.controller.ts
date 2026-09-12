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
} from '@nestjs/swagger';
import { Request } from 'express';
import { RfqService } from '../services/rfq.service';
import { CreateRfqDto } from '../dto/create-rfq.dto';
import { RfqQueryDto } from '../dto/rfq-query.dto';
import { CreateRfqClarificationDto } from '../dto/rfq-clarification.dto';
import { CancelRfqDto, RejectRfqDto } from '../dto/rfq-action.dto';
import { RfqDetailsResponseDto, PaginatedRfqsDto } from '../dto/rfq-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('B2B RFQs')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('b2b/rfqs')
export class RfqController {
  constructor(private readonly rfqService: RfqService) {}

  @Post()
  @Roles('SPONSOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create and send a new RFQ to an active vendor (Sponsor only)' })
  @ApiResponse({
    status: 201,
    description: 'RFQ successfully created and sent',
    type: RfqDetailsResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Requires active SPONSOR role' })
  @ApiBadRequestResponse({ description: 'Validation failed or inactive target vendor' })
  async createRfq(
    @CurrentUser('sub') sponsorId: string,
    @Body() dto: CreateRfqDto,
    @Query('draft') draft?: string,
    @Req() req?: Request,
  ): Promise<RfqDetailsResponseDto> {
    const asDraft = draft === 'true' || draft === '1';
    return this.rfqService.createRfq(
      sponsorId,
      dto,
      { asDraft },
      req?.ip,
      req?.headers['user-agent'],
    );
  }

  @Post(':id/send')
  @Roles('SPONSOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a previously saved DRAFT RFQ to target vendor' })
  @ApiResponse({
    status: 200,
    description: 'RFQ sent',
    type: RfqDetailsResponseDto,
  })
  @ApiNotFoundResponse({ description: 'RFQ not found' })
  @ApiBadRequestResponse({ description: 'RFQ is not in DRAFT status or expired' })
  async sendRfq(
    @CurrentUser('sub') sponsorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<RfqDetailsResponseDto> {
    return this.rfqService.sendRfq(sponsorId, id, req.ip, req.headers['user-agent']);
  }

  @Get()
  @Roles('SPONSOR', 'VENDOR', 'ADMIN')
  @ApiOperation({ summary: 'List RFQs associated with authenticated user (sent or received)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated RFQ listing',
    type: PaginatedRfqsDto,
  })
  async getMyRfqs(
    @CurrentUser('sub') userId: string,
    @Query() query: RfqQueryDto,
  ): Promise<PaginatedRfqsDto> {
    return this.rfqService.getMyRfqs(userId, query);
  }

  @Get(':id')
  @Roles('SPONSOR', 'VENDOR', 'ADMIN')
  @ApiOperation({ summary: 'Get RFQ details with items and clarifications' })
  @ApiResponse({
    status: 200,
    description: 'Detailed RFQ view',
    type: RfqDetailsResponseDto,
  })
  @ApiNotFoundResponse({ description: 'RFQ not found' })
  @ApiForbiddenResponse({ description: 'Access denied to this RFQ' })
  async getRfqById(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<RfqDetailsResponseDto> {
    return this.rfqService.getRfqById(userId, id, req.ip, req.headers['user-agent']);
  }

  @Post(':id/clarifications')
  @Roles('SPONSOR', 'VENDOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Post clarification message or inquiry on an RFQ' })
  @ApiResponse({
    status: 201,
    description: 'Clarification posted',
    type: RfqDetailsResponseDto,
  })
  @ApiNotFoundResponse({ description: 'RFQ not found' })
  @ApiBadRequestResponse({ description: 'RFQ is terminal or expired' })
  async requestClarification(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRfqClarificationDto,
    @Req() req: Request,
  ): Promise<RfqDetailsResponseDto> {
    return this.rfqService.requestClarification(userId, id, dto, req.ip, req.headers['user-agent']);
  }

  @Post(':id/cancel')
  @Roles('SPONSOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an active RFQ (Sponsor only)' })
  @ApiResponse({
    status: 200,
    description: 'RFQ cancelled',
    type: RfqDetailsResponseDto,
  })
  @ApiNotFoundResponse({ description: 'RFQ not found' })
  @ApiBadRequestResponse({ description: 'RFQ is already terminal' })
  async cancelRfq(
    @CurrentUser('sub') sponsorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelRfqDto,
    @Req() req: Request,
  ): Promise<RfqDetailsResponseDto> {
    return this.rfqService.cancelRfq(sponsorId, id, dto, req.ip, req.headers['user-agent']);
  }

  @Post(':id/reject')
  @Roles('VENDOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject an RFQ with reason (Vendor only)' })
  @ApiResponse({
    status: 200,
    description: 'RFQ rejected',
    type: RfqDetailsResponseDto,
  })
  @ApiNotFoundResponse({ description: 'RFQ not found' })
  @ApiBadRequestResponse({ description: 'RFQ is already terminal' })
  async rejectRfq(
    @CurrentUser('sub') vendorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectRfqDto,
    @Req() req: Request,
  ): Promise<RfqDetailsResponseDto> {
    return this.rfqService.rejectRfq(vendorId, id, dto, req.ip, req.headers['user-agent']);
  }
}
