import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { QueueService } from '../../../infrastructure/queue/queue.service';
import { QUEUE_NAMES } from '../../../infrastructure/queue/queue.constants';
import { OutboxService } from '../../outbox/outbox.service';
import { ScheduleItemResponseDto, SessionNoteResponseDto } from '../dto/schedule-response.dto';
import { EVENT_EVENTS, EVENT_RESOURCE_TYPE } from '../constants/events.constants';
import { EventStatus, SessionStatus } from '@prisma/client';

@Injectable()
export class AttendeeScheduleService {
  private readonly logger = new Logger(AttendeeScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly outboxService: OutboxService,
  ) {}

  /**
   * Adds a session to the attendee's personal schedule and schedules a 15-minute reminder
   */
  async addSession(
    userId: string,
    eventId: string,
    sessionId: string,
  ): Promise<ScheduleItemResponseDto> {
    // 1. Verify session exists and belongs to event
    const session = await this.prisma.session.findFirst({
      where: {
        id: sessionId,
        eventId,
        deletedAt: null,
      },
      include: {
        event: true,
        venue: true,
        speakers: {
          include: { speaker: true },
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found in this event');
    }

    // User Feedback Rule 7: Forbid adding cancelled session or session from unpublished/cancelled event
    if (session.status === SessionStatus.CANCELLED) {
      throw new ConflictException('Cannot add a cancelled session to personal schedule');
    }

    if (
      session.event.deletedAt !== null ||
      session.event.status === EventStatus.CANCELLED ||
      session.event.status === EventStatus.DRAFT
    ) {
      throw new ConflictException(
        'Cannot add session from an unpublished or cancelled event to personal schedule',
      );
    }

    // 2. Add to schedule (upsert for idempotency)
    const scheduleItem = await this.prisma.userSessionSchedule.upsert({
      where: {
        userId_sessionId: {
          userId,
          sessionId,
        },
      },
      update: {},
      create: {
        userId,
        sessionId,
      },
    });

    // 3. User Feedback Rule 8: Idempotent 15-minute reminder job scheduling via BullMQ
    const reminderTargetTime = new Date(session.startsAt.getTime() - 15 * 60 * 1000);
    const now = new Date();

    if (reminderTargetTime > now) {
      const delayMs = reminderTargetTime.getTime() - now.getTime();
      const jobId = `session-reminder:${userId}:${sessionId}`;

      try {
        await this.queueService.addJob(
          QUEUE_NAMES.REMINDERS,
          'send-session-reminder',
          {
            userId,
            sessionId: session.id,
            eventId: session.eventId,
            sessionTitle: session.title,
            startsAt: session.startsAt.toISOString(),
            venueName: session.venue?.name || null,
          },
          {
            jobId,
            delay: delayMs,
          },
        );

        await this.outboxService.enqueue({
          eventType: EVENT_EVENTS.SESSION_REMINDER_SCHEDULED,
          aggregateType: EVENT_RESOURCE_TYPE.SCHEDULE,
          aggregateId: scheduleItem.id,
          payload: {
            userId,
            sessionId,
            jobId,
            reminderTargetTime: reminderTargetTime.toISOString(),
          },
        });
      } catch (err) {
        this.logger.warn(`Failed to schedule reminder job for session ${sessionId}: ${err}`);
      }
    }

    // Check if user has personal note on this session
    const note = await this.prisma.userSessionNote.findUnique({
      where: {
        userId_sessionId: {
          userId,
          sessionId,
        },
      },
    });

    return {
      id: scheduleItem.id,
      userId: scheduleItem.userId,
      sessionId: scheduleItem.sessionId,
      session: {
        id: session.id,
        eventId: session.eventId,
        venueId: session.venueId,
        title: session.title,
        description: session.description,
        startsAt: session.startsAt.toISOString(),
        endsAt: session.endsAt.toISOString(),
        displayOrder: session.displayOrder,
        status: session.status,
        venue: session.venue
          ? {
              id: session.venue.id,
              eventId: session.venue.eventId,
              name: session.venue.name,
              description: session.venue.description,
              capacity: session.venue.capacity,
              floor: session.venue.floor,
              location: session.venue.location,
              createdAt: session.venue.createdAt.toISOString(),
              updatedAt: session.venue.updatedAt.toISOString(),
            }
          : null,
        speakers: session.speakers.map((s) => ({
          id: s.speaker.id,
          eventId: s.speaker.eventId,
          fullName: s.speaker.fullName,
          jobTitle: s.speaker.jobTitle,
          company: s.speaker.company,
          bio: s.speaker.bio,
          photoUrl: s.speaker.photoUrl,
          linkedinUrl: s.speaker.linkedinUrl,
          createdAt: s.speaker.createdAt.toISOString(),
          updatedAt: s.speaker.updatedAt.toISOString(),
        })),
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
      },
      note: note?.note || null,
      createdAt: scheduleItem.createdAt.toISOString(),
    };
  }

  /**
   * Removes a session from the personal schedule
   */
  async removeSession(
    userId: string,
    eventId: string,
    sessionId: string,
  ): Promise<{ success: boolean; message: string }> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, eventId, deletedAt: null },
    });

    if (!session) {
      throw new NotFoundException('Session not found in this event');
    }

    const existing = await this.prisma.userSessionSchedule.findUnique({
      where: {
        userId_sessionId: {
          userId,
          sessionId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Session is not in your personal schedule');
    }

    await this.prisma.userSessionSchedule.delete({
      where: { id: existing.id },
    });

    return {
      success: true,
      message: 'Session removed from schedule successfully',
    };
  }

  /**
   * Lists all sessions in the attendee's personal schedule
   */
  async getSchedule(userId: string): Promise<ScheduleItemResponseDto[]> {
    const items = await this.prisma.userSessionSchedule.findMany({
      where: {
        userId,
        session: {
          deletedAt: null,
          event: { deletedAt: null },
        },
      },
      include: {
        session: {
          include: {
            venue: true,
            speakers: {
              include: { speaker: true },
              orderBy: { displayOrder: 'asc' },
            },
          },
        },
      },
      orderBy: { session: { startsAt: 'asc' } },
    });

    // Fetch user notes for these sessions in one batch
    const sessionIds = items.map((i) => i.sessionId);
    const notes = await this.prisma.userSessionNote.findMany({
      where: {
        userId,
        sessionId: { in: sessionIds },
      },
    });
    const noteMap = new Map(notes.map((n) => [n.sessionId, n.note]));

    return items.map((i) => ({
      id: i.id,
      userId: i.userId,
      sessionId: i.sessionId,
      session: {
        id: i.session.id,
        eventId: i.session.eventId,
        venueId: i.session.venueId,
        title: i.session.title,
        description: i.session.description,
        startsAt: i.session.startsAt.toISOString(),
        endsAt: i.session.endsAt.toISOString(),
        displayOrder: i.session.displayOrder,
        status: i.session.status,
        venue: i.session.venue
          ? {
              id: i.session.venue.id,
              eventId: i.session.venue.eventId,
              name: i.session.venue.name,
              description: i.session.venue.description,
              capacity: i.session.venue.capacity,
              floor: i.session.venue.floor,
              location: i.session.venue.location,
              createdAt: i.session.venue.createdAt.toISOString(),
              updatedAt: i.session.venue.updatedAt.toISOString(),
            }
          : null,
        speakers: i.session.speakers.map((s) => ({
          id: s.speaker.id,
          eventId: s.speaker.eventId,
          fullName: s.speaker.fullName,
          jobTitle: s.speaker.jobTitle,
          company: s.speaker.company,
          bio: s.speaker.bio,
          photoUrl: s.speaker.photoUrl,
          linkedinUrl: s.speaker.linkedinUrl,
          createdAt: s.speaker.createdAt.toISOString(),
          updatedAt: s.speaker.updatedAt.toISOString(),
        })),
        createdAt: i.session.createdAt.toISOString(),
        updatedAt: i.session.updatedAt.toISOString(),
      },
      note: noteMap.get(i.sessionId) || null,
      createdAt: i.createdAt.toISOString(),
    }));
  }

  /**
   * Saves or updates a personal note on a scheduled session (Section 37)
   */
  async saveNote(
    userId: string,
    eventId: string,
    sessionId: string,
    noteText: string,
  ): Promise<SessionNoteResponseDto> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, eventId, deletedAt: null },
    });

    if (!session) {
      throw new NotFoundException('Session not found in this event');
    }

    const noteRecord = await this.prisma.userSessionNote.upsert({
      where: {
        userId_sessionId: {
          userId,
          sessionId,
        },
      },
      update: {
        note: noteText.trim(),
      },
      create: {
        userId,
        sessionId,
        note: noteText.trim(),
      },
    });

    return {
      id: noteRecord.id,
      userId: noteRecord.userId,
      sessionId: noteRecord.sessionId,
      note: noteRecord.note,
      createdAt: noteRecord.createdAt.toISOString(),
      updatedAt: noteRecord.updatedAt.toISOString(),
    };
  }

  /**
   * Retrieves a personal note on a session
   */
  async getNote(
    userId: string,
    eventId: string,
    sessionId: string,
  ): Promise<SessionNoteResponseDto | null> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, eventId, deletedAt: null },
    });

    if (!session) {
      throw new NotFoundException('Session not found in this event');
    }

    const note = await this.prisma.userSessionNote.findUnique({
      where: {
        userId_sessionId: {
          userId,
          sessionId,
        },
      },
    });

    if (!note) {
      return null;
    }

    return {
      id: note.id,
      userId: note.userId,
      sessionId: note.sessionId,
      note: note.note,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    };
  }
}
