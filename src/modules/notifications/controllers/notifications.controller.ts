import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { NotificationsService } from '../services/notifications.service';
import { NotificationQueryDto } from '../dto/notification-query.dto';
import { NotificationResponseDto } from '../dto/notification-response.dto';
import { UnreadCountResponseDto } from '../dto/unread-count-response.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get paginated notifications for current authenticated user' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Paginated notifications list' })
  async getNotifications(@CurrentUser('sub') userId: string, @Query() query: NotificationQueryDto) {
    return this.notificationsService.getNotifications(userId, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count for current user' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: UnreadCountResponseDto,
    description: 'Current unread notification count',
  })
  async getUnreadCount(@CurrentUser('sub') userId: string): Promise<UnreadCountResponseDto> {
    return this.notificationsService.getUnreadCount(userId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a specific notification as read' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: NotificationResponseDto,
    description: 'Notification marked as read',
  })
  async markAsRead(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NotificationResponseDto> {
    return this.notificationsService.markAsRead(userId, id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read for current user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'All notifications marked as read',
  })
  async markAllAsRead(@CurrentUser('sub') userId: string): Promise<{ updatedCount: number }> {
    return this.notificationsService.markAllAsRead(userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel or soft-delete a notification' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Notification deleted' })
  async deleteNotification(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.notificationsService.deleteNotification(userId, id);
  }
}
