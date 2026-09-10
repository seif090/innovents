import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, JobsOptions } from 'bullmq';
import { QUEUE_NAMES, QueueName } from './queue.constants';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queues = new Map<string, Queue>();

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);
    const password = this.configService.get<string | undefined>('redis.password');

    const connection = {
      host,
      port,
      password: password || undefined,
      maxRetriesPerRequest: null,
    };

    // Initialize all core queues
    for (const queueName of Object.values(QUEUE_NAMES)) {
      try {
        const queue = new Queue(queueName, {
          connection,
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
            removeOnComplete: 100,
            removeOnFail: 500,
          },
        });
        this.queues.set(queueName, queue);
      } catch (err) {
        this.logger.warn(`Failed to initialize BullMQ queue '${queueName}': ${err}`);
      }
    }
    this.logger.log(`✅ Initialized ${this.queues.size} BullMQ queues.`);
  }

  async onModuleDestroy(): Promise<void> {
    for (const [name, queue] of this.queues.entries()) {
      try {
        await queue.close();
      } catch (err) {
        this.logger.error(`Error closing queue ${name}: ${err}`);
      }
    }
    this.logger.log('🔌 BullMQ queues closed gracefully');
  }

  getQueue(name: QueueName): Queue | undefined {
    return this.queues.get(name);
  }

  async addJob<T>(
    queueName: QueueName,
    jobName: string,
    data: T,
    opts?: JobsOptions,
  ): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      this.logger.warn(`Queue '${queueName}' not found. Job '${jobName}' dropped.`);
      return;
    }
    await queue.add(jobName, data, opts);
  }
}
