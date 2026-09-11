import {
  Controller,
  Get,
  Post,
  Delete,
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
  ApiConflictResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { EventRegistrationService } from '../services/event-registration.service';
import {
  RegistrationResponseDto,
  PaginatedRegistrationsResponseDto,
} from '../dto/registration-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Event Registrations')
@Controller('events/:eventId')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class RegistrationsController {
  constructor(private readonly registrationService: EventRegistrationService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register authenticated attendee for an event' })
  @ApiResponse({
    status: 201,
    description: 'Registration successful',
    type: RegistrationResponseDto,
  })
  @ApiConflictResponse({ description: 'Event full, already registered, or event cancelled' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async register(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser('sub') userId: string,
    @Req() req: Request,
  ): Promise<RegistrationResponseDto> {
    return this.registrationService.register(eventId, userId, req.ip, req.headers['user-agent']);
  }

  @Delete('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel event registration for authenticated attendee' })
  @ApiResponse({ status: 200, description: 'Registration cancelled' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async cancel(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser('sub') userId: string,
    @Req() req: Request,
  ): Promise<{ success: boolean; message: string }> {
    return this.registrationService.cancel(eventId, userId, req.ip, req.headers['user-agent']);
  }

  @Get('registrations')
  @ApiOperation({ summary: 'List attendee registrations for an event (Authorized managers only)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated registrations list',
    type: PaginatedRegistrationsResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Not authorized to manage this event' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async getRegistrations(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles: string[],
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ): Promise<PaginatedRegistrationsResponseDto> {
    return this.registrationService.getRegistrations(eventId, userId, roles || [], page, pageSize);
  }
}
