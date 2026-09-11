import { Test, TestingModule } from '@nestjs/testing';
import { NotificationOrchestratorService } from './notification-orchestrator.service';
import { PrismaService } from '../../../database/prisma.service';
import { QueueService } from '../../../infrastructure/queue/queue.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationType, NotificationChannel, NotificationStatus } from '@prisma/client';
import { QUEUE_NAMES } from '../../../infrastructure/queue/queue.constants';

describe('NotificationOrchestratorService', () => {
  let service: NotificationOrchestratorService;
  let prisma: {
    notification: {
      upsert: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let preferenceService: {
    shouldDeliver: jest.Mock;
  };
  let queueService: {
    addJob: jest.Mock;
  };

  const userId = '11111111-1111-1111-1111-111111111111';

  beforeEach(async () => {
    prisma = {
      notification: {
        upsert: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    preferenceService = {
      shouldDeliver: jest.fn(),
    };
    queueService = {
      addJob: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationOrchestratorService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationPreferenceService, useValue: preferenceService },
        { provide: QueueService, useValue: queueService },
      ],
    }).compile();

    service = module.get<NotificationOrchestratorService>(NotificationOrchestratorService);
  });

  it('should orchestrate multi-channel notification and dispatch BullMQ jobs', async () => {
    preferenceService.shouldDeliver.mockResolvedValue(true);
    prisma.notification.upsert.mockImplementation(({ create }) =>
      Promise.resolve({
        id: 'notif-1',
        ...create,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const notifications = await service.orchestrate({
      userId,
      type: NotificationType.SESSION_REMINDER,
      title: 'Session Reminder',
      body: 'Your session begins soon',
      idempotencyKey: 'session-reminder:user1:sess1',
      channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    });

    expect(notifications.length).toBe(2);
    expect(prisma.notification.upsert).toHaveBeenCalledTimes(2);

    // Check BullMQ jobs were enqueued to appropriate queues
    expect(queueService.addJob).toHaveBeenCalledWith(
      QUEUE_NAMES.NOTIFICATIONS,
      'deliver-notification',
      expect.objectContaining({ notificationId: 'notif-1' }),
      expect.any(Object),
    );
    expect(queueService.addJob).toHaveBeenCalledWith(
      QUEUE_NAMES.EMAIL,
      'deliver-email',
      expect.objectContaining({ notificationId: 'notif-1' }),
      expect.any(Object),
    );
  });

  it('should suppress channels when preference resolution returns false', async () => {
    // IN_APP allowed, EMAIL suppressed
    preferenceService.shouldDeliver.mockImplementation((_uid, _type, channel) => {
      return Promise.resolve(channel === NotificationChannel.IN_APP);
    });

    prisma.notification.upsert.mockResolvedValue({
      id: 'notif-1',
      userId,
      type: NotificationType.COMMUNITY_POST_MENTION,
      channel: NotificationChannel.IN_APP,
      status: NotificationStatus.PENDING,
    });

    const notifications = await service.orchestrate({
      userId,
      type: NotificationType.COMMUNITY_POST_MENTION,
      title: 'New Mention',
      body: 'Someone mentioned you',
      idempotencyKey: 'mention:1:user1',
      channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    });

    expect(notifications.length).toBe(1);
    expect(notifications[0]?.channel).toBe(NotificationChannel.IN_APP);
    expect(queueService.addJob).toHaveBeenCalledTimes(1);
  });
});
