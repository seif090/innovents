import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { EmailWorker } from './email.worker';
import { EmailModule } from '../email/email.module';

@Global()
@Module({
  imports: [EmailModule],
  providers: [QueueService, EmailWorker],
  exports: [QueueService],
})
export class QueueModule {}
