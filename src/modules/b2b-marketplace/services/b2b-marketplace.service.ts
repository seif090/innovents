import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AccountStatus, Prisma } from '@prisma/client';
import {
  MarketplaceSearchQueryDto,
  VendorDiscoveryQueryDto,
} from '../dto/marketplace-search-query.dto';
import {
  MarketplaceServiceItemDto,
  PaginatedMarketplaceServicesDto,
  PublicVendorSummaryDto,
  PaginatedVendorsDto,
} from '../dto/marketplace-response.dto';

@Injectable()
export class B2bMarketplaceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Discovers active services offered by ACTIVE approved vendors
   */
  async discoverServices(
    query: MarketplaceSearchQueryDto,
  ): Promise<PaginatedMarketplaceServicesDto> {
    const {
      search,
      category,
      serviceArea,
      tag,
      vendorId,
      minPrice,
      maxPrice,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const boundedLimit = Math.min(Math.max(1, limit), 100);
    const skip = (Math.max(1, page) - 1) * boundedLimit;

    // Filter enforces: Service is active, not deleted, and Vendor is active and not deleted
    const where: Prisma.VendorServiceWhereInput = {
      isActive: true,
      deletedAt: null,
      vendor: {
        status: AccountStatus.ACTIVE,
        deletedAt: null,
      },
    };

    if (category) {
      where.category = { equals: category, mode: 'insensitive' };
    }

    if (vendorId) {
      where.vendorId = vendorId;
    }

    if (tag) {
      where.tags = { has: tag };
    }

    if (serviceArea) {
      where.serviceAreas = { has: serviceArea };
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) where.price.gte = new Prisma.Decimal(minPrice);
      if (maxPrice !== undefined) where.price.lte = new Prisma.Decimal(maxPrice);
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { vendor: { vendorProfile: { companyName: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const orderBy: Prisma.VendorServiceOrderByWithRelationInput = {};
    if (sortBy === 'price') {
      orderBy.price = sortOrder;
    } else if (sortBy === 'name') {
      orderBy.name = sortOrder;
    } else {
      orderBy.createdAt = sortOrder;
    }

    const [services, total] = await Promise.all([
      this.prisma.vendorService.findMany({
        where,
        skip,
        take: boundedLimit,
        orderBy,
        include: {
          vendor: {
            select: {
              id: true,
              vendorProfile: {
                select: {
                  companyName: true,
                  logoUrl: true,
                  serviceCategory: true,
                  city: true,
                  country: true,
                  website: true,
                  description: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.vendorService.count({ where }),
    ]);

    const items: MarketplaceServiceItemDto[] = services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      pricingModel: s.pricingModel,
      price: s.price.toNumber(),
      currency: s.currency,
      deliveryDuration: s.deliveryDuration,
      serviceAreas: s.serviceAreas,
      tags: s.tags,
      minimumOrder: s.minimumOrder,
      createdAt: s.createdAt.toISOString(),
      vendor: {
        id: s.vendor.id,
        companyName: s.vendor.vendorProfile?.companyName || 'Vendor Company',
        logoUrl: s.vendor.vendorProfile?.logoUrl || null,
        serviceCategory: s.vendor.vendorProfile?.serviceCategory || s.category,
        city: s.vendor.vendorProfile?.city || null,
        country: s.vendor.vendorProfile?.country || null,
        website: s.vendor.vendorProfile?.website || null,
        description: s.vendor.vendorProfile?.description || null,
      },
    }));

    return {
      items,
      total,
      page,
      limit: boundedLimit,
      totalPages: Math.ceil(total / boundedLimit) || 1,
    };
  }

  /**
   * Retrieves single public service details
   */
  async getServiceDetails(serviceId: string): Promise<MarketplaceServiceItemDto> {
    const service = await this.prisma.vendorService.findFirst({
      where: {
        id: serviceId,
        isActive: true,
        deletedAt: null,
        vendor: {
          status: AccountStatus.ACTIVE,
          deletedAt: null,
        },
      },
      include: {
        vendor: {
          select: {
            id: true,
            vendorProfile: {
              select: {
                companyName: true,
                logoUrl: true,
                serviceCategory: true,
                city: true,
                country: true,
                website: true,
                description: true,
              },
            },
          },
        },
      },
    });

    if (!service) {
      throw new NotFoundException('Service not found or unavailable');
    }

    return {
      id: service.id,
      name: service.name,
      description: service.description,
      category: service.category,
      pricingModel: service.pricingModel,
      price: service.price.toNumber(),
      currency: service.currency,
      deliveryDuration: service.deliveryDuration,
      serviceAreas: service.serviceAreas,
      tags: service.tags,
      minimumOrder: service.minimumOrder,
      createdAt: service.createdAt.toISOString(),
      vendor: {
        id: service.vendor.id,
        companyName: service.vendor.vendorProfile?.companyName || 'Vendor Company',
        logoUrl: service.vendor.vendorProfile?.logoUrl || null,
        serviceCategory: service.vendor.vendorProfile?.serviceCategory || service.category,
        city: service.vendor.vendorProfile?.city || null,
        country: service.vendor.vendorProfile?.country || null,
        website: service.vendor.vendorProfile?.website || null,
        description: service.vendor.vendorProfile?.description || null,
      },
    };
  }

  /**
   * Discovers active approved Vendors
   */
  async discoverVendors(query: VendorDiscoveryQueryDto): Promise<PaginatedVendorsDto> {
    const { search, serviceCategory, city, country, page = 1, limit = 20 } = query;
    const boundedLimit = Math.min(Math.max(1, limit), 100);
    const skip = (Math.max(1, page) - 1) * boundedLimit;

    const where: Prisma.UserWhereInput = {
      status: AccountStatus.ACTIVE,
      deletedAt: null,
      userRoles: {
        some: {
          role: {
            name: 'VENDOR',
          },
        },
      },
    };

    const profileFilter: Prisma.VendorProfileWhereInput = {};

    if (serviceCategory) {
      profileFilter.serviceCategory = { equals: serviceCategory, mode: 'insensitive' };
    }

    if (city) {
      profileFilter.city = { equals: city, mode: 'insensitive' };
    }

    if (country) {
      profileFilter.country = { equals: country, mode: 'insensitive' };
    }

    if (search) {
      profileFilter.OR = [
        { companyName: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { serviceCategory: { contains: search, mode: 'insensitive' } },
      ];
    }

    where.vendorProfile = {
      isNot: null,
      ...(Object.keys(profileFilter).length > 0 ? { is: profileFilter } : {}),
    };

    const [vendors, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: boundedLimit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          vendorProfile: {
            select: {
              companyName: true,
              logoUrl: true,
              serviceCategory: true,
              city: true,
              country: true,
              website: true,
              description: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const items: PublicVendorSummaryDto[] = vendors.map((v) => ({
      id: v.id,
      companyName: v.vendorProfile?.companyName || 'Vendor Company',
      logoUrl: v.vendorProfile?.logoUrl || null,
      serviceCategory: v.vendorProfile?.serviceCategory || 'Vendor',
      city: v.vendorProfile?.city || null,
      country: v.vendorProfile?.country || null,
      website: v.vendorProfile?.website || null,
      description: v.vendorProfile?.description || null,
    }));

    return {
      items,
      total,
      page,
      limit: boundedLimit,
      totalPages: Math.ceil(total / boundedLimit) || 1,
    };
  }

  /**
   * Retrieves single vendor public profile
   */
  async getVendorDetails(vendorId: string): Promise<PublicVendorSummaryDto> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: vendorId,
        status: AccountStatus.ACTIVE,
        deletedAt: null,
        userRoles: {
          some: {
            role: {
              name: 'VENDOR',
            },
          },
        },
      },
      select: {
        id: true,
        vendorProfile: {
          select: {
            companyName: true,
            logoUrl: true,
            serviceCategory: true,
            city: true,
            country: true,
            website: true,
            description: true,
          },
        },
      },
    });

    if (!user || !user.vendorProfile) {
      throw new NotFoundException('Vendor not found');
    }

    return {
      id: user.id,
      companyName: user.vendorProfile.companyName,
      logoUrl: user.vendorProfile.logoUrl || null,
      serviceCategory: user.vendorProfile.serviceCategory,
      city: user.vendorProfile.city || null,
      country: user.vendorProfile.country || null,
      website: user.vendorProfile.website || null,
      description: user.vendorProfile.description || null,
    };
  }
}
