import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { SessionsService } from './sessions.service';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { EventAuthorizationService } from './event-authorization.service';

describe('SessionsService', () => {
  let service: SessionsService;
  let prisma: {
    session: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    venue: {
      findFirst: jest.Mock;
    };
    speaker: {
      findMany: jest.Mock;
    };
    sessionSpeaker: {
      deleteMany: jest.Mock;
      createMany: jest.Mock;
    };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let auditService: {
    log: jest.Mock;
  };
  let outboxService: {
    enqueue: jest.Mock;
  };
  let eventAuthService: {
    assertCanManageEvent: jest.Mock;
    assertCanViewEvent: jest.Mock;
  };

  const sampleEvent = {
    id: 'evt-100',
    ownerId: 'user-owner-1',
    startsAt: new Date('2026-10-01T08:00:00Z'),
    endsAt: new Date('2026-10-03T18:00:00Z'),
  };

  const sampleSession = {
    id: 'sess-1',
    eventId: 'evt-100',
    venueId: 'ven-1',
    title: 'Keynote: Future of AI',
    description: 'Deep dive into generative models',
    startsAt: new Date('2026-10-01T09:00:00Z'),
    endsAt: new Date('2026-10-01T10:30:00Z'),
    displayOrder: 0,
    status: SessionStatus.SCHEDULED,
    deletedAt: null,
    venue: {
      id: 'ven-1',
      eventId: 'evt-100',
      name: 'Main Auditorium',
      capacity: 300,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    speakers: [],
  };

  beforeEach(async () => {
    prisma = {
      session: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      venue: {
        findFirst: jest.fn(),
      },
      speaker: {
        findMany: jest.fn(),
      },
      sessionSpeaker: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      $queryRaw: jest.fn().mockRejectedValue(new Error('raw query mock fallback')),
      $transaction: jest.fn().mockImplementation(async (callback) => callback(prisma)),
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    outboxService = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    };

    eventAuthService = {
      assertCanManageEvent: jest.fn().mockResolvedValue(sampleEvent),
      assertCanViewEvent: jest.fn().mockResolvedValue(sampleEvent),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: OutboxService, useValue: outboxService },
        { provide: EventAuthorizationService, useValue: eventAuthService },
      ],
    }).compile();

    service = module.get<SessionsService>(SessionsService);
  });

  describe('create', () => {
    const createDto = {
      title: 'Keynote: Future of AI',
      startsAt: '2026-10-01T09:00:00Z',
      endsAt: '2026-10-01T10:30:00Z',
      venueId: 'ven-1',
      speakerIds: ['spk-1'],
    };

    it('should throw BadRequestException if startsAt >= endsAt', async () => {
      await expect(
        service.create('evt-100', 'user-owner-1', ['ORGANIZER'], {
          ...createDto,
          startsAt: '2026-10-01T11:00:00Z',
          endsAt: '2026-10-01T10:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if session falls outside parent event dates', async () => {
      await expect(
        service.create('evt-100', 'user-owner-1', ['ORGANIZER'], {
          ...createDto,
          startsAt: '2026-09-30T09:00:00Z',
          endsAt: '2026-09-30T10:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if assigned venue does not belong to this event', async () => {
      prisma.venue.findFirst.mockResolvedValue(null);

      await expect(
        service.create('evt-100', 'user-owner-1', ['ORGANIZER'], createDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if assigned speaker does not belong to this event', async () => {
      prisma.venue.findFirst.mockResolvedValue({ id: 'ven-1', eventId: 'evt-100' });
      prisma.speaker.findMany.mockResolvedValue([]); // speaker not found

      await expect(
        service.create('evt-100', 'user-owner-1', ['ORGANIZER'], createDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if another session overlaps in the same venue', async () => {
      prisma.venue.findFirst.mockResolvedValue({ id: 'ven-1', eventId: 'evt-100' });
      prisma.speaker.findMany.mockResolvedValue([{ id: 'spk-1', eventId: 'evt-100' }]);
      prisma.session.findFirst.mockResolvedValue({
        id: 'sess-existing',
        title: 'Overlapping Session',
      });

      await expect(
        service.create('evt-100', 'user-owner-1', ['ORGANIZER'], createDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should create session successfully when validation passes', async () => {
      prisma.venue.findFirst.mockResolvedValue({ id: 'ven-1', eventId: 'evt-100' });
      prisma.speaker.findMany.mockResolvedValue([{ id: 'spk-1', eventId: 'evt-100' }]);
      prisma.session.findFirst.mockResolvedValue(null); // no overlap
      prisma.session.create.mockResolvedValue(sampleSession);

      const result = await service.create('evt-100', 'user-owner-1', ['ORGANIZER'], createDto);

      expect(result.id).toBe(sampleSession.id);
      expect(result.title).toBe(sampleSession.title);
      expect(outboxService.enqueue).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalled();
    });
  });

  describe('findById (Aggregate boundary check)', () => {
    it('should throw NotFoundException if session does not belong to this event', async () => {
      prisma.session.findFirst.mockResolvedValue(null);

      await expect(
        service.findById('evt-100', 'sess-from-other-event', 'user-owner-1', ['ORGANIZER']),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return session when found in this event', async () => {
      prisma.session.findFirst.mockResolvedValue(sampleSession);

      const result = await service.findById('evt-100', 'sess-1', 'user-owner-1', ['ORGANIZER']);
      expect(result.id).toBe('sess-1');
    });
  });

  describe('reorder', () => {
    it('should throw BadRequestException if any session does not belong to the event', async () => {
      prisma.session.findMany.mockResolvedValue([{ id: 'sess-1' }]); // only 1 returned, but 2 submitted

      await expect(
        service.reorder('evt-100', 'user-owner-1', ['ORGANIZER'], {
          sessionIds: ['sess-1', 'sess-foreign'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reorder sessions atomically in a transaction', async () => {
      prisma.session.findMany.mockResolvedValue([{ id: 'sess-1' }, { id: 'sess-2' }]);

      await service.reorder('evt-100', 'user-owner-1', ['ORGANIZER'], {
        sessionIds: ['sess-2', 'sess-1'],
      });

      expect(prisma.session.update).toHaveBeenCalledTimes(2);
      expect(outboxService.enqueue).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should mark session as deleted and cancelled', async () => {
      prisma.session.findFirst.mockResolvedValue(sampleSession);

      await service.delete('evt-100', 'sess-1', 'user-owner-1', ['ORGANIZER']);

      expect(prisma.session.update).toHaveBeenCalledWith({
        where: { id: 'sess-1' },
        data: expect.objectContaining({
          status: SessionStatus.CANCELLED,
        }),
      });
      expect(outboxService.enqueue).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalled();
    });
  });
});
