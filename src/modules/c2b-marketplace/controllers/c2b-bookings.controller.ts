import {
  Controller,
  Get,
  Post,
  Patch,
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
import { C2bBookingsService } from '../services/c2b-bookings.service';
import { CreateC2bBookingDto } from '../dto/create-c2b-booking.dto';
import { UpdateC2bBookingStatusDto } from '../dto/update-c2b-booking-status.dto';
import { C2bBookingResponseDto, PaginatedC2bBookingsDto } from '../dto/c2b-booking-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('C2B Bookings & Requests')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller()
export class C2bBookingsController {
  constructor(private readonly bookingsService: C2bBookingsService) {}

  // -------------------------------------------------------------
  // Attendee Endpoints (/api/v1/c2b/bookings)
  // -------------------------------------------------------------

  @Post('c2b/bookings')
  @Roles('ATTENDEE')
  @Permissions('create:c2b_booking')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new C2B booking / contact request (Attendee)' })
  @ApiResponse({ status: 201, type: C2bBookingResponseDto })
  async createBooking(
    @CurrentUser('sub') attendeeId: string,
    @Body() dto: CreateC2bBookingDto,
    @Req() req: Request,
  ): Promise<C2bBookingResponseDto> {
    return this.bookingsService.createBooking(
      attendeeId,
      dto,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }

  @Get('c2b/bookings')
  @Roles('ATTENDEE')
  @Permissions('create:c2b_booking')
  @ApiOperation({ summary: 'List attendee own booking requests' })
  @ApiResponse({ status: 200, type: PaginatedC2bBookingsDto })
  async getMyBookings(
    @CurrentUser('sub') attendeeId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<PaginatedC2bBookingsDto> {
    const p = page ? parseInt(page, 10) : 1;
    const ps = pageSize ? parseInt(pageSize, 10) : 20;
    return this.bookingsService.getAttendeeBookings(attendeeId, p, ps);
  }

  @Get('c2b/bookings/:id')
  @Roles('ATTENDEE', 'PROVIDER', 'ADMIN')
  @ApiOperation({ summary: 'Get booking request details by ID' })
  @ApiResponse({ status: 200, type: C2bBookingResponseDto })
  async getBookingById(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<C2bBookingResponseDto> {
    return this.bookingsService.getBookingById(userId, id);
  }

  @Patch('c2b/bookings/:id/cancel')
  @Roles('ATTENDEE')
  @Permissions('create:c2b_booking')
  @ApiOperation({ summary: 'Cancel own booking request (Attendee)' })
  @ApiResponse({ status: 200, type: C2bBookingResponseDto })
  async cancelBooking(
    @CurrentUser('sub') attendeeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<C2bBookingResponseDto> {
    return this.bookingsService.cancelBooking(
      attendeeId,
      id,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }

  // -------------------------------------------------------------
  // Provider Endpoints (/api/v1/provider/bookings)
  // -------------------------------------------------------------

  @Get('provider/bookings')
  @Roles('PROVIDER')
  @Permissions('manage:c2b_booking')
  @ApiOperation({ summary: 'List received booking requests for provider services' })
  @ApiResponse({ status: 200, type: PaginatedC2bBookingsDto })
  async getProviderBookings(
    @CurrentUser('sub') providerId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<PaginatedC2bBookingsDto> {
    const p = page ? parseInt(page, 10) : 1;
    const ps = pageSize ? parseInt(pageSize, 10) : 20;
    return this.bookingsService.getProviderBookings(providerId, p, ps);
  }

  @Patch('provider/bookings/:id/status')
  @Roles('PROVIDER')
  @Permissions('manage:c2b_booking')
  @ApiOperation({ summary: 'Update booking request status (CONFIRMED, REJECTED, COMPLETED)' })
  @ApiResponse({ status: 200, type: C2bBookingResponseDto })
  async updateBookingStatus(
    @CurrentUser('sub') providerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateC2bBookingStatusDto,
    @Req() req: Request,
  ): Promise<C2bBookingResponseDto> {
    return this.bookingsService.updateBookingStatus(
      providerId,
      id,
      dto,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }
}
