import { Test, TestingModule } from '@nestjs/testing';
import { B2bMarketplaceService } from './b2b-marketplace.service';
import { PrismaService } from '../../../database/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { PricingModel, Prisma } from '@prisma/client';

describe('B2bMarketplaceService', () => {
  let service: B2bMarketplaceService;
  let prisma: {
    vendorService: { findMany: jest.Mock; count: jest.Mock; findFirst: jest.Mock };
    user: { findMany: jest.Mock; count: jest.Mock; findFirst: jest.Mock };
  };

  const samplePublicService = {
    id: 's-1',
    name: 'Concert Sound System',
    description: 'Line array sound setup',
    category: 'Audio',
    pricingModel: PricingModel.DAILY,
    price: new Prisma.Decimal(8000),
    currency: 'SAR',
    deliveryDuration: '1 day',
    serviceAreas: ['Riyadh'],
    tags: ['audio', 'concert'],
    minimumOrder: 1,
    createdAt: new Date('2026-09-12T10:00:00Z'),
    vendor: {
      id: 'v-1',
      vendorProfile: {
        companyName: 'Apex Audio Ltd',
        logoUrl: 'https://cdn.example.com/logo.png',
        serviceCategory: 'Audio & Visual',
        city: 'Riyadh',
        country: 'Saudi Arabia',
        website: 'https://apexaudio.com',
        description: 'Premier audio supplier',
      },
    },
  };

  beforeEach(async () => {
    prisma = {
      vendorService: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
      user: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [B2bMarketplaceService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<B2bMarketplaceService>(B2bMarketplaceService);
  });

  describe('discoverServices', () => {
    it('should search and return paginated services with vendor cards', async () => {
      prisma.vendorService.findMany.mockResolvedValue([samplePublicService]);
      prisma.vendorService.count.mockResolvedValue(1);

      const result = await service.discoverServices({
        search: 'Sound',
        category: 'Audio',
        page: 1,
        limit: 20,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.vendor.companyName).toBe('Apex Audio Ltd');
      expect(result.items[0]?.price).toBe(8000);
    });
  });

  describe('getServiceDetails', () => {
    it('should return service details when active and available', async () => {
      prisma.vendorService.findFirst.mockResolvedValue(samplePublicService);

      const result = await service.getServiceDetails('s-1');

      expect(result.id).toBe('s-1');
      expect(result.vendor.companyName).toBe('Apex Audio Ltd');
    });

    it('should throw NotFoundException if service is not found or vendor inactive', async () => {
      prisma.vendorService.findFirst.mockResolvedValue(null);

      await expect(service.getServiceDetails('s-non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('discoverVendors', () => {
    it('should return paginated list of verified vendors', async () => {
      const mockVendor = {
        id: 'v-1',
        vendorProfile: {
          companyName: 'Apex Audio Ltd',
          logoUrl: null,
          serviceCategory: 'Audio & Visual',
          city: 'Riyadh',
          country: 'Saudi Arabia',
          website: null,
          description: 'Sound equipment provider',
        },
      };

      prisma.user.findMany.mockResolvedValue([mockVendor]);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.discoverVendors({ city: 'Riyadh' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.companyName).toBe('Apex Audio Ltd');
    });
  });
});
