import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiNotFoundResponse } from '@nestjs/swagger';
import { BusinessProfilesService } from '../services/business-profiles.service';
import { PublicBusinessProfileDto, PublicUserProfileDto } from '../dto/profile-response.dto';

@ApiTags('Public Profiles')
@Controller('public')
export class PublicProfilesController {
  constructor(private readonly profilesService: BusinessProfilesService) {}

  @Get('businesses/:id')
  @ApiOperation({ summary: 'Get public profile of an active, approved business' })
  @ApiResponse({
    status: 200,
    description: 'Sanitized public business profile',
    type: PublicBusinessProfileDto,
  })
  @ApiNotFoundResponse({ description: 'Business not found or not active' })
  async getPublicBusiness(
    @Param('id', ParseUUIDPipe) businessId: string,
  ): Promise<PublicBusinessProfileDto> {
    return this.profilesService.getPublicBusiness(businessId);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get public profile of an active user' })
  @ApiResponse({
    status: 200,
    description: 'Sanitized public user profile',
    type: PublicUserProfileDto,
  })
  @ApiNotFoundResponse({ description: 'User not found or not active' })
  async getPublicUser(@Param('id', ParseUUIDPipe) userId: string): Promise<PublicUserProfileDto> {
    return this.profilesService.getPublicUser(userId);
  }
}
