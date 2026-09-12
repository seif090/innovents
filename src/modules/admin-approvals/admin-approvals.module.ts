import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AuthModule } from '../auth/auth.module';
import { AdminApprovalsService } from './services/admin-approvals.service';
import { AdminApprovalsController } from './controllers/admin-approvals.controller';

@Module({
  imports: [DatabaseModule, AuditModule, OutboxModule, AuthModule],
  controllers: [AdminApprovalsController],
  providers: [AdminApprovalsService],
  exports: [AdminApprovalsService],
})
export class AdminApprovalsModule {}
