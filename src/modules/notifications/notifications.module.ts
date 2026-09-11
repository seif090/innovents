import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationPreferencesController } from './controllers/notification-preferences.controller';
import { UserDevicesController } from './controllers/user-devices.controller';
import { NotificationsService } from './services/notifications.service';
import { NotificationPreferenceService } from './services/notification-preference.service';
import { UserDeviceService } from './services/user-device.service';
import { NotificationOrchestratorService } from './services/notification-orchestrator.service';
import { NotificationDeliveryService } from './services/notification-delivery.service';
import { NotificationFanoutService } from './services/notification-fanout.service';
import { NotificationCleanupService } from './services/notification-cleanup.service';
import { EmailTemplateService } from './providers/email/email-template.service';
import { NotificationGateway } from './gateways/notification.gateway';
import { PUSH_PROVIDER } from './providers/push/push-provider.interface';
import { MockPushService } from './providers/push/mock-push.service';
import { OutboxProcessor } from './processors/outbox.processor';
import { NotificationDeliveryProcessor } from './processors/notification-delivery.processor';
import { ReminderProcessor } from './processors/reminder.processor';

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [NotificationsController, NotificationPreferencesController, UserDevicesController],
  providers: [
    NotificationsService,
    NotificationPreferenceService,
    UserDeviceService,
    NotificationOrchestratorService,
    NotificationDeliveryService,
    NotificationFanoutService,
    NotificationCleanupService,
    EmailTemplateService,
    NotificationGateway,
    OutboxProcessor,
    NotificationDeliveryProcessor,
    ReminderProcessor,
    {
      provide: PUSH_PROVIDER,
      useClass: MockPushService,
    },
  ],
  exports: [
    NotificationsService,
    NotificationPreferenceService,
    UserDeviceService,
    NotificationOrchestratorService,
    NotificationDeliveryService,
    NotificationFanoutService,
    NotificationCleanupService,
    NotificationGateway,
    OutboxProcessor,
    NotificationDeliveryProcessor,
    ReminderProcessor,
    PUSH_PROVIDER,
  ],
})
export class NotificationsModule {}
