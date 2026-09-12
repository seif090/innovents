import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentsInfrastructureModule } from '../../infrastructure/payments/payments.module';
import { SubscriptionsController } from './controllers/subscriptions.controller';
import { AdminSubscriptionsController } from './controllers/admin-subscriptions.controller';
import { SubscriptionsService } from './services/subscriptions.service';

@Module({
  imports: [DatabaseModule, AuditModule, OutboxModule, AuthModule, PaymentsInfrastructureModule],
  controllers: [SubscriptionsController, AdminSubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
