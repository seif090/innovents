import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationOrchestratorService,
  OrchestrateNotificationParams,
} from './notification-orchestrator.service';

@Injectable()
export class NotificationFanoutService {
  private readonly logger = new Logger(NotificationFanoutService.name);
  private readonly chunkSize = 100;

  constructor(private readonly orchestrator: NotificationOrchestratorService) {}

  /**
   * Fans out a notification to a large audience using safe chunking
   */
  async fanoutToUsers(
    userIds: string[],
    notificationFactory: (userId: string) => OrchestrateNotificationParams,
  ): Promise<number> {
    let dispatchedCount = 0;
    const totalUsers = userIds.length;

    for (let i = 0; i < totalUsers; i += this.chunkSize) {
      const chunk = userIds.slice(i, i + this.chunkSize);
      await Promise.all(
        chunk.map(async (userId) => {
          try {
            const params = notificationFactory(userId);
            await this.orchestrator.orchestrate(params);
            dispatchedCount++;
          } catch (err) {
            this.logger.error(`Fanout failed for user ${userId}: ${err}`);
          }
        }),
      );
    }

    this.logger.log(`Fanout complete: dispatched to ${dispatchedCount} of ${totalUsers} users.`);
    return dispatchedCount;
  }
}
