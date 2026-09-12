import { Test, TestingModule } from '@nestjs/testing';
import { C2bBookingsService } from './c2b-bookings.service';
import { PrismaService } from '../../../database/prisma.service';
import { OutboxService } from '../../outbox/outbox.service';
import { AuditService } from '../../audit/audit.service';
import { AccountStatus, C2bBookingStatus, C2bServiceCategory, EventStatus } from '@prisma/client';
import { ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';

describe('C2bBookingsService', () => {
  let service: C2bBookingsService;
  let prisma: {
    c2bService: { findFirst: jest.Mock };
    c2bBooking: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let outboxService: { enqueue: jest.Mock };
  let auditService: { log: jest.Mock };

  const sampleService = {
    id: 'service-1',
    providerId: 'provider-1',
    eventId: 'event-1',
    name: 'Airport VIP Shuttle',
    category: C2bServiceCategory.TRANSPORTATION,
    isAvailable: true,
    expiresAt: new Date(Date.now() + 86400000 * 3),
    maxBookings: 2,
    bookingCount: 0,
    contactMethod: 'IN_APP',
    event: {
      id: 'event-1',
      endsAt: new Date(Date.now() + 86400000 * 5),
      status: EventStatus.PUBLISHED,
      deletedAt: null,
    },
    provider: {
      id: 'provider-1',
      status: AccountStatus.ACTIVE,
      providerProfile: { businessName: 'Riyadh Limo' },
    },
  };

  const sampleBooking = {
    id: 'booking-1',
    serviceId: 'service-1',
    attendeeId: 'attendee-1',
    providerId: 'provider-1',
    eventId: 'event-1',
    status: C2bBookingStatus.PENDING,
    notes: 'Please pick me up at 3pm',
    service: sampleService,
    provider: sampleService.provider,
    attendee: { email: 'attendee@innovent.app' },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      c2bService: {
        findFirst: jest.fn(),
      },
      c2bBooking: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => {
        const txPrisma = {
          $executeRaw: jest.fn().mockResolvedValue(1),
          c2bBooking: {
            create: jest.fn().mockResolvedValue(sampleBooking),
            update: jest.fn().mockResolvedValue({
              ...sampleBooking,
              status: C2bBookingStatus.CONFIRMED,
            }),
          },
        };
        return cb(txPrisma);
      }),
    };
    outboxService = { enqueue: jest.fn().mockResolvedValue(undefined) };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        C2bBookingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: OutboxService, useValue: outboxService },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<C2bBookingsService>(C2bBookingsService);
  });

  describe('createBooking', () => {
    it('should create booking and enqueue outbox notification when capacity is available', async () => {
      prisma.c2bService.findFirst.mockResolvedValue(sampleService);

      const result = await service.createBooking('attendee-1', {
        serviceId: 'service-1',
        notes: 'Arriving Terminal 2',
      });

      expect(result.id).toEqual('booking-1');
      expect(outboxService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'C2B_BOOKING_REQUESTED' }),
        expect.anything(),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'C2B_BOOKING_CREATED' }),
      );
    });

    it('should throw ConflictException if maxBookings capacity is exceeded', async () => {
      prisma.c2bService.findFirst.mockResolvedValue(sampleService);
      prisma.$transaction.mockImplementationOnce(async (cb: (tx: unknown) => unknown) => {
        const txPrisma = {
          $executeRaw: jest.fn().mockResolvedValue(0), // 0 rows updated because capacity reached
        };
        return cb(txPrisma);
      });

      await expect(service.createBooking('attendee-1', { serviceId: 'service-1' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException if service has expired', async () => {
      prisma.c2bService.findFirst.mockResolvedValue({
        ...sampleService,
        expiresAt: new Date(Date.now() - 10000),
      });

      await expect(service.createBooking('attendee-1', { serviceId: 'service-1' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateBookingStatus (Provider & IDOR)', () => {
    it('should allow assigned provider to confirm booking', async () => {
      prisma.c2bBooking.findFirst.mockResolvedValue(sampleBooking);

      const result = await service.updateBookingStatus('provider-1', 'booking-1', {
        status: C2bBookingStatus.CONFIRMED,
        providerNotes: 'Driver confirmed',
      });

      expect(result.status).toEqual(C2bBookingStatus.CONFIRMED);
      expect(outboxService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'C2B_BOOKING_STATUS_CHANGED' }),
        expect.anything(),
      );
    });

    it('should reject status update if caller is another provider (IDOR Defense)', async () => {
      prisma.c2bBooking.findFirst.mockResolvedValue(sampleBooking);

      await expect(
        service.updateBookingStatus('provider-2', 'booking-1', {
          status: C2bBookingStatus.CONFIRMED,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cancelBooking (Attendee & IDOR)', () => {
    it('should allow owner attendee to cancel booking', async () => {
      prisma.c2bBooking.findFirst.mockResolvedValue(sampleBooking);

      const result = await service.cancelBooking('attendee-1', 'booking-1');
      expect(result).toBeDefined();
    });

    it('should reject cancellation if caller is not the attendee (IDOR Defense)', async () => {
      prisma.c2bBooking.findFirst.mockResolvedValue(sampleBooking);

      await expect(service.cancelBooking('attendee-2', 'booking-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
