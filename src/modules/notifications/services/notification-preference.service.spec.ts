import { Test, TestingModule } from '@nestjs/testing';
import { NotificationPreferenceService } from './notification-preference.service';
import { PrismaService } from '../../../database/prisma.service';
import { NotificationType, NotificationChannel } from '@prisma/client';

describe('NotificationPreferenceService', () => {
  let service: NotificationPreferenceService;
  let prisma: {
    notificationPreference: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      upsert: jest.Mock;
    };
  };

  const userId = '11111111-1111-1111-1111-111111111111';

  beforeEach(async () => {
    prisma = {
      notificationPreference: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationPreferenceService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<NotificationPreferenceService>(NotificationPreferenceService);
  });

  describe('shouldDeliver', () => {
    it('should strictly override and allow delivery for security notifications', async () => {
      // Security type should deliver regardless of DB preference
      const result = await service.shouldDeliver(
        userId,
        NotificationType.SECURITY_PASSWORD_RESET,
        NotificationChannel.EMAIL,
      );

      expect(result).toBe(true);
      expect(prisma.notificationPreference.findUnique).not.toHaveBeenCalled();
    });

    it('should return explicit user preference when configured in database', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue({
        id: 'pref-1',
        userId,
        type: NotificationType.COMMUNITY_POST_MENTION,
        channel: NotificationChannel.PUSH,
        isEnabled: false,
      });

      const result = await service.shouldDeliver(
        userId,
        NotificationType.COMMUNITY_POST_MENTION,
        NotificationChannel.PUSH,
      );

      expect(result).toBe(false);
      expect(prisma.notificationPreference.findUnique).toHaveBeenCalledWith({
        where: {
          userId_type_channel: {
            userId,
            type: NotificationType.COMMUNITY_POST_MENTION,
            channel: NotificationChannel.PUSH,
          },
        },
      });
    });

    it('should fallback to default preference when no explicit database record exists', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue(null);

      // Session reminder default is inApp=true, push=true, email=false
      const inAppResult = await service.shouldDeliver(
        userId,
        NotificationType.SESSION_REMINDER,
        NotificationChannel.IN_APP,
      );
      const emailResult = await service.shouldDeliver(
        userId,
        NotificationType.SESSION_REMINDER,
        NotificationChannel.EMAIL,
      );

      expect(inAppResult).toBe(true);
      expect(emailResult).toBe(false);
    });
  });

  describe('getUserPreferences', () => {
    it('should return effective preferences for all types and mark security types as non-configurable', async () => {
      prisma.notificationPreference.findMany.mockResolvedValue([
        {
          userId,
          type: NotificationType.COMMUNITY_POST_MENTION,
          channel: NotificationChannel.PUSH,
          isEnabled: false,
        },
      ]);

      const prefs = await service.getUserPreferences(userId);
      expect(prefs.length).toBeGreaterThan(0);

      const securityPref = prefs.find((p) => p.type === NotificationType.SECURITY_PASSWORD_RESET);
      expect(securityPref).toBeDefined();
      expect(securityPref?.isConfigurable).toBe(false);
      expect(securityPref?.isEnabled).toBe(true);

      const mentionPushPref = prefs.find(
        (p) =>
          p.type === NotificationType.COMMUNITY_POST_MENTION &&
          p.channel === NotificationChannel.PUSH,
      );
      expect(mentionPushPref?.isEnabled).toBe(false);
      expect(mentionPushPref?.isConfigurable).toBe(true);
    });
  });

  describe('updatePreferences', () => {
    it('should update configurable preferences and ignore security types', async () => {
      prisma.notificationPreference.upsert.mockResolvedValue({});
      prisma.notificationPreference.findMany.mockResolvedValue([]);

      await service.updatePreferences(userId, [
        {
          type: NotificationType.COMMUNITY_POST_MENTION,
          channel: NotificationChannel.PUSH,
          isEnabled: false,
        },
        {
          type: NotificationType.SECURITY_PASSWORD_RESET,
          channel: NotificationChannel.EMAIL,
          isEnabled: false, // Must be ignored
        },
      ]);

      expect(prisma.notificationPreference.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith({
        where: {
          userId_type_channel: {
            userId,
            type: NotificationType.COMMUNITY_POST_MENTION,
            channel: NotificationChannel.PUSH,
          },
        },
        update: { isEnabled: false },
        create: {
          userId,
          type: NotificationType.COMMUNITY_POST_MENTION,
          channel: NotificationChannel.PUSH,
          isEnabled: false,
        },
      });
    });
  });
});
