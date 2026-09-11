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
import { CommunityMeetupsService } from '../services/community-meetups.service';
import { CreateMeetupDto } from '../dto/create-meetup.dto';
import { UpdateMeetupDto } from '../dto/update-meetup.dto';
import { MeetupQueryDto } from '../dto/meetup-query.dto';
import { MeetupResponseDto } from '../dto/meetup-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/services/token.service';

@ApiTags('Community Meetups')
@Controller('communities/:communityId/meetups')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommunityMeetupsController {
  constructor(private readonly meetupsService: CommunityMeetupsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Create a Mini Event / Meetup inside a community (Active members only)',
  })
  @ApiResponse({ status: 201, description: 'Meetup created', type: MeetupResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Must be an active member of the community' })
  async create(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @CurrentUser('sub') creatorId: string,
    @Body() dto: CreateMeetupDto,
    @Req() req: Request,
  ): Promise<MeetupResponseDto> {
    return this.meetupsService.create(
      communityId,
      creatorId,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'List meetups in a community' })
  @ApiResponse({ status: 200, description: 'Paginated list of meetups' })
  async findAll(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Query() query: MeetupQueryDto,
    @Req() req: Request,
  ): Promise<{
    data: MeetupResponseDto[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const user = req.user;
    return this.meetupsService.findAll(communityId, query, user?.sub, user?.roles ?? []);
  }

  @Get(':meetupId')
  @Public()
  @ApiOperation({ summary: 'Get meetup by ID' })
  @ApiResponse({ status: 200, description: 'Meetup details', type: MeetupResponseDto })
  @ApiNotFoundResponse({ description: 'Meetup not found' })
  async findOne(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('meetupId', ParseUUIDPipe) meetupId: string,
    @Req() req: Request,
  ): Promise<MeetupResponseDto> {
    const user = req.user;
    return this.meetupsService.findOne(communityId, meetupId, user?.sub, user?.roles ?? []);
  }

  @Post(':meetupId/join')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Join a meetup (concurrency-safe participantLimit enforcement)' })
  @ApiResponse({ status: 200, description: 'Successfully joined meetup', type: MeetupResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiConflictResponse({ description: 'Capacity reached or already participating' })
  async join(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('meetupId', ParseUUIDPipe) meetupId: string,
    @CurrentUser('sub') userId: string,
    @Req() req: Request,
  ): Promise<MeetupResponseDto> {
    return this.meetupsService.join(
      communityId,
      meetupId,
      userId,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post(':meetupId/leave')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Leave a meetup (Creator cannot leave without cancelling)' })
  @ApiResponse({ status: 200, description: 'Successfully left meetup' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async leave(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('meetupId', ParseUUIDPipe) meetupId: string,
    @CurrentUser('sub') userId: string,
    @Req() req: Request,
  ): Promise<{ success: boolean; message: string }> {
    return this.meetupsService.leave(
      communityId,
      meetupId,
      userId,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Patch(':meetupId')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update meetup details (Creator or Admin)' })
  @ApiResponse({ status: 200, description: 'Meetup updated', type: MeetupResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Only creator or admin can update' })
  async update(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('meetupId', ParseUUIDPipe) meetupId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateMeetupDto,
    @Req() req: Request,
  ): Promise<MeetupResponseDto> {
    return this.meetupsService.update(
      communityId,
      meetupId,
      user.sub,
      user.roles,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post(':meetupId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Cancel a meetup (Creator or Admin)' })
  @ApiResponse({ status: 200, description: 'Meetup cancelled' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Only creator or admin can cancel' })
  async cancel(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('meetupId', ParseUUIDPipe) meetupId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<{ success: boolean; message: string }> {
    return this.meetupsService.cancel(
      communityId,
      meetupId,
      user.sub,
      user.roles,
      req.ip,
      req.headers['user-agent'],
    );
  }
}
