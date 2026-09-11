import { Test, TestingModule } from '@nestjs/testing';
import { OutboxProcessor } from './outbox.processor';
import { PrismaService } from '../../../database/prisma.service';
import { NotificationOrchestratorService } from '../services/notification-orchestrator.service';
import { NotificationFanoutService } from '../services/notification-fanout.service';
import { ConfigService } from '@nestjs/config';
import { OutboxStatus, NotificationType } from '@prisma/client';

describe('OutboxProcessor', () => {
  let processor: OutboxProcessor;
  let prisma: {
    outboxEvent: {
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    communityPost: {
      findUnique: jest.Mock;
    };
    communityMember: {
      findMany: jest.Mock;
    };
    eventRegistration: {
      findMany: jest.Mock;
    };
    $queryRaw: jest.Mock;
  };
  let orchestrator: { orchestrate: jest.Mock };
  let fanout: { fanoutToUsers: jest.Mock };

  beforeEach(async () => {
    prisma = {
      outboxEvent: {
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      communityPost: { findUnique: jest.fn() },
      communityMember: { findMany: jest.fn() },
      eventRegistration: { findMany: jest.fn() },
      $queryRaw: jest.fn(),
    };
    orchestrator = { orchestrate: jest.fn().mockResolvedValue([]) };
    fanout = { fanoutToUsers: jest.fn().mockResolvedValue(5) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationOrchestratorService, useValue: orchestrator },
        { provide: NotificationFanoutService, useValue: fanout },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, defaultVal: unknown) => {
              if (key === 'notifications.maxDeliveryAttempts') return 5;
              if (key === 'notifications.outboxBatchSize') return 50;
              return defaultVal;
            }),
          },
        },
      ],
    }).compile();

    processor = module.get<OutboxProcessor>(OutboxProcessor);
  });

  it('should recover stale processing outbox events', async () => {
    prisma.outboxEvent.findMany.mockResolvedValue([
      {
        id: 'stale-1',
        attempts: 1,
        status: OutboxStatus.PROCESSING,
        processingStartedAt: new Date(Date.now() - 10 * 60 * 1000), // 10m ago
      },
    ]);

    const recoveredCount = await processor.recoverStaleProcessing();

    expect(recoveredCount).toBe(1);
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'stale-1' },
      data: expect.objectContaining({ status: OutboxStatus.PENDING }),
    });
  });

  it('should claim pending outbox events, dispatch notification, and mark as PROCESSED', async () => {
    prisma.outboxEvent.findMany.mockResolvedValue([]); // for recovery
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'outbox-1',
        event_type: 'COMMUNITY_MENTION_CREATED',
        aggregate_type: 'COMMUNITY_MENTION',
        aggregate_id: 'mention-1',
        payload: {
          mentionedUserId: 'user-2',
          actorName: 'Alice',
        },
        attempts: 0,
      },
    ]);

    const count = await processor.processBatch();

    expect(count).toBe(1);
    expect(orchestrator.orchestrate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-2',
        type: NotificationType.COMMUNITY_POST_MENTION,
        idempotencyKey: 'community-mention:mention-1:user-2',
      }),
    );
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'outbox-1' },
      data: expect.objectContaining({ status: OutboxStatus.PROCESSED }),
    });
  });

  it('should move outbox event to DEAD_LETTER after exceeding maximum attempts', async () => {
    prisma.outboxEvent.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'outbox-fail',
        event_type: 'COMMUNITY_MENTION_CREATED',
        aggregate_type: 'COMMUNITY_MENTION',
        aggregate_id: 'mention-fail',
        payload: { mentionedUserId: 'user-2' },
        attempts: 4, // Next will be 5 (max)
      },
    ]);
    orchestrator.orchestrate.mockRejectedValue(new Error('Fatal error'));

    await processor.processBatch();

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'outbox-fail' },
      data: expect.objectContaining({
        status: OutboxStatus.DEAD_LETTER,
        attempts: 5,
      }),
    });
  });
});
