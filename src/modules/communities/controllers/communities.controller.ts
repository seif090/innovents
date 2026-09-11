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
import { CommunitiesService } from '../services/communities.service';
import { CreateCommunityDto } from '../dto/create-community.dto';
import { UpdateCommunityDto } from '../dto/update-community.dto';
import { CommunityQueryDto } from '../dto/community-query.dto';
import { CommunityResponseDto } from '../dto/community-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/services/token.service';

@ApiTags('Communities')
@Controller('communities')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommunitiesController {
  constructor(private readonly communitiesService: CommunitiesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Create a new community (Free: any active attendee; Sponsored: SPONSOR or ADMIN)',
  })
  @ApiResponse({
    status: 201,
    description: 'Community created successfully',
    type: CommunityResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions or inactive account' })
  @ApiConflictResponse({ description: 'Community limit reached' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCommunityDto,
    @Req() req: Request,
  ): Promise<CommunityResponseDto> {
    return this.communitiesService.create(
      user.sub,
      user.roles,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Discover and filter communities with pagination (Public/Protected)' })
  @ApiResponse({ status: 200, description: 'Paginated list of communities' })
  async findAll(
    @Query() query: CommunityQueryDto,
    @Req() req: Request,
  ): Promise<{
    data: CommunityResponseDto[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const user = req.user;
    return this.communitiesService.findAll(query, user?.sub, user?.roles ?? []);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get community by ID (anti-enumeration for private/suspended)' })
  @ApiResponse({ status: 200, description: 'Community details', type: CommunityResponseDto })
  @ApiNotFoundResponse({ description: 'Community not found or access denied' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<CommunityResponseDto> {
    const user = req.user;
    return this.communitiesService.findOne(id, user?.sub, user?.roles ?? []);
  }

  @Patch(':id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update community details (Owner or Admin)' })
  @ApiResponse({ status: 200, description: 'Community updated', type: CommunityResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Only community owner or admin can update' })
  @ApiNotFoundResponse({ description: 'Community not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateCommunityDto,
    @Req() req: Request,
  ): Promise<CommunityResponseDto> {
    return this.communitiesService.update(
      id,
      user.sub,
      user.roles,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Delete(':id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Archive/Delete a community (Owner or Admin)' })
  @ApiResponse({ status: 200, description: 'Community deleted' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Only community owner or admin can delete' })
  @ApiNotFoundResponse({ description: 'Community not found' })
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<{ success: boolean; message: string }> {
    return this.communitiesService.delete(
      id,
      user.sub,
      user.roles,
      req.ip,
      req.headers['user-agent'],
    );
  }
}
