import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  Req,
  HttpCode,
  HttpStatus,
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
import { OrganizerInvitationsService } from '../services/organizer-invitations.service';
import { CreateInvitationDto } from '../dto/create-invitation.dto';
import { AcceptInvitationDto } from '../dto/accept-invitation.dto';
import {
  InvitationDetailsDto,
  CreatedInvitationResponseDto,
  AcceptedInvitationResponseDto,
} from '../dto/invitation-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Organizer Invitations')
@Controller()
export class OrganizerInvitationsController {
  constructor(private readonly invitationsService: OrganizerInvitationsService) {}

  @Post('events/:eventId/organizer-invitations')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Invite a new organizer to an event (Event Owner or Admin)' })
  @ApiResponse({
    status: 201,
    description: 'Invitation created and dispatched',
    type: CreatedInvitationResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Event not found' })
  @ApiForbiddenResponse({ description: 'Only event owner or admin can invite organizers' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async createInvitation(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles: string[],
    @Body() dto: CreateInvitationDto,
    @Req() req: Request,
  ): Promise<CreatedInvitationResponseDto> {
    return this.invitationsService.createInvitation(
      eventId,
      userId,
      roles || [],
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Get('events/:eventId/organizer-invitations')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List all organizer invitations for an event (Event Owner or Admin)' })
  @ApiResponse({
    status: 200,
    description: 'List of event organizer invitations',
    type: [InvitationDetailsDto],
  })
  @ApiNotFoundResponse({ description: 'Event not found' })
  @ApiForbiddenResponse({ description: 'Only event owner or admin can view invitations' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async listInvitations(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles: string[],
  ): Promise<InvitationDetailsDto[]> {
    return this.invitationsService.listInvitations(eventId, userId, roles || []);
  }

  @Post('organizer-invitations/:id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Revoke an organizer invitation (Event Owner or Admin)' })
  @ApiResponse({
    status: 200,
    description: 'Invitation revoked successfully',
    type: InvitationDetailsDto,
  })
  @ApiNotFoundResponse({ description: 'Invitation not found' })
  @ApiForbiddenResponse({ description: 'Only event owner or admin can revoke invitation' })
  @ApiBadRequestResponse({ description: 'Invitation already accepted or revoked' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async revokeInvitation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles: string[],
    @Req() req: Request,
  ): Promise<InvitationDetailsDto> {
    return this.invitationsService.revokeInvitation(
      id,
      userId,
      roles || [],
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('organizer-invitations/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an organizer invitation using the secure one-time token' })
  @ApiResponse({
    status: 200,
    description: 'Invitation accepted and account activated/linked',
    type: AcceptedInvitationResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid, expired, or already accepted token' })
  @ApiForbiddenResponse({ description: 'Account is suspended or deactivated' })
  async acceptInvitation(
    @Body() dto: AcceptInvitationDto,
    @Req() req: Request,
  ): Promise<AcceptedInvitationResponseDto> {
    return this.invitationsService.acceptInvitation(dto, req.ip, req.headers['user-agent']);
  }
}
