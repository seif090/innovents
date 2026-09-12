import { Test, TestingModule } from '@nestjs/testing';
import { VendorServicesService } from './vendor-services.service';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AccountStatus, PricingModel, Prisma } from '@prisma/client';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('VendorServicesService', () => {
  let service: VendorServicesService;
  let prisma: {
    user: { findFirst: jest.Mock };
    vendorService: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
  };
  let auditService: { log: jest.Mock };

  const activeVendorUser = {
    id: 'vendor-1',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
    userRoles: [{ role: { name: 'VENDOR' } }],
  };

  const sampleService = {
    id: 'service-1',
    vendorId: 'vendor-1',
    name: 'Main Stage LED Screen',
    description: '4K Ultra HD Display',
    category: 'AV & Staging',
    pricingModel: PricingModel.DAILY,
    price: new Prisma.Decimal(5000),
    currency: 'SAR',
    deliveryDuration: '1 day',
    serviceAreas: ['Riyadh'],
    tags: ['led', 'screen'],
    minimumOrder: 1,
    isActive: true,
    createdAt: new Date('2026-09-12T10:00:00Z'),
    updatedAt: new Date('2026-09-12T10:00:00Z'),
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      user: { findFirst: jest.fn() },
      vendorService: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorServicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<VendorServicesService>(VendorServicesService);
  });

  describe('createService', () => {
    it('should allow active vendor to create service offering', async () => {
      prisma.user.findFirst.mockResolvedValue(activeVendorUser);
      prisma.vendorService.create.mockResolvedValue(sampleService);

      const dto = {
        name: 'Main Stage LED Screen',
        description: '4K Ultra HD Display',
        category: 'AV & Staging',
        pricingModel: PricingModel.DAILY,
        price: 5000,
        currency: 'SAR',
        deliveryDuration: '1 day',
        serviceAreas: ['Riyadh'],
        tags: ['led'],
        minimumOrder: 1,
        isActive: true,
      };

      const result = await service.createService('vendor-1', dto);

      expect(result.id).toBe('service-1');
      expect(result.name).toBe(dto.name);
      expect(result.price).toBe(5000);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SERVICE_CREATED', resourceType: 'vendor_service' }),
      );
    });

    it('should throw ForbiddenException if account is not active', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...activeVendorUser,
        status: AccountStatus.PENDING,
      });

      await expect(
        service.createService('vendor-1', {
          name: 'LED',
          description: 'Screen',
          category: 'AV',
          pricingModel: PricingModel.FIXED,
          price: 1000,
          deliveryDuration: '1 day',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if user lacks VENDOR role', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        status: AccountStatus.ACTIVE,
        deletedAt: null,
        userRoles: [{ role: { name: 'SPONSOR' } }],
      });

      await expect(
        service.createService('user-1', {
          name: 'LED',
          description: 'Screen',
          category: 'AV',
          pricingModel: PricingModel.FIXED,
          price: 1000,
          deliveryDuration: '1 day',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getMyServices', () => {
    it('should return paginated list of services for vendor', async () => {
      prisma.user.findFirst.mockResolvedValue(activeVendorUser);
      prisma.vendorService.findMany.mockResolvedValue([sampleService]);
      prisma.vendorService.count.mockResolvedValue(1);

      const result = await service.getMyServices('vendor-1', 1, 10);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.items[0]?.name).toBe('Main Stage LED Screen');
    });
  });

  describe('getMyServiceById', () => {
    it('should return service by ID', async () => {
      prisma.user.findFirst.mockResolvedValue(activeVendorUser);
      prisma.vendorService.findFirst.mockResolvedValue(sampleService);

      const result = await service.getMyServiceById('vendor-1', 'service-1');
      expect(result.id).toBe('service-1');
    });

    it('should throw NotFoundException if service is not found', async () => {
      prisma.user.findFirst.mockResolvedValue(activeVendorUser);
      prisma.vendorService.findFirst.mockResolvedValue(null);

      await expect(service.getMyServiceById('vendor-1', 's-999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateService', () => {
    it('should update service details when owned by caller', async () => {
      prisma.user.findFirst.mockResolvedValue(activeVendorUser);
      prisma.vendorService.findFirst.mockResolvedValue(sampleService);
      prisma.vendorService.update.mockResolvedValue({
        ...sampleService,
        price: new Prisma.Decimal(6000),
      });

      const result = await service.updateService('vendor-1', 'service-1', { price: 6000 });

      expect(result.price).toBe(6000);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SERVICE_UPDATED' }),
      );
    });

    it('should throw ForbiddenException if service belongs to another vendor', async () => {
      prisma.user.findFirst.mockResolvedValue(activeVendorUser);
      prisma.vendorService.findFirst.mockResolvedValue({
        ...sampleService,
        vendorId: 'vendor-other',
      });

      await expect(service.updateService('vendor-1', 'service-1', { price: 6000 })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('activate / deactivate', () => {
    it('should toggle active status and audit', async () => {
      prisma.user.findFirst.mockResolvedValue(activeVendorUser);
      prisma.vendorService.findFirst.mockResolvedValue(sampleService);
      prisma.vendorService.update.mockResolvedValue({
        ...sampleService,
        isActive: false,
      });

      const result = await service.deactivateService('vendor-1', 'service-1');
      expect(result.isActive).toBe(false);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SERVICE_DEACTIVATED' }),
      );
    });
  });

  describe('deleteService', () => {
    it('should soft delete service by setting deletedAt and isActive = false', async () => {
      prisma.user.findFirst.mockResolvedValue(activeVendorUser);
      prisma.vendorService.findFirst.mockResolvedValue(sampleService);
      prisma.vendorService.update.mockResolvedValue({
        ...sampleService,
        isActive: false,
        deletedAt: new Date(),
      });

      const result = await service.deleteService('vendor-1', 'service-1');
      expect(result.success).toBe(true);
      expect(prisma.vendorService.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'service-1' },
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });
  });
});
