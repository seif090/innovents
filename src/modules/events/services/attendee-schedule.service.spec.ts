import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventStatus, SessionStatus } from '@prisma/client';
import { AttendeeScheduleService } from './attendee-schedule.service';
import { PrismaService } from '../../../database/prisma.service';
import { QueueService } from '../../../infrastructure/queue/queue.service';
import { OutboxService } from '../../outbox/outbox.service';

describe('AttendeeScheduleService', () => {
  let service: AttendeeScheduleService;
  let prisma: {
    session: {
      findFirst: jest.Mock;
    };
    userSessionSchedule: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
    };
    userSessionNote: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      upsert: jest.Mock;
    };
  };
  let queueService: {
    addJob: jest.Mock;
  };
  let outboxService: {
    enqueue: jest.Mock;
  };

  const sampleSession = {
    id: 'sess-1',
    eventId: 'evt-1',
    title: 'Keynote',
    description: 'Intro to AI',
    status: SessionStatus.SCHEDULED,
    startsAt: new Date(Date.now() + 3600000), // 1 hour in future
    endsAt: new Date(Date.now() + 7200000),
    displayOrder: 0,
    venueId: null,
    venue: null,
    speakers: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    event: {
      id: 'evt-1',
      status: EventStatus.PUBLISHED,
      deletedAt: null,
    },
  };

  beforeEach(async () => {
    prisma = {
      session: {
        findFirst: jest.fn(),
      },
      userSessionSchedule: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
      userSessionNote: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
    };

    queueService = {
      addJob: jest.fn().mockResolvedValue({ id: 'job-123' }),
    };

    outboxService = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendeeScheduleService,
        { provide: PrismaService, useValue: prisma },
        { provide: QueueService, useValue: queueService },
        { provide: OutboxService, useValue: outboxService },
      ],
    }).compile();

    service = module.get<AttendeeScheduleService>(AttendeeScheduleService);
  });

  describe('addSession', () => {
    it('should throw NotFoundException if session does not exist in event', async () => {
      prisma.session.findFirst.mockResolvedValue(null);

      await expect(service.addSession('user-1', 'evt-1', 'sess-missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if session is CANCELLED (User Refinement 8)', async () => {
      prisma.session.findFirst.mockResolvedValue({
        ...sampleSession,
        status: SessionStatus.CANCELLED,
      });

      await expect(service.addSession('user-1', 'evt-1', 'sess-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException if parent event is DRAFT (User Refinement 8)', async () => {
      prisma.session.findFirst.mockResolvedValue({
        ...sampleSession,
        event: {
          id: 'evt-1',
          status: EventStatus.DRAFT,
          deletedAt: null,
        },
      });

      await expect(service.addSession('user-1', 'evt-1', 'sess-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException if parent event is CANCELLED (User Refinement 8)', async () => {
      prisma.session.findFirst.mockResolvedValue({
        ...sampleSession,
        event: {
          id: 'evt-1',
          status: EventStatus.CANCELLED,
          deletedAt: null,
        },
      });

      await expect(service.addSession('user-1', 'evt-1', 'sess-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should add session and schedule 15m reminder with idempotent jobId (User Refinement 9)', async () => {
      prisma.session.findFirst.mockResolvedValue(sampleSession);
      prisma.userSessionSchedule.upsert.mockResolvedValue({
        id: 'uss-1',
        userId: 'user-1',
        sessionId: 'sess-1',
        createdAt: new Date(),
      });
      prisma.userSessionNote.findUnique.mockResolvedValue(null);

      const result = await service.addSession('user-1', 'evt-1', 'sess-1');

      expect(result.sessionId).toBe('sess-1');
      expect(queueService.addJob).toHaveBeenCalledWith(
        expect.any(String),
        'send-session-reminder',
        expect.objectContaining({
          userId: 'user-1',
          sessionId: 'sess-1',
        }),
        expect.objectContaining({
          jobId: 'session-reminder:user-1:sess-1',
        }),
      );
      expect(outboxService.enqueue).toHaveBeenCalled();
    });
  });

  describe('removeSession', () => {
    it('should throw NotFoundException if session not found in event', async () => {
      prisma.session.findFirst.mockResolvedValue(null);

      await expect(service.removeSession('user-1', 'evt-1', 'sess-missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if session is not in schedule', async () => {
      prisma.session.findFirst.mockResolvedValue(sampleSession);
      prisma.userSessionSchedule.findUnique.mockResolvedValue(null);

      await expect(service.removeSession('user-1', 'evt-1', 'sess-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should delete from schedule successfully', async () => {
      prisma.session.findFirst.mockResolvedValue(sampleSession);
      prisma.userSessionSchedule.findUnique.mockResolvedValue({ id: 'uss-1' });

      const result = await service.removeSession('user-1', 'evt-1', 'sess-1');

      expect(result.success).toBe(true);
      expect(prisma.userSessionSchedule.delete).toHaveBeenCalledWith({
        where: { id: 'uss-1' },
      });
    });
  });

  describe('saveNote', () => {
    it('should throw NotFoundException if session not found in event', async () => {
      prisma.session.findFirst.mockResolvedValue(null);

      await expect(
        service.saveNote('user-1', 'evt-1', 'sess-missing', 'My private note'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should upsert note successfully', async () => {
      prisma.session.findFirst.mockResolvedValue(sampleSession);
      prisma.userSessionNote.upsert.mockResolvedValue({
        id: 'usn-1',
        userId: 'user-1',
        sessionId: 'sess-1',
        note: 'Important session to attend',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.saveNote(
        'user-1',
        'evt-1',
        'sess-1',
        'Important session to attend',
      );

      expect(result.note).toBe('Important session to attend');
      expect(prisma.userSessionNote.upsert).toHaveBeenCalled();
    });
  });
});
