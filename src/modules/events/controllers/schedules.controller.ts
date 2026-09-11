import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
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
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { AttendeeScheduleService } from '../services/attendee-schedule.service';
import {
  ScheduleItemResponseDto,
  SaveSessionNoteDto,
  SessionNoteResponseDto,
} from '../dto/schedule-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Attendee Schedules')
@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class SchedulesController {
  constructor(private readonly scheduleService: AttendeeScheduleService) {}

  @Post('events/:eventId/sessions/:sessionId/schedule')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a session to personal schedule and enqueue 15m reminder' })
  @ApiResponse({
    status: 201,
    description: 'Session added to schedule',
    type: ScheduleItemResponseDto,
  })
  @ApiConflictResponse({ description: 'Session is cancelled or event is unpublished/cancelled' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async addSession(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser('sub') userId: string,
  ): Promise<ScheduleItemResponseDto> {
    return this.scheduleService.addSession(userId, eventId, sessionId);
  }

  @Delete('events/:eventId/sessions/:sessionId/schedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a session from personal schedule' })
  @ApiResponse({ status: 200, description: 'Session removed from schedule' })
  @ApiNotFoundResponse({ description: 'Session was not in schedule' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async removeSession(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser('sub') userId: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.scheduleService.removeSession(userId, eventId, sessionId);
  }

  @Get('users/me/schedule')
  @ApiOperation({ summary: 'List all sessions in current attendee personal schedule' })
  @ApiResponse({
    status: 200,
    description: 'List of scheduled sessions',
    type: [ScheduleItemResponseDto],
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async getMySchedule(@CurrentUser('sub') userId: string): Promise<ScheduleItemResponseDto[]> {
    return this.scheduleService.getSchedule(userId);
  }

  @Put('events/:eventId/sessions/:sessionId/note')
  @ApiOperation({ summary: 'Save or update private personal note on a session' })
  @ApiResponse({ status: 200, description: 'Note saved', type: SessionNoteResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async saveNote(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: SaveSessionNoteDto,
  ): Promise<SessionNoteResponseDto> {
    return this.scheduleService.saveNote(userId, eventId, sessionId, dto.note);
  }

  @Get('events/:eventId/sessions/:sessionId/note')
  @ApiOperation({ summary: 'Get private personal note on a session' })
  @ApiResponse({ status: 200, description: 'Session note', type: SessionNoteResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async getNote(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser('sub') userId: string,
  ): Promise<SessionNoteResponseDto | null> {
    return this.scheduleService.getNote(userId, eventId, sessionId);
  }
}
