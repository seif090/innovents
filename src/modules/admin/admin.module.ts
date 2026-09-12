import { Module } from '@nestjs/common';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminUsersService } from './services/admin-users.service';
import { AdminModerationService } from './services/admin-moderation.service';
import { AdminAuditLogsService } from './services/admin-audit-logs.service';
import { AdminOperationalReportsService } from './services/admin-operational-reports.service';
import { AdminExportsService } from './services/admin-exports.service';

import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminModerationController } from './controllers/admin-moderation.controller';
import { AdminAuditLogsController } from './controllers/admin-audit-logs.controller';
import { AdminOperationalReportsController } from './controllers/admin-operational-reports.controller';
import { AdminExportsController } from './controllers/admin-exports.controller';

import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { PaymentsModule } from '../payments/payments.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuditModule, OutboxModule, PaymentsModule, AuthModule],
  controllers: [
    AdminDashboardController,
    AdminUsersController,
    AdminModerationController,
    AdminAuditLogsController,
    AdminOperationalReportsController,
    AdminExportsController,
  ],
  providers: [
    AdminDashboardService,
    AdminUsersService,
    AdminModerationService,
    AdminAuditLogsService,
    AdminOperationalReportsService,
    AdminExportsService,
  ],
  exports: [
    AdminDashboardService,
    AdminUsersService,
    AdminModerationService,
    AdminAuditLogsService,
    AdminOperationalReportsService,
    AdminExportsService,
  ],
})
export class AdminModule {}
