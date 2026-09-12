import { Test, TestingModule } from '@nestjs/testing';
import { C2bServicesService } from './c2b-services.service';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import {
  AccountStatus,
  C2bServiceCategory,
  EventStatus,
  EventVisibility,
  Prisma,
} from '@prisma/client';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

describe('C2bServicesService', () => {
  let service: C2bServicesService;
  let prisma: {
    user: { findFirst: jest.Mock };
    event: { findFirst: jest.Mock };
    c2bService: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
  };
  let auditService: { log: jest.Mock };

  const activeProviderUser = {
    id: 'provider-1',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
    userRoles: [{ role: { name: 'PROVIDER' } }],
  };

  const activeEvent = {
    id: 'event-1',
    status: EventStatus.PUBLISHED,
    visibility: EventVisibility.PUBLIC,
    endsAt: new Date(Date.now() + 86400000 * 5),
    deletedAt: null,
  };

  const sampleC2bService = {
    id: 'service-1',
    providerId: 'provider-1',
    eventId: 'event-1',
    name: '5-Star Hotel Booking',
    category: C2bServiceCategory.ACCOMMODATION,
    shortDescription: 'Luxury suite package',
    detailedDescription: 'Full amenities included',
    images: ['https://example.com/img.jpg'],
    price: new Prisma.Decimal(500),
    discountPercentage: 10,
    currency: 'SAR',
    expiresAt: new Date(Date.now() + 86400000 * 2),
    contactMethod: 'IN_APP',
    contactValue: null,
    promotionalCode: 'PROMO10',
    maxBookings: 20,
    bookingCount: 2,
    isAvailable: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    event: activeEvent,
    provider: {
      providerProfile: {
        businessName: 'Grand Hotel',
        logoUrl: 'https://example.com/logo.jpg',
      },
    },
  };

  beforeEach(async () => {
    prisma = {
      user: { findFirst: jest.fn() },
      event: { findFirst: jest.fn() },
      c2bService: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        C2bServicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<C2bServicesService>(C2bServicesService);
  });

  describe('createService', () => {
    it('should create a service when provider is active and event is valid', async () => {
      prisma.user.findFirst.mockResolvedValue(activeProviderUser);
      prisma.event.findFirst.mockResolvedValue(activeEvent);
      prisma.c2bService.create.mockResolvedValue(sampleC2bService);

      const dto = {
        eventId: 'event-1',
        name: '5-Star Hotel Booking',
        category: C2bServiceCategory.ACCOMMODATION,
        shortDescription: 'Luxury suite package',
        detailedDescription: 'Full amenities included',
        expiresAt: new Date(Date.now() + 86400000 * 2).toISOString(),
        contactMethod: 'IN_APP',
      };

      const result = await service.createService('provider-1', dto);
      expect(result.id).toEqual('service-1');
      expect(prisma.c2bService.create).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'C2B_SERVICE_CREATED' }),
      );
    });

    it('should reject service creation if provider is not active', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...activeProviderUser,
        status: AccountStatus.PENDING,
      });

      await expect(
        service.createService('provider-1', {
          eventId: 'event-1',
          name: 'Test',
          category: C2bServiceCategory.ACCOMMODATION,
          shortDescription: 'Test',
          detailedDescription: 'Test',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          contactMethod: 'IN_APP',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should clamp service expiresAt to event endsAt if exceeds', async () => {
      prisma.user.findFirst.mockResolvedValue(activeProviderUser);
      prisma.event.findFirst.mockResolvedValue(activeEvent);
      prisma.c2bService.create.mockResolvedValue(sampleC2bService);

      const farFuture = new Date(Date.now() + 86400000 * 30).toISOString();
      await service.createService('provider-1', {
        eventId: 'event-1',
        name: 'Test',
        category: C2bServiceCategory.ACCOMMODATION,
        shortDescription: 'Test',
        detailedDescription: 'Test',
        expiresAt: farFuture,
        contactMethod: 'IN_APP',
      });

      expect(prisma.c2bService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            expiresAt: activeEvent.endsAt,
          }),
        }),
      );
    });

    it('should reject service creation if event has already ended', async () => {
      prisma.user.findFirst.mockResolvedValue(activeProviderUser);
      prisma.event.findFirst.mockResolvedValue({
        ...activeEvent,
        endsAt: new Date(Date.now() - 10000),
      });

      await expect(
        service.createService('provider-1', {
          eventId: 'event-1',
          name: 'Test',
          category: C2bServiceCategory.ACCOMMODATION,
          shortDescription: 'Test',
          detailedDescription: 'Test',
          expiresAt: new Date(Date.now() + 10000).toISOString(),
          contactMethod: 'IN_APP',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateService (IDOR Protection)', () => {
    it('should allow owner to update service', async () => {
      prisma.user.findFirst.mockResolvedValue(activeProviderUser);
      prisma.c2bService.findFirst.mockResolvedValue(sampleC2bService);
      prisma.c2bService.update.mockResolvedValue({
        ...sampleC2bService,
        name: 'Updated Name',
      });

      const result = await service.updateService('provider-1', 'service-1', {
        name: 'Updated Name',
      });
      expect(result.name).toEqual('Updated Name');
    });

    it('should reject update if caller is another provider (IDOR Defense)', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...activeProviderUser,
        id: 'provider-2',
      });
      prisma.c2bService.findFirst.mockResolvedValue(sampleC2bService);

      await expect(
        service.updateService('provider-2', 'service-1', { name: 'Hacked' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteService', () => {
    it('should allow owner to soft delete service', async () => {
      prisma.user.findFirst.mockResolvedValue(activeProviderUser);
      prisma.c2bService.findFirst.mockResolvedValue(sampleC2bService);
      prisma.c2bService.update.mockResolvedValue({
        ...sampleC2bService,
        deletedAt: new Date(),
      });

      await service.deleteService('provider-1', 'service-1');
      expect(prisma.c2bService.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isAvailable: false }),
        }),
      );
    });
  });

  describe('discoverServices', () => {
    it('should filter only non-expired and active events', async () => {
      prisma.c2bService.count.mockResolvedValue(1);
      prisma.c2bService.findMany.mockResolvedValue([sampleC2bService]);

      const result = await service.discoverServices({ category: C2bServiceCategory.ACCOMMODATION });
      expect(result.total).toEqual(1);
      expect(prisma.c2bService.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isAvailable: true,
            deletedAt: null,
            expiresAt: expect.any(Object),
            event: expect.objectContaining({
              endsAt: expect.any(Object),
            }),
          }),
        }),
      );
    });
  });
});
