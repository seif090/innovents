import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { NotificationDeliveryService } from '../services/notification-delivery.service';

export interface NotificationDeliveryJobData {
  notificationId: string;
  attemptNumber?: number;
}

@Injectable()
export class NotificationDeliveryProcessor {
  private readonly logger = new Logger(NotificationDeliveryProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveryService: NotificationDeliveryService,
  ) {}

  /**
   * Processes a queued delivery job
   */
  async processJob(_jobName: string, data: NotificationDeliveryJobData): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: data.notificationId },
    });

    if (!notification) {
      this.logger.warn(`Notification ${data.notificationId} not found; skipping delivery job`);
      return;
    }

    const attemptNumber = data.attemptNumber || 1;
    const result = await this.deliveryService.deliver(notification, attemptNumber);

    if (!result.success) {
      if (result.isTransient) {
        // Re-throw to allow BullMQ to handle exponential backoff retry
        throw new Error(
          `Transient delivery failure for notification ${notification.id}: ${result.error}`,
        );
      } else {
        this.logger.error(
          `Permanent delivery failure for notification ${notification.id}: ${result.error}`,
        );
      }
    }
  }
}
