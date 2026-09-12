import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentsInfrastructureModule } from '../../infrastructure/payments/payments.module';
import { PaymentsController } from './controllers/payments.controller';
import { StripeWebhookController } from './controllers/stripe-webhook.controller';
import { AdminRevenueController } from './controllers/admin-revenue.controller';
import { PaymentsService } from './services/payments.service';
import { StripeWebhookService } from './services/stripe-webhook.service';
import { RevenueService } from './services/revenue.service';
import { PaymentReconciliationService } from './services/payment-reconciliation.service';

@Module({
  imports: [DatabaseModule, AuditModule, OutboxModule, AuthModule, PaymentsInfrastructureModule],
  controllers: [PaymentsController, StripeWebhookController, AdminRevenueController],
  providers: [PaymentsService, StripeWebhookService, RevenueService, PaymentReconciliationService],
  exports: [PaymentsService, StripeWebhookService, RevenueService, PaymentReconciliationService],
})
export class PaymentsModule {}
