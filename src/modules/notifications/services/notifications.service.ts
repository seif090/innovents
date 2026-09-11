import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { NotificationGateway } from '../gateways/notification.gateway';
import { NotificationQueryDto } from '../dto/notification-query.dto';
import { NotificationResponseDto } from '../dto/notification-response.dto';
import { UnreadCountResponseDto } from '../dto/unread-count-response.dto';
import { NotificationStatus, Prisma } from '@prisma/client';
import { NOTIFICATION_SOCKET_EVENTS } from '../constants/notifications.constants';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationGateway,
  ) {}

  /**
   * Retrieves paginated notifications for the authenticated user with multi-field filtering
   */
  async getNotifications(
    userId: string,
    query: NotificationQueryDto,
  ): Promise<{
    data: NotificationResponseDto[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const skip = (page - 1) * pageSize;

    const where: Prisma.NotificationWhereInput = {
      userId,
      status: { not: NotificationStatus.CANCELLED },
    };

    if (query.type) {
      where.type = query.type;
    }
    if (query.channel) {
      where.channel = query.channel;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.isRead !== undefined) {
      where.readAt = query.isRead ? { not: null } : null;
    }
    if (query.createdFrom || query.createdTo) {
      where.createdAt = {};
      if (query.createdFrom) {
        where.createdAt.gte = new Date(query.createdFrom);
      }
      if (query.createdTo) {
        where.createdAt.lte = new Date(query.createdTo);
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);

    const data: NotificationResponseDto[] = items.map((n) => ({
      id: n.id,
      userId: n.userId,
      type: n.type,
      channel: n.channel,
      title: n.title,
      body: n.body,
      data: n.data as Record<string, unknown> | null,
      status: n.status,
      readAt: n.readAt,
      deliveredAt: n.deliveredAt,
      createdAt: n.createdAt,
    }));

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  /**
   * Returns current count of unread notifications for a user
   */
  async getUnreadCount(userId: string): Promise<UnreadCountResponseDto> {
    const unreadCount = await this.prisma.notification.count({
      where: {
        userId,
        readAt: null,
        status: { not: NotificationStatus.CANCELLED },
      },
    });

    return { unreadCount };
  }

  /**
   * Marks a specific notification as read, with ownership verification to prevent IDOR
   */
  async markAsRead(userId: string, notificationId: string): Promise<NotificationResponseDto> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('You are not authorized to access this notification');
    }

    let updated = notification;
    if (!notification.readAt) {
      updated = await this.prisma.notification.update({
        where: { id: notificationId },
        data: { readAt: new Date() },
      });

      // Update real-time unread count
      const { unreadCount } = await this.getUnreadCount(userId);
      this.gateway.sendToUser(userId, NOTIFICATION_SOCKET_EVENTS.UNREAD_COUNT_UPDATED, {
        unreadCount,
      });
    }

    return {
      id: updated.id,
      userId: updated.userId,
      type: updated.type,
      channel: updated.channel,
      title: updated.title,
      body: updated.body,
      data: updated.data as Record<string, unknown> | null,
      status: updated.status,
      readAt: updated.readAt,
      deliveredAt: updated.deliveredAt,
      createdAt: updated.createdAt,
    };
  }

  /**
   * Marks all unread notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<{ updatedCount: number }> {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
        status: { not: NotificationStatus.CANCELLED },
      },
      data: {
        readAt: new Date(),
      },
    });

    // Notify user in real-time that unread count is 0
    this.gateway.sendToUser(userId, NOTIFICATION_SOCKET_EVENTS.UNREAD_COUNT_UPDATED, {
      unreadCount: 0,
    });

    return { updatedCount: result.count };
  }

  /**
   * Cancels/deletes a notification, with strict ownership verification
   */
  async deleteNotification(userId: string, notificationId: string): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('You are not authorized to delete this notification');
    }

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: NotificationStatus.CANCELLED },
    });
  }
}
