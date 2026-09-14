import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';

import { QUEUE_NAMES } from './queue.constants';
import { EMAIL_PROVIDER, EmailProvider, SendEmailOptions } from '../email/email.interface';

@Injectable()
export class EmailWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailWorker.name);
  private worker?: Worker<SendEmailOptions>;

  constructor(
    private readonly configService: ConfigService,
    @Inject(EMAIL_PROVIDER)
    private readonly emailProvider: EmailProvider,
  ) {}

  onModuleInit(): void {
    const host = this.configService.get<string>('redis.host', 'localhost');

    const port = this.configService.get<number>('redis.port', 6379);

    const password = this.configService.get<string | undefined>('redis.password');

    this.worker = new Worker<SendEmailOptions>(
      QUEUE_NAMES.EMAIL,

      async (job: Job<SendEmailOptions>) => {
        this.logger.log(`Processing email job '${job.name}' for ${JSON.stringify(job.data.to)}`);

        const sent = await this.emailProvider.sendEmail(job.data);

        if (!sent) {
          throw new Error(`Email job '${job.name}' failed`);
        }

        this.logger.log(`Email job '${job.name}' completed successfully`);
      },

      {
        connection: {
          host,
          port,
          password: password || undefined,
          maxRetriesPerRequest: null,
        },
      },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Email job '${job?.name}' failed: ${error.message}`);
    });

    this.logger.log(`Email worker listening on queue '${QUEUE_NAMES.EMAIL}'`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.logger.log('Email worker closed gracefully');
    }
  }
}
