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
  ApiConflictResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { SessionsService } from '../services/sessions.service';
import { CreateSessionDto } from '../dto/create-session.dto';
import { UpdateSessionDto } from '../dto/update-session.dto';
import { ReorderSessionsDto } from '../dto/reorder-sessions.dto';
import { SessionQueryDto } from '../dto/session-query.dto';
import { SessionResponseDto } from '../dto/session-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/services/token.service';

@ApiTags('Agenda & Sessions')
@Controller('events/:eventId/sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a session inside an event (Authorized managers only)' })
  @ApiResponse({ status: 201, description: 'Session created', type: SessionResponseDto })
  @ApiConflictResponse({ description: 'Venue time overlap conflict' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized to manage this event' })
  async create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles: string[],
    @Body() dto: CreateSessionDto,
    @Req() req: Request,
  ): Promise<SessionResponseDto> {
    return this.sessionsService.create(
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
  @ApiOperation({ summary: 'List all sessions in event agenda (filterable by date or venue)' })
  @ApiResponse({ status: 200, description: 'List of sessions', type: [SessionResponseDto] })
  async findAll(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() query: SessionQueryDto,
    @CurrentUser() user?: JwtPayload,
  ): Promise<SessionResponseDto[]> {
    return this.sessionsService.findAll(eventId, query, user?.sub, user?.roles || []);
  }

  @Patch('reorder')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Reorder timeline of sessions (Authorized managers only)' })
  @ApiResponse({ status: 200, description: 'Sessions reordered successfully' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized to manage this event' })
  async reorder(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles: string[],
    @Body() dto: ReorderSessionsDto,
    @Req() req: Request,
  ): Promise<{ success: boolean; message: string }> {
    await this.sessionsService.reorder(
      eventId,
      userId,
      roles || [],
      dto,
      req.ip,
      req.headers['user-agent'],
    );
    return { success: true, message: 'Sessions reordered successfully' };
  }

  @Public()
  @Get(':sessionId')
  @ApiOperation({ summary: 'Get single session details by ID' })
  @ApiResponse({ status: 200, description: 'Session details', type: SessionResponseDto })
  async findById(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user?: JwtPayload,
  ): Promise<SessionResponseDto> {
    return this.sessionsService.findById(eventId, sessionId, user?.sub, user?.roles || []);
  }

  @Patch(':sessionId')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update session details, timing, or assignments (Authorized managers only)',
  })
  @ApiResponse({ status: 200, description: 'Updated session details', type: SessionResponseDto })
  @ApiConflictResponse({ description: 'Venue time overlap conflict' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized to manage this event' })
  async update(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles: string[],
    @Body() dto: UpdateSessionDto,
    @Req() req: Request,
  ): Promise<SessionResponseDto> {
    return this.sessionsService.update(
      eventId,
      sessionId,
      userId,
      roles || [],
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Delete(':sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Soft delete a session (Authorized managers only)' })
  @ApiResponse({ status: 204, description: 'Session deleted' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized to manage this event' })
  async delete(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles: string[],
    @Req() req: Request,
  ): Promise<void> {
    return this.sessionsService.delete(
      eventId,
      sessionId,
      userId,
      roles || [],
      req.ip,
      req.headers['user-agent'],
    );
  }
}
