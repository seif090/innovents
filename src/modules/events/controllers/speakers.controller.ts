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
import { SpeakersService } from '../services/speakers.service';
import {
  CreateSpeakerDto,
  UpdateSpeakerDto,
  SpeakerResponseDto,
} from '../dto/speaker-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/services/token.service';

@ApiTags('Speakers')
@Controller('events/:eventId/speakers')
@UseGuards(JwtAuthGuard)
export class SpeakersController {
  constructor(private readonly speakersService: SpeakersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a speaker for an event (Authorized managers only)' })
  @ApiResponse({ status: 201, description: 'Speaker created', type: SpeakerResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized to manage this event' })
  async create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles: string[],
    @Body() dto: CreateSpeakerDto,
    @Req() req: Request,
  ): Promise<SpeakerResponseDto> {
    return this.speakersService.create(
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
  @ApiOperation({ summary: 'List all speakers for an event' })
  @ApiResponse({ status: 200, description: 'List of speakers', type: [SpeakerResponseDto] })
  async findAll(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user?: JwtPayload,
  ): Promise<SpeakerResponseDto[]> {
    return this.speakersService.findAll(eventId, user?.sub, user?.roles || []);
  }

  @Public()
  @Get(':speakerId')
  @ApiOperation({ summary: 'Get speaker details by ID' })
  @ApiResponse({ status: 200, description: 'Speaker details', type: SpeakerResponseDto })
  async findById(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('speakerId', ParseUUIDPipe) speakerId: string,
    @CurrentUser() user?: JwtPayload,
  ): Promise<SpeakerResponseDto> {
    return this.speakersService.findById(eventId, speakerId, user?.sub, user?.roles || []);
  }

  @Patch(':speakerId')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update a speaker profile (Authorized managers only)' })
  @ApiResponse({ status: 200, description: 'Updated speaker details', type: SpeakerResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized to manage this event' })
  async update(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('speakerId', ParseUUIDPipe) speakerId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles: string[],
    @Body() dto: UpdateSpeakerDto,
    @Req() req: Request,
  ): Promise<SpeakerResponseDto> {
    return this.speakersService.update(
      eventId,
      speakerId,
      userId,
      roles || [],
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Delete(':speakerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Delete a speaker (Authorized managers only, blocked if assigned to sessions)',
  })
  @ApiResponse({ status: 204, description: 'Speaker deleted' })
  @ApiConflictResponse({ description: 'Cannot delete speaker assigned to existing sessions' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized to manage this event' })
  async delete(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('speakerId', ParseUUIDPipe) speakerId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles: string[],
    @Req() req: Request,
  ): Promise<void> {
    return this.speakersService.delete(
      eventId,
      speakerId,
      userId,
      roles || [],
      req.ip,
      req.headers['user-agent'],
    );
  }
}
