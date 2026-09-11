import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import {
  Notification,
  NotificationChannel,
  NotificationStatus,
  DeliveryAttemptStatus,
} from '@prisma/client';
import { NotificationGateway } from '../gateways/notification.gateway';
import { PUSH_PROVIDER, PushProvider } from '../providers/push/push-provider.interface';
import { EMAIL_PROVIDER, EmailProvider } from '../../../infrastructure/email/email.interface';
import { EmailTemplateService } from '../providers/email/email-template.service';
import { UserDeviceService } from './user-device.service';
import { NOTIFICATION_SOCKET_EVENTS } from '../constants/notifications.constants';

export interface DeliveryResult {
  success: boolean;
  channel: NotificationChannel;
  error?: string;
  isTransient?: boolean;
}

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationGateway,
    @Inject(PUSH_PROVIDER) private readonly pushProvider: PushProvider,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly userDeviceService: UserDeviceService,
  ) {}

  /**
   * Executes multi-channel delivery for a notification record
   */
  async deliver(notification: Notification, attemptNumber = 1): Promise<DeliveryResult> {
    const startedAt = new Date();

    switch (notification.channel) {
      case NotificationChannel.IN_APP:
        return this.deliverInApp(notification, attemptNumber, startedAt);
      case NotificationChannel.PUSH:
        return this.deliverPush(notification, attemptNumber, startedAt);
      case NotificationChannel.EMAIL:
        return this.deliverEmail(notification, attemptNumber, startedAt);
      default:
        return { success: false, channel: notification.channel, error: 'Unsupported channel' };
    }
  }

  private async deliverInApp(
    notification: Notification,
    attemptNumber: number,
    startedAt: Date,
  ): Promise<DeliveryResult> {
    try {
      const sanitizedPayload = {
        id: notification.id,
        type: notification.type,
        channel: notification.channel,
        title: notification.title,
        body: notification.body,
        data: notification.data,
        createdAt: notification.createdAt,
      };

      this.gateway.sendToUser(
        notification.userId,
        NOTIFICATION_SOCKET_EVENTS.NOTIFICATION_CREATED,
        sanitizedPayload,
      );

      // Record successful delivery attempt
      await this.prisma.notificationDeliveryAttempt.create({
        data: {
          notificationId: notification.id,
          channel: NotificationChannel.IN_APP,
          attemptNumber,
          status: DeliveryAttemptStatus.SUCCESS,
          startedAt,
          completedAt: new Date(),
        },
      });

      // Update notification status
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.DELIVERED,
          deliveredAt: new Date(),
        },
      });

      return { success: true, channel: NotificationChannel.IN_APP };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`In-App delivery failed for notification ${notification.id}: ${errMsg}`);

      await this.recordFailedAttempt(
        notification.id,
        NotificationChannel.IN_APP,
        attemptNumber,
        startedAt,
        'IN_APP_ERROR',
        errMsg,
      );

      return {
        success: false,
        channel: NotificationChannel.IN_APP,
        error: errMsg,
        isTransient: true,
      };
    }
  }

  private async deliverPush(
    notification: Notification,
    attemptNumber: number,
    startedAt: Date,
  ): Promise<DeliveryResult> {
    try {
      const activeDevices = await this.userDeviceService.getActiveDecryptedTokens(
        notification.userId,
      );

      if (activeDevices.length === 0) {
        this.logger.debug(`User ${notification.userId} has no active push devices`);
        await this.prisma.notificationDeliveryAttempt.create({
          data: {
            notificationId: notification.id,
            channel: NotificationChannel.PUSH,
            attemptNumber,
            status: DeliveryAttemptStatus.SUCCESS,
            errorCode: 'NO_ACTIVE_DEVICES',
            errorMessage: 'No active push device registered',
            startedAt,
            completedAt: new Date(),
          },
        });

        await this.prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: NotificationStatus.DELIVERED,
            deliveredAt: new Date(),
          },
        });

        return { success: true, channel: NotificationChannel.PUSH };
      }

      let anySuccess = false;
      let lastErrorMessage = '';
      let isTransient = false;

      for (const device of activeDevices) {
        const result = await this.pushProvider.sendPush({
          token: device.token,
          title: notification.title,
          body: notification.body,
          data: (notification.data as Record<string, unknown>) || undefined,
        });

        if (result.success) {
          anySuccess = true;
          await this.prisma.notificationDeliveryAttempt.create({
            data: {
              notificationId: notification.id,
              channel: NotificationChannel.PUSH,
              attemptNumber,
              status: DeliveryAttemptStatus.SUCCESS,
              providerMessageId: result.providerMessageId,
              startedAt,
              completedAt: new Date(),
            },
          });
        } else {
          lastErrorMessage = result.errorMessage || 'Push delivery failed';
          if (result.errorCode === 'UNAVAILABLE' || result.errorCode === 'TIMEOUT') {
            isTransient = true;
          }

          if (result.isTokenInvalid) {
            await this.userDeviceService.deactivateToken(device.tokenHash);
          }

          await this.prisma.notificationDeliveryAttempt.create({
            data: {
              notificationId: notification.id,
              channel: NotificationChannel.PUSH,
              attemptNumber,
              status: DeliveryAttemptStatus.FAILED,
              errorCode: result.errorCode || 'PUSH_ERROR',
              errorMessage: result.errorMessage,
              startedAt,
              completedAt: new Date(),
            },
          });
        }
      }

      if (anySuccess) {
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: NotificationStatus.DELIVERED,
            deliveredAt: new Date(),
          },
        });
        return { success: true, channel: NotificationChannel.PUSH };
      }

      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.FAILED,
          failedAt: new Date(),
        },
      });

      return {
        success: false,
        channel: NotificationChannel.PUSH,
        error: lastErrorMessage,
        isTransient,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Push delivery error for notification ${notification.id}: ${errMsg}`);

      await this.recordFailedAttempt(
        notification.id,
        NotificationChannel.PUSH,
        attemptNumber,
        startedAt,
        'PUSH_EXCEPTION',
        errMsg,
      );

      return {
        success: false,
        channel: NotificationChannel.PUSH,
        error: errMsg,
        isTransient: true,
      };
    }
  }

  private async deliverEmail(
    notification: Notification,
    attemptNumber: number,
    startedAt: Date,
  ): Promise<DeliveryResult> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: notification.userId },
        select: { email: true, status: true },
      });

      if (!user || !user.email) {
        throw new Error(`User email not found for userId ${notification.userId}`);
      }

      const rendered = this.emailTemplateService.render(notification.type, {
        title: notification.title,
        body: notification.body,
        data: (notification.data as Record<string, unknown>) || undefined,
        language: 'en', // Can be extended from user preference if available
      });

      const sent = await this.emailProvider.sendEmail({
        to: user.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      if (!sent) {
        throw new Error('SMTP provider rejected email transmission');
      }

      await this.prisma.notificationDeliveryAttempt.create({
        data: {
          notificationId: notification.id,
          channel: NotificationChannel.EMAIL,
          attemptNumber,
          status: DeliveryAttemptStatus.SUCCESS,
          startedAt,
          completedAt: new Date(),
        },
      });

      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.DELIVERED,
          deliveredAt: new Date(),
        },
      });

      return { success: true, channel: NotificationChannel.EMAIL };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Email delivery failed for notification ${notification.id}: ${errMsg}`);

      await this.recordFailedAttempt(
        notification.id,
        NotificationChannel.EMAIL,
        attemptNumber,
        startedAt,
        'EMAIL_ERROR',
        errMsg,
      );

      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.FAILED,
          failedAt: new Date(),
        },
      });

      return {
        success: false,
        channel: NotificationChannel.EMAIL,
        error: errMsg,
        isTransient: true,
      };
    }
  }

  private async recordFailedAttempt(
    notificationId: string,
    channel: NotificationChannel,
    attemptNumber: number,
    startedAt: Date,
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    try {
      await this.prisma.notificationDeliveryAttempt.create({
        data: {
          notificationId,
          channel,
          attemptNumber,
          status: DeliveryAttemptStatus.FAILED,
          errorCode,
          errorMessage,
          startedAt,
          completedAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.error(`Failed to record delivery attempt: ${err}`);
    }
  }
}
