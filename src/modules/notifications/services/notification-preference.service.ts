import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { NotificationType, NotificationChannel } from '@prisma/client';
import {
  NOTIFICATION_SECURITY_TYPES,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '../constants/notifications.constants';
import { PreferenceResponseItemDto } from '../dto/preference-response.dto';
import { PreferenceItemDto } from '../dto/update-preference.dto';

@Injectable()
export class NotificationPreferenceService {
  private readonly logger = new Logger(NotificationPreferenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves whether a notification should be dispatched over a given channel.
   * Security & transactional notifications strictly override user preferences.
   */
  async shouldDeliver(
    userId: string,
    type: NotificationType,
    channel: NotificationChannel,
  ): Promise<boolean> {
    // 1. Mandatory Security Override
    if (NOTIFICATION_SECURITY_TYPES.has(type)) {
      return true;
    }

    // 2. Check explicit user preference in database
    const explicitPref = await this.prisma.notificationPreference.findUnique({
      where: {
        userId_type_channel: {
          userId,
          type,
          channel,
        },
      },
    });

    if (explicitPref) {
      return explicitPref.isEnabled;
    }

    // 3. Fallback to default preference
    const defaultForType = DEFAULT_NOTIFICATION_PREFERENCES[type];
    if (!defaultForType) {
      return true;
    }

    switch (channel) {
      case NotificationChannel.IN_APP:
        return defaultForType.inApp;
      case NotificationChannel.PUSH:
        return defaultForType.push;
      case NotificationChannel.EMAIL:
        return defaultForType.email;
      default:
        return true;
    }
  }

  /**
   * Retrieves all effective preferences for a user, including defaults and overrides
   */
  async getUserPreferences(userId: string): Promise<PreferenceResponseItemDto[]> {
    const userPrefs = await this.prisma.notificationPreference.findMany({
      where: { userId },
    });

    const prefMap = new Map<string, boolean>();
    for (const pref of userPrefs) {
      prefMap.set(`${pref.type}_${pref.channel}`, pref.isEnabled);
    }

    const channels = [
      NotificationChannel.IN_APP,
      NotificationChannel.PUSH,
      NotificationChannel.EMAIL,
    ];
    const result: PreferenceResponseItemDto[] = [];

    for (const type of Object.values(NotificationType)) {
      const isSecurity = NOTIFICATION_SECURITY_TYPES.has(type);
      const defaults = DEFAULT_NOTIFICATION_PREFERENCES[type] || {
        inApp: true,
        push: true,
        email: false,
      };

      for (const channel of channels) {
        const key = `${type}_${channel}`;
        let isEnabled: boolean;

        if (isSecurity) {
          isEnabled = true;
        } else if (prefMap.has(key)) {
          isEnabled = prefMap.get(key)!;
        } else {
          isEnabled =
            channel === NotificationChannel.IN_APP
              ? defaults.inApp
              : channel === NotificationChannel.PUSH
                ? defaults.push
                : defaults.email;
        }

        result.push({
          type,
          channel,
          isEnabled,
          isConfigurable: !isSecurity,
        });
      }
    }

    return result;
  }

  /**
   * Updates user preferences, ignoring attempts to disable non-configurable security types
   */
  async updatePreferences(
    userId: string,
    preferences: PreferenceItemDto[],
  ): Promise<PreferenceResponseItemDto[]> {
    for (const item of preferences) {
      if (NOTIFICATION_SECURITY_TYPES.has(item.type)) {
        this.logger.debug(
          `Ignoring user preference modification attempt for security type: ${item.type}`,
        );
        continue;
      }

      await this.prisma.notificationPreference.upsert({
        where: {
          userId_type_channel: {
            userId,
            type: item.type,
            channel: item.channel,
          },
        },
        update: {
          isEnabled: item.isEnabled,
        },
        create: {
          userId,
          type: item.type,
          channel: item.channel,
          isEnabled: item.isEnabled,
        },
      });
    }

    return this.getUserPreferences(userId);
  }
}
