import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { NotificationStatus } from '@prisma/client';

@Injectable()
export class NotificationCleanupService {
  private readonly logger = new Logger(NotificationCleanupService.name);
  private readonly retentionDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.retentionDays = this.configService.get<number>('notifications.retentionDays', 90);
  }

  /**
   * Executes scheduled batched cleanup of expired and aged notifications
   */
  async cleanupExpired(): Promise<{ expiredCleaned: number; oldCleaned: number }> {
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - this.retentionDays * 24 * 60 * 60 * 1000);

    try {
      // 1. Mark or delete expired notifications
      const expiredResult = await this.prisma.notification.updateMany({
        where: {
          expiresAt: { lt: now },
          status: { not: NotificationStatus.EXPIRED },
        },
        data: {
          status: NotificationStatus.EXPIRED,
        },
      });

      // 2. Delete terminal notifications older than retention cutoff
      const oldResult = await this.prisma.notification.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
          status: {
            in: [
              NotificationStatus.DELIVERED,
              NotificationStatus.FAILED,
              NotificationStatus.EXPIRED,
              NotificationStatus.CANCELLED,
            ],
          },
        },
      });

      this.logger.log(
        `Retention cleanup: ${expiredResult.count} marked expired, ${oldResult.count} aged notifications purged.`,
      );

      return {
        expiredCleaned: expiredResult.count,
        oldCleaned: oldResult.count,
      };
    } catch (err) {
      this.logger.error(`Error during notification cleanup: ${err}`);
      return { expiredCleaned: 0, oldCleaned: 0 };
    }
  }
}
