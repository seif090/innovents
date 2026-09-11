import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AccountStatus, EventStatus, EventVisibility } from '@prisma/client';
import { EventsService } from './events.service';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { EventAuthorizationService } from './event-authorization.service';

describe('EventsService', () => {
  let service: EventsService;
  let prisma: {
    event: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
    user: {
      findFirst: jest.Mock;
    };
    session: {
      findMany: jest.Mock;
    };
    eventRegistration: {
      count: jest.Mock;
      findMany: jest.Mock;
    };
    eventOrganizer: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      upsert: jest.Mock;
      delete: jest.Mock;
    };
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
    id: 'evt-test-1',
    ownerId: 'user-owner-1',
    name: 'Tech Conference 2026',
    slug: 'tech-conference-2026',
    type: 'CONFERENCE',
    shortDescription: 'Short desc',
    description: 'Full description',
    startsAt: new Date('2026-10-01T09:00:00Z'),
    endsAt: new Date('2026-10-02T18:00:00Z'),
    venueName: 'Expo Hall',
    address: '123 Main St',
    city: 'Riyadh',
    country: 'Saudi Arabia',
    capacity: 500,
    coverImageUrl: 'https://example.com/cover.jpg',
    logoUrl: 'https://example.com/logo.jpg',
    mainVideoUrl: 'https://example.com/video.mp4',
    tags: ['Tech', 'AI'],
    officialLanguages: ['en', 'ar'],
    visibility: EventVisibility.PUBLIC,
    ticketType: 'FREE',
    websiteUrl: 'https://example.com',
    isHybrid: false,
    status: EventStatus.DRAFT,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      event: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
      session: {
        findMany: jest.fn(),
      },
      eventRegistration: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      eventOrganizer: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
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
        EventsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: OutboxService, useValue: outboxService },
        { provide: EventAuthorizationService, useValue: eventAuthService },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  describe('create', () => {
    const createDto = {
      name: 'Tech Conference 2026',
      type: 'CONFERENCE' as const,
      shortDescription: 'Short desc',
      description: 'Full description',
      startsAt: '2026-10-01T09:00:00Z',
      endsAt: '2026-10-02T18:00:00Z',
      venueName: 'Expo Hall',
      address: '123 Main St',
      city: 'Riyadh',
      country: 'Saudi Arabia',
      capacity: 500,
      coverImageUrl: 'https://example.com/cover.jpg',
      logoUrl: 'https://example.com/logo.jpg',
      mainVideoUrl: 'https://example.com/video.mp4',
      tags: ['Tech', 'AI'],
      officialLanguages: ['en', 'ar'],
    };

    it('should throw BadRequestException if startsAt >= endsAt', async () => {
      await expect(
        service.create('user-owner-1', {
          ...createDto,
          startsAt: '2026-10-05T00:00:00Z',
          endsAt: '2026-10-01T00:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if owner account is not ACTIVE', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-owner-1',
        status: AccountStatus.PENDING,
      });

      await expect(service.create('user-owner-1', createDto)).rejects.toThrow(BadRequestException);
    });

    it('should create event in DRAFT status, emit outbox, and log audit', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-owner-1',
        status: AccountStatus.ACTIVE,
      });
      prisma.event.create.mockResolvedValue(sampleEvent);

      const result = await service.create('user-owner-1', createDto);

      expect(result.id).toBe(sampleEvent.id);
      expect(result.status).toBe(EventStatus.DRAFT);
      expect(outboxService.enqueue).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should throw BadRequestException if proposed startsAt >= endsAt', async () => {
      await expect(
        service.update('evt-test-1', 'user-owner-1', ['ORGANIZER'], {
          startsAt: '2026-10-05T00:00:00Z',
          endsAt: '2026-10-01T00:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if date modification violates existing sessions', async () => {
      prisma.session.findMany.mockResolvedValue([
        {
          id: 'sess-1',
          title: 'Opening Keynote',
          startsAt: new Date('2026-09-30T09:00:00Z'),
          endsAt: new Date('2026-09-30T10:00:00Z'),
        },
      ]);

      await expect(
        service.update('evt-test-1', 'user-owner-1', ['ORGANIZER'], {
          startsAt: '2026-10-01T09:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if reducing capacity below active registered count', async () => {
      prisma.session.findMany.mockResolvedValue([]);
      prisma.eventRegistration.count.mockResolvedValue(150);

      await expect(
        service.update('evt-test-1', 'user-owner-1', ['ORGANIZER'], {
          capacity: 100,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should update event when valid', async () => {
      prisma.session.findMany.mockResolvedValue([]);
      prisma.eventRegistration.count.mockResolvedValue(50);
      prisma.event.update.mockResolvedValue({
        ...sampleEvent,
        name: 'Updated Conference Name',
      });

      const result = await service.update('evt-test-1', 'user-owner-1', ['ORGANIZER'], {
        name: 'Updated Conference Name',
      });

      expect(result.name).toBe('Updated Conference Name');
      expect(outboxService.enqueue).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalled();
    });
  });

  describe('publish', () => {
    it('should throw ConflictException if event is already published', async () => {
      eventAuthService.assertCanManageEvent.mockResolvedValue({
        ...sampleEvent,
        status: EventStatus.PUBLISHED,
      });

      await expect(service.publish('evt-test-1', 'user-owner-1', ['ORGANIZER'])).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException if event is cancelled or completed', async () => {
      eventAuthService.assertCanManageEvent.mockResolvedValue({
        ...sampleEvent,
        status: EventStatus.CANCELLED,
      });

      await expect(service.publish('evt-test-1', 'user-owner-1', ['ORGANIZER'])).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException if capacity is less than 1', async () => {
      eventAuthService.assertCanManageEvent.mockResolvedValue({
        ...sampleEvent,
        capacity: 0,
      });

      await expect(service.publish('evt-test-1', 'user-owner-1', ['ORGANIZER'])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should publish event, enqueue outbox, and log audit', async () => {
      prisma.event.update.mockResolvedValue({
        ...sampleEvent,
        status: EventStatus.PUBLISHED,
      });
      prisma.eventRegistration.count.mockResolvedValue(0);

      const result = await service.publish('evt-test-1', 'user-owner-1', ['ORGANIZER']);
      expect(result.status).toBe(EventStatus.PUBLISHED);
      expect(outboxService.enqueue).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('should throw ConflictException if event is already cancelled', async () => {
      eventAuthService.assertCanManageEvent.mockResolvedValue({
        ...sampleEvent,
        status: EventStatus.CANCELLED,
      });

      await expect(service.cancel('evt-test-1', 'user-owner-1', ['ORGANIZER'])).rejects.toThrow(
        ConflictException,
      );
    });

    it('should cancel event and emit outbox', async () => {
      prisma.event.update.mockResolvedValue({
        ...sampleEvent,
        status: EventStatus.CANCELLED,
      });
      prisma.eventRegistration.count.mockResolvedValue(0);

      const result = await service.cancel('evt-test-1', 'user-owner-1', ['ORGANIZER']);
      expect(result.status).toBe(EventStatus.CANCELLED);
      expect(outboxService.enqueue).toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('should mark deletedAt and set status to CANCELLED', async () => {
      await service.softDelete('evt-test-1', 'user-owner-1', ['ORGANIZER']);

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'evt-test-1' },
        data: expect.objectContaining({
          status: EventStatus.CANCELLED,
        }),
      });
      expect(outboxService.enqueue).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalled();
    });
  });

  describe('assignOrganizer (Refinement 1 & 2)', () => {
    it('should throw BadRequestException if owner attempts to assign themselves', async () => {
      await expect(
        service.assignOrganizer('evt-test-1', 'user-owner-1', ['ORGANIZER'], {
          userId: 'user-owner-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if target user does not exist', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.assignOrganizer('evt-test-1', 'user-owner-1', ['ORGANIZER'], {
          userId: 'user-missing',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if target user is not ACTIVE', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-org-2',
        status: AccountStatus.SUSPENDED,
        userRoles: [{ role: { name: 'ORGANIZER' } }],
      });

      await expect(
        service.assignOrganizer('evt-test-1', 'user-owner-1', ['ORGANIZER'], {
          userId: 'user-org-2',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if target user does not have ORGANIZER role', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-att-1',
        status: AccountStatus.ACTIVE,
        userRoles: [{ role: { name: 'ATTENDEE' } }],
      });

      await expect(
        service.assignOrganizer('evt-test-1', 'user-owner-1', ['ORGANIZER'], {
          userId: 'user-att-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully assign organizer if target user is ACTIVE and has ORGANIZER role', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-org-2',
        email: 'org2@innovent.app',
        status: AccountStatus.ACTIVE,
        userRoles: [{ role: { name: 'ORGANIZER' } }],
      });
      prisma.eventOrganizer.upsert.mockResolvedValue({
        id: 'eo-1',
        eventId: 'evt-test-1',
        userId: 'user-org-2',
        assignedBy: 'user-owner-1',
        assignedAt: new Date(),
      });

      const result = await service.assignOrganizer('evt-test-1', 'user-owner-1', ['ORGANIZER'], {
        userId: 'user-org-2',
      });

      expect(result.userId).toBe('user-org-2');
      expect(result.email).toBe('org2@innovent.app');
      expect(auditService.log).toHaveBeenCalled();
    });
  });

  describe('removeOrganizer', () => {
    it('should throw NotFoundException if assignment does not exist', async () => {
      prisma.eventOrganizer.findUnique.mockResolvedValue(null);

      await expect(
        service.removeOrganizer('evt-test-1', 'user-owner-1', ['ORGANIZER'], 'user-org-missing'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should delete organizer assignment and log audit', async () => {
      prisma.eventOrganizer.findUnique.mockResolvedValue({
        id: 'eo-1',
        eventId: 'evt-test-1',
        userId: 'user-org-2',
      });

      await service.removeOrganizer('evt-test-1', 'user-owner-1', ['ORGANIZER'], 'user-org-2');
      expect(prisma.eventOrganizer.delete).toHaveBeenCalledWith({
        where: { id: 'eo-1' },
      });
      expect(auditService.log).toHaveBeenCalled();
    });
  });
});
