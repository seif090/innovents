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
  ApiConflictResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { EventsService } from '../services/events.service';
import { CreateEventDto } from '../dto/create-event.dto';
import { UpdateEventDto } from '../dto/update-event.dto';
import { EventQueryDto } from '../dto/event-query.dto';
import { EventResponseDto, PaginatedEventsResponseDto } from '../dto/event-response.dto';
import { AssignOrganizerDto, OrganizerResponseDto } from '../dto/assign-organizer.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Role } from '../../../common/enums/role.enum';
import { JwtPayload } from '../../auth/services/token.service';

@ApiTags('Events')
@Controller('events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @Roles(Role.EVENT_OWNER, Role.ORGANIZER, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a new event in DRAFT status (Event Owner or Admin)' })
  @ApiResponse({ status: 201, description: 'Event created', type: EventResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Requires EVENT_OWNER or ADMIN role' })
  async create(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateEventDto,
    @Req() req: Request,
  ): Promise<EventResponseDto> {
    return this.eventsService.create(userId, dto, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Public event discovery and search with bounded pagination' })
  @ApiResponse({
    status: 200,
    description: 'Paginated event listings',
    type: PaginatedEventsResponseDto,
  })
  async findAll(
    @Query() query: EventQueryDto,
    @CurrentUser() user?: JwtPayload,
  ): Promise<PaginatedEventsResponseDto> {
    return this.eventsService.findAll(query, user?.sub, user?.roles || []);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Retrieve single event details by ID' })
  @ApiResponse({ status: 200, description: 'Event profile details', type: EventResponseDto })
  @ApiNotFoundResponse({ description: 'Event not found or access restricted' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: JwtPayload,
  ): Promise<EventResponseDto> {
    return this.eventsService.findById(id, user?.sub, user?.roles || []);
  }

  @Patch(':id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update event metadata, capacity, or dates (Authorized managers only)' })
  @ApiResponse({ status: 200, description: 'Updated event profile', type: EventResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized to manage this event' })
  @ApiConflictResponse({ description: 'Capacity reduction or session boundary violation' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles: string[],
    @Body() dto: UpdateEventDto,
    @Req() req: Request,
  ): Promise<EventResponseDto> {
    return this.eventsService.update(
      id,
      userId,
      roles || [],
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Publish event to public catalog (Authorized managers only)' })
  @ApiResponse({ status: 200, description: 'Event published', type: EventResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized to manage this event' })
  @ApiConflictResponse({ description: 'Already published or illegal status transition' })
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles: string[],
    @Req() req: Request,
  ): Promise<EventResponseDto> {
    return this.eventsService.publish(id, userId, roles || [], req.ip, req.headers['user-agent']);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Cancel an event (Authorized managers only)' })
  @ApiResponse({ status: 200, description: 'Event cancelled', type: EventResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized to manage this event' })
  @ApiConflictResponse({ description: 'Already cancelled or completed' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles: string[],
    @Req() req: Request,
  ): Promise<EventResponseDto> {
    return this.eventsService.cancel(id, userId, roles || [], req.ip, req.headers['user-agent']);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Soft delete an event (Authorized managers only)' })
  @ApiResponse({ status: 204, description: 'Event soft deleted' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized to manage this event' })
  async softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles: string[],
    @Req() req: Request,
  ): Promise<void> {
    return this.eventsService.softDelete(
      id,
      userId,
      roles || [],
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post(':id/organizers')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Assign an active ORGANIZER to an event (Event Owner or Admin)' })
  @ApiResponse({ status: 201, description: 'Organizer assigned', type: OrganizerResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized to manage this event' })
  async assignOrganizer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') currentUserId: string,
    @CurrentUser('roles') roles: string[],
    @Body() dto: AssignOrganizerDto,
    @Req() req: Request,
  ): Promise<OrganizerResponseDto> {
    return this.eventsService.assignOrganizer(
      id,
      currentUserId,
      roles || [],
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Get(':id/organizers')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List assigned organizers for an event (Authorized managers only)' })
  @ApiResponse({
    status: 200,
    description: 'List of assigned organizers',
    type: [OrganizerResponseDto],
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized to manage this event' })
  async getOrganizers(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') currentUserId: string,
    @CurrentUser('roles') roles: string[],
  ): Promise<OrganizerResponseDto[]> {
    return this.eventsService.getOrganizers(id, currentUserId, roles || []);
  }

  @Delete(':id/organizers/:organizerUserId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Remove an assigned organizer from an event (Authorized managers only)',
  })
  @ApiResponse({ status: 204, description: 'Organizer removed' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized to manage this event' })
  async removeOrganizer(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('organizerUserId', ParseUUIDPipe) organizerUserId: string,
    @CurrentUser('sub') currentUserId: string,
    @CurrentUser('roles') roles: string[],
    @Req() req: Request,
  ): Promise<void> {
    return this.eventsService.removeOrganizer(
      id,
      currentUserId,
      roles || [],
      organizerUserId,
      req.ip,
      req.headers['user-agent'],
    );
  }
}
