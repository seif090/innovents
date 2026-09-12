/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AccountStatus, EventStatus, EventVisibility, Prisma } from '@prisma/client';
import { CreateC2bServiceDto } from '../dto/create-c2b-service.dto';
import { UpdateC2bServiceDto } from '../dto/update-c2b-service.dto';
import { C2bServiceResponseDto, PaginatedC2bServicesDto } from '../dto/c2b-service-response.dto';
import { C2bDiscoveryQueryDto } from '../dto/c2b-discovery-query.dto';

@Injectable()
export class C2bServicesService {
  private readonly logger = new Logger(C2bServicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Asserts that caller is an ACTIVE Provider account
   */
  async assertActiveProvider(userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user) {
      throw new NotFoundException('Provider account not found');
    }

    if (user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException(
        `Account is ${user.status}. Only active providers can perform this action.`,
      );
    }

    const hasProviderRole = user.userRoles.some((ur) => ur.role.name === 'PROVIDER');
    if (!hasProviderRole) {
      throw new ForbiddenException('Only users with the PROVIDER role can manage C2B services.');
    }
  }

  /**
   * Create a new C2B service offering scoped to an event
   */
  async createService(
    providerId: string,
    dto: CreateC2bServiceDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<C2bServiceResponseDto> {
    await this.assertActiveProvider(providerId);

    // Verify event exists and is valid
    const event = await this.prisma.event.findFirst({
      where: { id: dto.eventId, deletedAt: null },
    });

    if (!event) {
      throw new NotFoundException('Target event not found');
    }

    const now = new Date();
    if (event.endsAt <= now) {
      throw new BadRequestException('Cannot create services for an event that has already ended');
    }

    // Clamp expiration date so it never exceeds event.endsAt
    const requestedExpiresAt = new Date(dto.expiresAt);
    if (isNaN(requestedExpiresAt.getTime())) {
      throw new BadRequestException('Invalid expiration date format');
    }

    const clampedExpiresAt = requestedExpiresAt > event.endsAt ? event.endsAt : requestedExpiresAt;
    if (clampedExpiresAt <= now) {
      throw new BadRequestException('Expiration date must be in the future');
    }

    const created = await this.prisma.c2bService.create({
      data: {
        providerId,
        eventId: dto.eventId,
        name: dto.name,
        category: dto.category,
        shortDescription: dto.shortDescription,
        detailedDescription: dto.detailedDescription,
        images: dto.images || [],
        price: dto.price !== undefined ? new Prisma.Decimal(dto.price) : null,
        discountPercentage: dto.discountPercentage ?? null,
        currency: dto.currency || 'SAR',
        expiresAt: clampedExpiresAt,
        contactMethod: dto.contactMethod,
        contactValue: dto.contactValue,
        promotionalCode: dto.promotionalCode,
        maxBookings: dto.maxBookings ?? null,
        isAvailable: dto.isAvailable ?? true,
      },
      include: {
        provider: {
          include: {
            providerProfile: true,
          },
        },
      },
    });

    await this.auditService.log({
      actorUserId: providerId,
      action: 'C2B_SERVICE_CREATED',
      resourceType: 'c2b_service',
      resourceId: created.id,
      ipAddress,
      userAgent,
      metadata: {
        eventId: dto.eventId,
        name: dto.name,
        category: dto.category,
        expiresAt: clampedExpiresAt.toISOString(),
      },
    });

    this.logger.log(`C2B Service ${created.id} created by provider ${providerId}`);
    return this.mapToDto(created);
  }

  /**
   * Update an existing C2B service offering
   */
  async updateService(
    providerId: string,
    serviceId: string,
    dto: UpdateC2bServiceDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<C2bServiceResponseDto> {
    await this.assertActiveProvider(providerId);

    const service = await this.prisma.c2bService.findFirst({
      where: { id: serviceId, deletedAt: null },
      include: { event: true },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    if (service.providerId !== providerId) {
      throw new ForbiddenException('You are not authorized to update this service');
    }

    let clampedExpiresAt = service.expiresAt;
    if (dto.expiresAt) {
      const requestedExpiresAt = new Date(dto.expiresAt);
      if (isNaN(requestedExpiresAt.getTime())) {
        throw new BadRequestException('Invalid expiration date format');
      }
      clampedExpiresAt =
        requestedExpiresAt > service.event.endsAt ? service.event.endsAt : requestedExpiresAt;
    }

    const updated = await this.prisma.c2bService.update({
      where: { id: serviceId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.category && { category: dto.category }),
        ...(dto.shortDescription && { shortDescription: dto.shortDescription }),
        ...(dto.detailedDescription && { detailedDescription: dto.detailedDescription }),
        ...(dto.images && { images: dto.images }),
        ...(dto.price !== undefined && {
          price: dto.price !== null ? new Prisma.Decimal(dto.price) : null,
        }),
        ...(dto.discountPercentage !== undefined && {
          discountPercentage: dto.discountPercentage,
        }),
        ...(dto.currency && { currency: dto.currency }),
        ...(dto.expiresAt && { expiresAt: clampedExpiresAt }),
        ...(dto.contactMethod && { contactMethod: dto.contactMethod }),
        ...(dto.contactValue !== undefined && { contactValue: dto.contactValue }),
        ...(dto.promotionalCode !== undefined && { promotionalCode: dto.promotionalCode }),
        ...(dto.maxBookings !== undefined && { maxBookings: dto.maxBookings }),
        ...(dto.isAvailable !== undefined && { isAvailable: dto.isAvailable }),
      },
      include: {
        provider: {
          include: {
            providerProfile: true,
          },
        },
      },
    });

    await this.auditService.log({
      actorUserId: providerId,
      action: 'C2B_SERVICE_UPDATED',
      resourceType: 'c2b_service',
      resourceId: serviceId,
      ipAddress,
      userAgent,
      metadata: { changes: dto },
    });

    return this.mapToDto(updated);
  }

  /**
   * Soft delete a C2B service
   */
  async deleteService(
    providerId: string,
    serviceId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.assertActiveProvider(providerId);

    const service = await this.prisma.c2bService.findFirst({
      where: { id: serviceId, deletedAt: null },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    if (service.providerId !== providerId) {
      throw new ForbiddenException('You are not authorized to delete this service');
    }

    await this.prisma.c2bService.update({
      where: { id: serviceId },
      data: { deletedAt: new Date(), isAvailable: false },
    });

    await this.auditService.log({
      actorUserId: providerId,
      action: 'C2B_SERVICE_DELETED',
      resourceType: 'c2b_service',
      resourceId: serviceId,
      ipAddress,
      userAgent,
    });

    this.logger.log(`C2B Service ${serviceId} soft-deleted by provider ${providerId}`);
  }

  /**
   * Get provider's own services
   */
  async getProviderServices(
    providerId: string,
    page = 1,
    pageSize = 20,
  ): Promise<PaginatedC2bServicesDto> {
    await this.assertActiveProvider(providerId);

    const skip = (page - 1) * pageSize;
    const where: Prisma.C2bServiceWhereInput = {
      providerId,
      deletedAt: null,
    };

    const [total, services] = await Promise.all([
      this.prisma.c2bService.count({ where }),
      this.prisma.c2bService.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          provider: {
            include: { providerProfile: true },
          },
        },
      }),
    ]);

    return {
      items: services.map((s) => this.mapToDto(s)),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  /**
   * Get provider single service by ID
   */
  async getProviderServiceById(
    providerId: string,
    serviceId: string,
  ): Promise<C2bServiceResponseDto> {
    await this.assertActiveProvider(providerId);

    const service = await this.prisma.c2bService.findFirst({
      where: { id: serviceId, deletedAt: null },
      include: {
        provider: {
          include: { providerProfile: true },
        },
      },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    if (service.providerId !== providerId) {
      throw new ForbiddenException('You are not authorized to access this service');
    }

    return this.mapToDto(service);
  }

  /**
   * Public / Attendee multi-criteria discovery
   * Enforces event-end and service-expiration at the query level!
   */
  async discoverServices(query: C2bDiscoveryQueryDto): Promise<PaginatedC2bServicesDto> {
    const now = new Date();
    const page = query.page || 1;
    const pageSize = Math.min(query.pageSize || 20, 100);
    const skip = (page - 1) * pageSize;

    const where: Prisma.C2bServiceWhereInput = {
      deletedAt: null,
      isAvailable: true,
      expiresAt: { gt: now },
      event: {
        deletedAt: null,
        endsAt: { gt: now },
        status: { in: [EventStatus.PUBLISHED, EventStatus.ONGOING] },
        visibility: EventVisibility.PUBLIC,
      },
      provider: {
        deletedAt: null,
        status: AccountStatus.ACTIVE,
      },
    };

    if (query.eventId) {
      where.eventId = query.eventId;
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.providerId) {
      where.providerId = query.providerId;
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.price = {};
      if (query.minPrice !== undefined) {
        where.price.gte = new Prisma.Decimal(query.minPrice);
      }
      if (query.maxPrice !== undefined) {
        where.price.lte = new Prisma.Decimal(query.maxPrice);
      }
    }

    if (query.search) {
      const s = query.search;
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { shortDescription: { contains: s, mode: 'insensitive' } },
        { detailedDescription: { contains: s, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.C2bServiceOrderByWithRelationInput = {};
    if (query.sortBy === 'price') {
      orderBy.price = query.sortOrder || 'asc';
    } else if (query.sortBy === 'expiresAt') {
      orderBy.expiresAt = query.sortOrder || 'asc';
    } else {
      orderBy.createdAt = query.sortOrder || 'desc';
    }

    const [total, services] = await Promise.all([
      this.prisma.c2bService.count({ where }),
      this.prisma.c2bService.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        include: {
          provider: {
            include: { providerProfile: true },
          },
        },
      }),
    ]);

    // If availableNow requested, filter in-memory for remaining capacity if maxBookings is set
    let filtered = services;
    if (query.availableNow) {
      filtered = services.filter((s) => s.maxBookings === null || s.bookingCount < s.maxBookings);
    }

    return {
      items: filtered.map((s) => this.mapToDto(s)),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  /**
   * Public service details
   */
  async getServiceDetails(serviceId: string): Promise<C2bServiceResponseDto> {
    const now = new Date();
    const service = await this.prisma.c2bService.findFirst({
      where: {
        id: serviceId,
        deletedAt: null,
        isAvailable: true,
        expiresAt: { gt: now },
        event: {
          deletedAt: null,
          endsAt: { gt: now },
          status: { in: [EventStatus.PUBLISHED, EventStatus.ONGOING] },
          visibility: EventVisibility.PUBLIC,
        },
        provider: {
          deletedAt: null,
          status: AccountStatus.ACTIVE,
        },
      },
      include: {
        provider: {
          include: { providerProfile: true },
        },
      },
    });

    if (!service) {
      throw new NotFoundException('Service not found or unavailable');
    }

    return this.mapToDto(service);
  }

  /**
   * Helper mapper to sanitize and produce DTO
   */
  private mapToDto(service: any): C2bServiceResponseDto {
    const profile = service.provider?.providerProfile;
    return {
      id: service.id,
      providerId: service.providerId,
      eventId: service.eventId,
      name: service.name,
      category: service.category,
      shortDescription: service.shortDescription,
      detailedDescription: service.detailedDescription,
      images: service.images || [],
      price: service.price ? Number(service.price) : null,
      discountPercentage: service.discountPercentage,
      currency: service.currency,
      expiresAt: service.expiresAt,
      contactMethod: service.contactMethod,
      contactValue: service.contactValue,
      promotionalCode: service.promotionalCode,
      maxBookings: service.maxBookings,
      bookingCount: service.bookingCount,
      isAvailable: service.isAvailable,
      provider: profile
        ? {
            id: service.providerId,
            businessName: profile.businessName || 'Verified Provider',
            logoUrl: profile.logoUrl,
            providerType: profile.providerType,
            city: profile.city,
            country: profile.country,
          }
        : undefined,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
    };
  }
}
