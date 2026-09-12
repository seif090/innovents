import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { OrganizerInvitationsService } from './services/organizer-invitations.service';
import { OrganizerInvitationsController } from './controllers/organizer-invitations.controller';

@Module({
  imports: [DatabaseModule, AuditModule, OutboxModule, AuthModule, EventsModule],
  controllers: [OrganizerInvitationsController],
  providers: [OrganizerInvitationsService],
  exports: [OrganizerInvitationsService],
})
export class OrganizerInvitationsModule {}
