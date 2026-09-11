import { Injectable, Logger } from '@nestjs/common';
import { NotificationOrchestratorService } from '../services/notification-orchestrator.service';
import { NotificationType } from '@prisma/client';

export interface SessionReminderJobData {
  userId: string;
  sessionId: string;
  eventId: string;
  sessionTitle: string;
  startsAt: string;
  venueName?: string | null;
}

export interface MeetupReminderJobData {
  userId: string;
  meetupId: string;
  communityId: string;
  meetupTitle: string;
  startsAt: string;
  location?: string | null;
}

@Injectable()
export class ReminderProcessor {
  private readonly logger = new Logger(ReminderProcessor.name);

  constructor(private readonly orchestrator: NotificationOrchestratorService) {}

  /**
   * Processes upcoming session reminders (15 minutes prior)
   */
  async processSessionReminder(data: SessionReminderJobData): Promise<void> {
    const idempotencyKey = `session-reminder:${data.userId}:${data.sessionId}`;
    this.logger.debug(`Processing session reminder job with key: ${idempotencyKey}`);

    await this.orchestrator.orchestrate({
      userId: data.userId,
      type: NotificationType.SESSION_REMINDER,
      title: `Upcoming Session: ${data.sessionTitle}`,
      body: `Your scheduled session "${data.sessionTitle}" is starting in 15 minutes.`,
      data: {
        sessionId: data.sessionId,
        eventId: data.eventId,
        sessionTitle: data.sessionTitle,
        startsAt: data.startsAt,
        venueName: data.venueName,
      },
      idempotencyKey,
    });
  }

  /**
   * Processes upcoming community meetup reminders (15 minutes prior)
   */
  async processMeetupReminder(data: MeetupReminderJobData): Promise<void> {
    const idempotencyKey = `meetup-reminder:${data.userId}:${data.meetupId}`;
    this.logger.debug(`Processing meetup reminder job with key: ${idempotencyKey}`);

    await this.orchestrator.orchestrate({
      userId: data.userId,
      type: NotificationType.COMMUNITY_MEETUP_REMINDER,
      title: `Upcoming Meetup: ${data.meetupTitle}`,
      body: `Your community meetup "${data.meetupTitle}" is starting in 15 minutes.`,
      data: {
        meetupId: data.meetupId,
        communityId: data.communityId,
        meetupTitle: data.meetupTitle,
        startsAt: data.startsAt,
        location: data.location,
      },
      idempotencyKey,
    });
  }
}
