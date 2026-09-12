import { Module } from '@nestjs/common';
import { ReportsService } from './services/reports.service';
import { ReportsController } from './controllers/reports.controller';
import { AdminReportsController } from './controllers/admin-reports.controller';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [ReportsController, AdminReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
