import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventStatus, EventVisibility } from '@prisma/client';
import { EventAuthorizationService } from './event-authorization.service';
import { PrismaService } from '../../../database/prisma.service';

describe('EventAuthorizationService', () => {
  let service: EventAuthorizationService;
  let prisma: {
    event: {
      findFirst: jest.Mock;
    };
    eventOrganizer: {
      findUnique: jest.Mock;
    };
  };

  const sampleEvent = {
    id: 'evt-123',
    ownerId: 'user-owner-1',
    title: 'AI Summit 2026',
    slug: 'ai-summit-2026',
    status: EventStatus.DRAFT,
    visibility: EventVisibility.PUBLIC,
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      event: {
        findFirst: jest.fn(),
      },
      eventOrganizer: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventAuthorizationService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<EventAuthorizationService>(EventAuthorizationService);
  });

  describe('assertCanManageEvent', () => {
    it('should throw NotFoundException if event does not exist or is deleted', async () => {
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(
        service.assertCanManageEvent('user-1', ['ORGANIZER'], 'evt-missing'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow ADMIN even if not owner and not assigned organizer', async () => {
      prisma.event.findFirst.mockResolvedValue(sampleEvent);

      const result = await service.assertCanManageEvent('admin-user', ['ADMIN'], 'evt-123');
      expect(result).toEqual(sampleEvent);
      expect(prisma.eventOrganizer.findUnique).not.toHaveBeenCalled();
    });

    it('should allow event owner without querying eventOrganizer', async () => {
      prisma.event.findFirst.mockResolvedValue(sampleEvent);

      const result = await service.assertCanManageEvent('user-owner-1', ['ORGANIZER'], 'evt-123');
      expect(result).toEqual(sampleEvent);
      expect(prisma.eventOrganizer.findUnique).not.toHaveBeenCalled();
    });

    it('should allow assigned ORGANIZER', async () => {
      prisma.event.findFirst.mockResolvedValue(sampleEvent);
      prisma.eventOrganizer.findUnique.mockResolvedValue({
        id: 'eo-1',
        eventId: 'evt-123',
        userId: 'co-org-1',
      });

      const result = await service.assertCanManageEvent('co-org-1', ['ORGANIZER'], 'evt-123');
      expect(result).toEqual(sampleEvent);
      expect(prisma.eventOrganizer.findUnique).toHaveBeenCalledWith({
        where: {
          eventId_userId: {
            eventId: 'evt-123',
            userId: 'co-org-1',
          },
        },
      });
    });

    it('should throw ForbiddenException if user has ORGANIZER role but is not assigned', async () => {
      prisma.event.findFirst.mockResolvedValue(sampleEvent);
      prisma.eventOrganizer.findUnique.mockResolvedValue(null);

      await expect(
        service.assertCanManageEvent('unassigned-org', ['ORGANIZER'], 'evt-123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for ATTENDEE user', async () => {
      prisma.event.findFirst.mockResolvedValue(sampleEvent);

      await expect(
        service.assertCanManageEvent('attendee-1', ['ATTENDEE'], 'evt-123'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assertCanViewEvent', () => {
    it('should allow unauthenticated view of published public event', async () => {
      const publishedEvent = {
        ...sampleEvent,
        status: EventStatus.PUBLISHED,
        visibility: EventVisibility.PUBLIC,
      };
      prisma.event.findFirst.mockResolvedValue(publishedEvent);

      const result = await service.assertCanViewEvent('evt-123');
      expect(result).toEqual(publishedEvent);
    });

    it('should throw NotFoundException for unauthenticated view of draft event (anti-enumeration)', async () => {
      prisma.event.findFirst.mockResolvedValue(sampleEvent);

      await expect(service.assertCanViewEvent('evt-123')).rejects.toThrow(NotFoundException);
    });

    it('should allow owner to view draft event', async () => {
      prisma.event.findFirst.mockResolvedValue(sampleEvent);

      const result = await service.assertCanViewEvent('evt-123', 'user-owner-1', ['ORGANIZER']);
      expect(result).toEqual(sampleEvent);
    });

    it('should allow assigned organizer to view draft event', async () => {
      prisma.event.findFirst.mockResolvedValue(sampleEvent);
      prisma.eventOrganizer.findUnique.mockResolvedValue({
        id: 'eo-1',
        eventId: 'evt-123',
        userId: 'co-org-1',
      });

      const result = await service.assertCanViewEvent('evt-123', 'co-org-1', ['ORGANIZER']);
      expect(result).toEqual(sampleEvent);
    });

    it('should throw NotFoundException for regular attendee viewing draft event', async () => {
      prisma.event.findFirst.mockResolvedValue(sampleEvent);

      await expect(
        service.assertCanViewEvent('evt-123', 'attendee-1', ['ATTENDEE']),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
