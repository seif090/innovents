import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
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
  ApiConflictResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { VenuesService } from '../services/venues.service';
import { CreateVenueDto, UpdateVenueDto, VenueResponseDto } from '../dto/venue-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/services/token.service';

@ApiTags('Venues')
@Controller('events/:eventId/venues')
@UseGuards(JwtAuthGuard)
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a venue/hall for an event (Authorized managers only)' })
  @ApiResponse({ status: 201, description: 'Venue created', type: VenueResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized to manage this event' })
  async create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles: string[],
    @Body() dto: CreateVenueDto,
    @Req() req: Request,
  ): Promise<VenueResponseDto> {
    return this.venuesService.create(
      eventId,
      userId,
      roles || [],
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all venues/halls for an event' })
  @ApiResponse({ status: 200, description: 'List of venues', type: [VenueResponseDto] })
  async findAll(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user?: JwtPayload,
  ): Promise<VenueResponseDto[]> {
    return this.venuesService.findAll(eventId, user?.sub, user?.roles || []);
  }

  @Public()
  @Get(':venueId')
  @ApiOperation({ summary: 'Get venue details by ID' })
  @ApiResponse({ status: 200, description: 'Venue details', type: VenueResponseDto })
  async findById(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('venueId', ParseUUIDPipe) venueId: string,
    @CurrentUser() user?: JwtPayload,
  ): Promise<VenueResponseDto> {
    return this.venuesService.findById(eventId, venueId, user?.sub, user?.roles || []);
  }

  @Patch(':venueId')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update a venue/hall (Authorized managers only)' })
  @ApiResponse({ status: 200, description: 'Updated venue details', type: VenueResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized to manage this event' })
  async update(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('venueId', ParseUUIDPipe) venueId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles: string[],
    @Body() dto: UpdateVenueDto,
    @Req() req: Request,
  ): Promise<VenueResponseDto> {
    return this.venuesService.update(
      eventId,
      venueId,
      userId,
      roles || [],
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Delete(':venueId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Delete a venue (Authorized managers only, blocked if active sessions exist)',
  })
  @ApiResponse({ status: 204, description: 'Venue deleted' })
  @ApiConflictResponse({
    description: 'Cannot delete venue while active sessions are scheduled in it',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized to manage this event' })
  async delete(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('venueId', ParseUUIDPipe) venueId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles: string[],
    @Req() req: Request,
  ): Promise<void> {
    return this.venuesService.delete(
      eventId,
      venueId,
      userId,
      roles || [],
      req.ip,
      req.headers['user-agent'],
    );
  }
}
