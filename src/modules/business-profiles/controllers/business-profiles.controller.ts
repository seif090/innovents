import { Controller, Get, Patch, Body, UseGuards, Req } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { BusinessProfilesService } from '../services/business-profiles.service';
import { OwnProfileDto } from '../dto/profile-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Profiles')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller()
export class BusinessProfilesController {
  constructor(private readonly profilesService: BusinessProfilesService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get profile of current authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'Current user profile details',
    type: OwnProfileDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async getProfile(@CurrentUser('sub') userId: string): Promise<OwnProfileDto> {
    return this.profilesService.getOwnProfile(userId);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update profile of current authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'Updated user profile details',
    type: OwnProfileDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async updateProfile(
    @CurrentUser('sub') userId: string,
    @Body() dto: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<OwnProfileDto> {
    return this.profilesService.updateOwnProfile(userId, dto, req.ip, req.headers['user-agent']);
  }

  @Get('business-profile')
  @ApiOperation({ summary: 'Alias for business profile of current user' })
  @ApiResponse({ status: 200, type: OwnProfileDto })
  async getBusinessProfile(@CurrentUser('sub') userId: string): Promise<OwnProfileDto> {
    return this.profilesService.getOwnProfile(userId);
  }

  @Patch('business-profile')
  @ApiOperation({ summary: 'Alias to update business profile of current user' })
  @ApiResponse({ status: 200, type: OwnProfileDto })
  async updateBusinessProfile(
    @CurrentUser('sub') userId: string,
    @Body() dto: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<OwnProfileDto> {
    return this.profilesService.updateOwnProfile(userId, dto, req.ip, req.headers['user-agent']);
  }
}
