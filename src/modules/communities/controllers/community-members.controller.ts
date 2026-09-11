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
  ApiConflictResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { CommunityMembersService } from '../services/community-members.service';
import { CommunityMemberQueryDto } from '../dto/community-member-query.dto';
import { CommunityMemberResponseDto } from '../dto/community-member-response.dto';
import { UpdateMemberRoleDto } from '../dto/update-member-role.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/services/token.service';

@ApiTags('Community Members')
@Controller('communities/:communityId/members')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommunityMembersController {
  constructor(private readonly membersService: CommunityMembersService) {}

  @Post('join')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Join a community (enforces capacity: max 20 for free communities)' })
  @ApiResponse({
    status: 200,
    description: 'Successfully joined',
    type: CommunityMemberResponseDto,
  })
  @ApiConflictResponse({ description: 'Capacity reached, already joined, or banned' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async join(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<CommunityMemberResponseDto> {
    return this.membersService.join(
      user.sub,
      communityId,
      user.roles,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('leave')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Leave a community (Owners cannot leave without transferring ownership)',
  })
  @ApiResponse({ status: 200, description: 'Successfully left' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async leave(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @CurrentUser('sub') userId: string,
    @Req() req: Request,
  ): Promise<{ success: boolean; message: string }> {
    return this.membersService.leave(userId, communityId, req.ip, req.headers['user-agent']);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'List members of a community' })
  @ApiResponse({ status: 200, description: 'Paginated members list' })
  async findAll(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Query() query: CommunityMemberQueryDto,
    @Req() req: Request,
  ): Promise<{
    data: CommunityMemberResponseDto[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const user = req.user;
    return this.membersService.findAll(communityId, query, user?.sub, user?.roles ?? []);
  }

  @Patch(':userId/role')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Designate member role, e.g. SPEAKER or MODERATOR (Owner or Admin)' })
  @ApiResponse({ status: 200, description: 'Role updated', type: CommunityMemberResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Only owner or admin can modify roles' })
  async updateRole(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateMemberRoleDto,
    @Req() req: Request,
  ): Promise<CommunityMemberResponseDto> {
    return this.membersService.updateRole(
      communityId,
      targetUserId,
      user.sub,
      user.roles,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post(':userId/ban')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Ban a member from the community (Moderator, Owner, or Admin)' })
  @ApiResponse({ status: 200, description: 'Member banned' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Insufficient privileges or attempted to ban owner' })
  async banMember(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<{ success: boolean; message: string }> {
    return this.membersService.banMember(
      communityId,
      targetUserId,
      user.sub,
      user.roles,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post(':userId/unban')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Unban a member from the community (Moderator, Owner, or Admin)' })
  @ApiResponse({ status: 200, description: 'Member unbanned' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Insufficient privileges' })
  async unbanMember(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<{ success: boolean; message: string }> {
    return this.membersService.unbanMember(
      communityId,
      targetUserId,
      user.sub,
      user.roles,
      req.ip,
      req.headers['user-agent'],
    );
  }
}
