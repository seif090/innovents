import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../../database/prisma.service';
import { NotificationGateway } from '../gateways/notification.gateway';
import { NotificationType, NotificationChannel, NotificationStatus } from '@prisma/client';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: {
    notification: {
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let gateway: { sendToUser: jest.Mock };

  const userId = '11111111-1111-1111-1111-111111111111';
  const otherUserId = '22222222-2222-2222-2222-222222222222';
  const notifId = 'notif-1';

  beforeEach(async () => {
    prisma = {
      notification: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    gateway = { sendToUser: jest.fn().mockReturnValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationGateway, useValue: gateway },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('getNotifications', () => {
    it('should return paginated notifications with total and pages', async () => {
      prisma.notification.findMany.mockResolvedValue([
        {
          id: notifId,
          userId,
          type: NotificationType.SESSION_REMINDER,
          channel: NotificationChannel.IN_APP,
          title: 'Session',
          body: 'Begins soon',
          data: null,
          status: NotificationStatus.DELIVERED,
          readAt: null,
          deliveredAt: new Date(),
          createdAt: new Date(),
        },
      ]);
      prisma.notification.count.mockResolvedValue(1);

      const result = await service.getNotifications(userId, { page: 1, pageSize: 20 });

      expect(result.data.length).toBe(1);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      prisma.notification.count.mockResolvedValue(5);

      const result = await service.getUnreadCount(userId);
      expect(result.unreadCount).toBe(5);
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read and emit socket event', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: notifId,
        userId,
        type: NotificationType.SESSION_REMINDER,
        channel: NotificationChannel.IN_APP,
        title: 'Title',
        body: 'Body',
        status: NotificationStatus.DELIVERED,
        readAt: null,
      });
      prisma.notification.update.mockResolvedValue({
        id: notifId,
        userId,
        type: NotificationType.SESSION_REMINDER,
        channel: NotificationChannel.IN_APP,
        title: 'Title',
        body: 'Body',
        status: NotificationStatus.DELIVERED,
        readAt: new Date(),
      });
      prisma.notification.count.mockResolvedValue(0);

      const updated = await service.markAsRead(userId, notifId);

      expect(updated.readAt).toBeDefined();
      expect(prisma.notification.update).toHaveBeenCalled();
      expect(gateway.sendToUser).toHaveBeenCalledWith(userId, 'notification.unread_count', {
        unreadCount: 0,
      });
    });

    it('should prevent IDOR and throw ForbiddenException if notification belongs to another user', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: notifId,
        userId: otherUserId,
      });

      await expect(service.markAsRead(userId, notifId)).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if notification does not exist', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await expect(service.markAsRead(userId, 'notif-999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read and emit socket event with count 0', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.markAllAsRead(userId);

      expect(result.updatedCount).toBe(3);
      expect(gateway.sendToUser).toHaveBeenCalledWith(userId, 'notification.unread_count', {
        unreadCount: 0,
      });
    });
  });

  describe('deleteNotification', () => {
    it('should prevent IDOR and throw ForbiddenException when attempting to delete another user notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: notifId,
        userId: otherUserId,
      });

      await expect(service.deleteNotification(userId, notifId)).rejects.toThrow(ForbiddenException);
    });
  });
});
