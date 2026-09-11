import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { EventAuthorizationService } from './services/event-authorization.service';
import { EventsService } from './services/events.service';
import { EventRegistrationService } from './services/event-registration.service';
import { VenuesService } from './services/venues.service';
import { SpeakersService } from './services/speakers.service';
import { SessionsService } from './services/sessions.service';
import { AttendeeScheduleService } from './services/attendee-schedule.service';
import { EventsController } from './controllers/events.controller';
import { RegistrationsController } from './controllers/registrations.controller';
import { VenuesController } from './controllers/venues.controller';
import { SpeakersController } from './controllers/speakers.controller';
import { SessionsController } from './controllers/sessions.controller';
import { SchedulesController } from './controllers/schedules.controller';

import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuditModule, OutboxModule, QueueModule, AuthModule],
  controllers: [
    EventsController,
    RegistrationsController,
    VenuesController,
    SpeakersController,
    SessionsController,
    SchedulesController,
  ],
  providers: [
    EventAuthorizationService,
    EventsService,
    EventRegistrationService,
    VenuesService,
    SpeakersService,
    SessionsService,
    AttendeeScheduleService,
  ],
  exports: [EventAuthorizationService, EventsService, EventRegistrationService, SessionsService],
})
export class EventsModule {}
