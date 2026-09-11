import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AccountStatus, EventStatus, RegistrationStatus } from '@prisma/client';
import { EventRegistrationService } from './event-registration.service';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { EventAuthorizationService } from './event-authorization.service';

describe('EventRegistrationService', () => {
  let service: EventRegistrationService;
  let prisma: {
    user: {
      findFirst: jest.Mock;
    };
    event: {
      findUnique: jest.Mock;
    };
    eventRegistration: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
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
  };

  const sampleUser = {
    id: 'user-att-1',
    email: 'attendee@innovent.app',
    status: AccountStatus.ACTIVE,
  };

  const sampleEvent = {
    id: 'evt-123',
    capacity: 100,
    status: EventStatus.PUBLISHED,
    deletedAt: null,
    endsAt: new Date(Date.now() + 86400000 * 5), // 5 days in future
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn(),
      },
      event: {
        findUnique: jest.fn(),
      },
      eventRegistration: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
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
      assertCanManageEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventRegistrationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: OutboxService, useValue: outboxService },
        { provide: EventAuthorizationService, useValue: eventAuthService },
      ],
    }).compile();

    service = module.get<EventRegistrationService>(EventRegistrationService);
  });

  describe('register', () => {
    it('should throw BadRequestException if user is not ACTIVE', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-att-1',
        status: AccountStatus.PENDING,
      });

      await expect(service.register('evt-123', 'user-att-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if event does not exist or is soft-deleted', async () => {
      prisma.user.findFirst.mockResolvedValue(sampleUser);
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.register('evt-missing', 'user-att-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if event is in DRAFT status', async () => {
      prisma.user.findFirst.mockResolvedValue(sampleUser);
      prisma.event.findUnique.mockResolvedValue({
        ...sampleEvent,
        status: EventStatus.DRAFT,
      });

      await expect(service.register('evt-123', 'user-att-1')).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if event is CANCELLED', async () => {
      prisma.user.findFirst.mockResolvedValue(sampleUser);
      prisma.event.findUnique.mockResolvedValue({
        ...sampleEvent,
        status: EventStatus.CANCELLED,
      });

      await expect(service.register('evt-123', 'user-att-1')).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if event has already ended', async () => {
      prisma.user.findFirst.mockResolvedValue(sampleUser);
      prisma.event.findUnique.mockResolvedValue({
        ...sampleEvent,
        endsAt: new Date(Date.now() - 10000),
      });

      await expect(service.register('evt-123', 'user-att-1')).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if user is already REGISTERED (duplicate registration)', async () => {
      prisma.user.findFirst.mockResolvedValue(sampleUser);
      prisma.event.findUnique.mockResolvedValue(sampleEvent);
      prisma.eventRegistration.findUnique.mockResolvedValue({
        id: 'reg-1',
        eventId: 'evt-123',
        userId: 'user-att-1',
        status: RegistrationStatus.REGISTERED,
      });

      await expect(service.register('evt-123', 'user-att-1')).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if event capacity is reached', async () => {
      prisma.user.findFirst.mockResolvedValue(sampleUser);
      prisma.event.findUnique.mockResolvedValue({
        ...sampleEvent,
        capacity: 10,
      });
      prisma.eventRegistration.findUnique.mockResolvedValue(null);
      prisma.eventRegistration.count.mockResolvedValue(10); // already at capacity

      await expect(service.register('evt-123', 'user-att-1')).rejects.toThrow(ConflictException);
    });

    it('should create registration when registering for the first time', async () => {
      prisma.user.findFirst.mockResolvedValue(sampleUser);
      prisma.event.findUnique.mockResolvedValue(sampleEvent);
      prisma.eventRegistration.findUnique.mockResolvedValue(null);
      prisma.eventRegistration.count.mockResolvedValue(5);
      prisma.eventRegistration.create.mockResolvedValue({
        id: 'reg-new-1',
        eventId: 'evt-123',
        userId: 'user-att-1',
        status: RegistrationStatus.REGISTERED,
        registeredAt: new Date(),
        cancelledAt: null,
      });

      const result = await service.register('evt-123', 'user-att-1');

      expect(result.id).toBe('reg-new-1');
      expect(result.status).toBe(RegistrationStatus.REGISTERED);
      expect(prisma.eventRegistration.create).toHaveBeenCalled();
      expect(outboxService.enqueue).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalled();
    });

    it('should reactivate existing cancelled record when re-registering (User Refinement 7)', async () => {
      prisma.user.findFirst.mockResolvedValue(sampleUser);
      prisma.event.findUnique.mockResolvedValue(sampleEvent);
      prisma.eventRegistration.findUnique.mockResolvedValue({
        id: 'reg-old-1',
        eventId: 'evt-123',
        userId: 'user-att-1',
        status: RegistrationStatus.CANCELLED,
      });
      prisma.eventRegistration.count.mockResolvedValue(5);
      prisma.eventRegistration.update.mockResolvedValue({
        id: 'reg-old-1',
        eventId: 'evt-123',
        userId: 'user-att-1',
        status: RegistrationStatus.REGISTERED,
        registeredAt: new Date(),
        cancelledAt: null,
      });

      const result = await service.register('evt-123', 'user-att-1');

      expect(result.id).toBe('reg-old-1');
      expect(result.status).toBe(RegistrationStatus.REGISTERED);
      expect(prisma.eventRegistration.update).toHaveBeenCalledWith({
        where: { id: 'reg-old-1' },
        data: {
          status: RegistrationStatus.REGISTERED,
          cancelledAt: null,
          registeredAt: expect.any(Date),
        },
      });
      expect(prisma.eventRegistration.create).not.toHaveBeenCalled();
      expect(outboxService.enqueue).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('should throw NotFoundException if no active registration exists', async () => {
      prisma.eventRegistration.findUnique.mockResolvedValue(null);

      await expect(service.cancel('evt-123', 'user-att-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if registration is already CANCELLED', async () => {
      prisma.eventRegistration.findUnique.mockResolvedValue({
        id: 'reg-1',
        status: RegistrationStatus.CANCELLED,
      });

      await expect(service.cancel('evt-123', 'user-att-1')).rejects.toThrow(NotFoundException);
    });

    it('should mark registration as CANCELLED and enqueue outbox event', async () => {
      prisma.eventRegistration.findUnique.mockResolvedValue({
        id: 'reg-1',
        eventId: 'evt-123',
        userId: 'user-att-1',
        status: RegistrationStatus.REGISTERED,
      });

      const result = await service.cancel('evt-123', 'user-att-1');

      expect(result.success).toBe(true);
      expect(prisma.eventRegistration.update).toHaveBeenCalledWith({
        where: { id: 'reg-1' },
        data: {
          status: RegistrationStatus.CANCELLED,
          cancelledAt: expect.any(Date),
        },
      });
      expect(outboxService.enqueue).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalled();
    });
  });
});
