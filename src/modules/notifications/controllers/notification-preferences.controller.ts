import { Controller, Get, Put, Body, UseGuards, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { NotificationPreferenceService } from '../services/notification-preference.service';
import { UpdatePreferencesDto } from '../dto/update-preference.dto';
import { PreferenceResponseItemDto } from '../dto/preference-response.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications/preferences')
export class NotificationPreferencesController {
  constructor(private readonly preferenceService: NotificationPreferenceService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user notification preferences across all channels' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: [PreferenceResponseItemDto],
    description: 'Effective notification preferences with configurability flags',
  })
  async getPreferences(@CurrentUser('sub') userId: string): Promise<PreferenceResponseItemDto[]> {
    return this.preferenceService.getUserPreferences(userId);
  }

  @Put()
  @ApiOperation({
    summary: 'Update user notification preferences (security types are non-overridable)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: [PreferenceResponseItemDto],
    description: 'Updated notification preferences',
  })
  async updatePreferences(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdatePreferencesDto,
  ): Promise<PreferenceResponseItemDto[]> {
    return this.preferenceService.updatePreferences(userId, dto.preferences);
  }
}
