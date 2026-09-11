import { Test, TestingModule } from '@nestjs/testing';
import { ReminderProcessor } from './reminder.processor';
import { NotificationOrchestratorService } from '../services/notification-orchestrator.service';
import { NotificationType } from '@prisma/client';

describe('ReminderProcessor', () => {
  let processor: ReminderProcessor;
  let orchestrator: { orchestrate: jest.Mock };

  beforeEach(async () => {
    orchestrator = { orchestrate: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderProcessor,
        { provide: NotificationOrchestratorService, useValue: orchestrator },
      ],
    }).compile();

    processor = module.get<ReminderProcessor>(ReminderProcessor);
  });

  it('should process session reminder with deterministic idempotencyKey', async () => {
    await processor.processSessionReminder({
      userId: 'user-1',
      sessionId: 'sess-1',
      eventId: 'evt-1',
      sessionTitle: 'Keynote',
      startsAt: '2026-09-12T10:00:00Z',
      venueName: 'Hall A',
    });

    expect(orchestrator.orchestrate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: NotificationType.SESSION_REMINDER,
        idempotencyKey: 'session-reminder:user-1:sess-1',
      }),
    );
  });

  it('should process meetup reminder with deterministic idempotencyKey', async () => {
    await processor.processMeetupReminder({
      userId: 'user-2',
      meetupId: 'meetup-1',
      communityId: 'comm-1',
      meetupTitle: 'Dev Coffee',
      startsAt: '2026-09-12T11:00:00Z',
    });

    expect(orchestrator.orchestrate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-2',
        type: NotificationType.COMMUNITY_MEETUP_REMINDER,
        idempotencyKey: 'meetup-reminder:user-2:meetup-1',
      }),
    );
  });
});
