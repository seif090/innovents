import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { QueueService } from '../../../infrastructure/queue/queue.service';
import { QUEUE_NAMES } from '../../../infrastructure/queue/queue.constants';
import { NotificationPreferenceService } from './notification-preference.service';
import {
  Notification,
  NotificationType,
  NotificationChannel,
  NotificationStatus,
  Prisma,
} from '@prisma/client';

export interface OrchestrateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  idempotencyKey?: string;
  channels?: NotificationChannel[];
  expiresAt?: Date;
}

@Injectable()
export class NotificationOrchestratorService {
  private readonly logger = new Logger(NotificationOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly preferenceService: NotificationPreferenceService,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Orchestrates multi-channel notification creation, preference resolution,
   * idempotency enforcement, and asynchronous delivery queue dispatch.
   */
  async orchestrate(params: OrchestrateNotificationParams): Promise<Notification[]> {
    const targetChannels = params.channels || [
      NotificationChannel.IN_APP,
      NotificationChannel.PUSH,
      NotificationChannel.EMAIL,
    ];

    const createdNotifications: Notification[] = [];

    for (const channel of targetChannels) {
      // 1. Resolve user preference (with security override)
      const allowed = await this.preferenceService.shouldDeliver(
        params.userId,
        params.type,
        channel,
      );

      if (!allowed) {
        this.logger.debug(
          `Suppressed ${channel} notification for user ${params.userId} due to preference settings.`,
        );
        continue;
      }

      // 2. Channel-specific idempotency key
      const channelIdempotencyKey = params.idempotencyKey
        ? `${params.idempotencyKey}:${channel}`
        : undefined;

      // 3. Persist notification record with database-level idempotency
      let notification: Notification;
      try {
        if (channelIdempotencyKey) {
          notification = await this.prisma.notification.upsert({
            where: { idempotencyKey: channelIdempotencyKey },
            update: {}, // idempotent, do not overwrite existing
            create: {
              userId: params.userId,
              type: params.type,
              channel,
              title: params.title,
              body: params.body,
              data: (params.data as Prisma.InputJsonValue) || undefined,
              status: NotificationStatus.PENDING,
              idempotencyKey: channelIdempotencyKey,
              expiresAt: params.expiresAt,
            },
          });
        } else {
          notification = await this.prisma.notification.create({
            data: {
              userId: params.userId,
              type: params.type,
              channel,
              title: params.title,
              body: params.body,
              data: (params.data as Prisma.InputJsonValue) || undefined,
              status: NotificationStatus.PENDING,
              expiresAt: params.expiresAt,
            },
          });
        }
      } catch (err) {
        this.logger.warn(`Handled race-condition or duplicate notification insertion: ${err}`);
        if (channelIdempotencyKey) {
          const existing = await this.prisma.notification.findUnique({
            where: { idempotencyKey: channelIdempotencyKey },
          });
          if (existing) {
            createdNotifications.push(existing);
            continue;
          }
        }
        continue;
      }

      createdNotifications.push(notification);

      // 4. Asynchronously enqueue delivery to BullMQ without blocking HTTP response
      const queueName =
        channel === NotificationChannel.EMAIL ? QUEUE_NAMES.EMAIL : QUEUE_NAMES.NOTIFICATIONS;

      const jobName =
        channel === NotificationChannel.EMAIL ? 'deliver-email' : 'deliver-notification';

      await this.queueService.addJob(
        queueName,
        jobName,
        {
          notificationId: notification.id,
          attemptNumber: 1,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      );
    }

    return createdNotifications;
  }
}
