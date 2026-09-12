import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AccountStatus, PricingModel, Prisma } from '@prisma/client';
import { CreateVendorServiceDto } from '../dto/create-vendor-service.dto';
import { UpdateVendorServiceDto } from '../dto/update-vendor-service.dto';
import {
  VendorServiceResponseDto,
  PaginatedVendorServicesDto,
} from '../dto/vendor-service-response.dto';

@Injectable()
export class VendorServicesService {
  private readonly logger = new Logger(VendorServicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Asserts that the caller is an ACTIVE Vendor account
   */
  private async assertActiveVendor(userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user) {
      throw new NotFoundException('Vendor account not found');
    }

    if (user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException(
        `Account is ${user.status}. Only active vendors can perform this action.`,
      );
    }

    const hasVendorRole = user.userRoles.some((ur) => ur.role.name === 'VENDOR');
    if (!hasVendorRole) {
      throw new ForbiddenException('Only users with the VENDOR role can manage vendor services.');
    }
  }

  /**
   * Creates a new service offering for the authenticated vendor
   */
  async createService(
    vendorId: string,
    dto: CreateVendorServiceDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<VendorServiceResponseDto> {
    await this.assertActiveVendor(vendorId);

    const created = await this.prisma.vendorService.create({
      data: {
        vendorId,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        pricingModel: dto.pricingModel,
        price: new Prisma.Decimal(dto.price),
        currency: dto.currency || 'SAR',
        deliveryDuration: dto.deliveryDuration,
        serviceAreas: dto.serviceAreas || [],
        tags: dto.tags || [],
        minimumOrder: dto.minimumOrder || 1,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
    });

    await this.auditService.log({
      actorUserId: vendorId,
      action: 'SERVICE_CREATED',
      resourceType: 'vendor_service',
      resourceId: created.id,
      metadata: { name: created.name, category: created.category, price: dto.price },
      ipAddress,
      userAgent,
    });

    this.logger.log(`Vendor ${vendorId} created service "${created.name}" (${created.id})`);
    return this.mapToResponse(created);
  }

  /**
   * Lists all services created by the authenticated vendor
   */
  async getMyServices(vendorId: string, page = 1, limit = 20): Promise<PaginatedVendorServicesDto> {
    await this.assertActiveVendor(vendorId);

    const boundedLimit = Math.min(Math.max(1, limit), 100);
    const skip = (Math.max(1, page) - 1) * boundedLimit;

    const [items, total] = await Promise.all([
      this.prisma.vendorService.findMany({
        where: { vendorId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip,
        take: boundedLimit,
      }),
      this.prisma.vendorService.count({
        where: { vendorId, deletedAt: null },
      }),
    ]);

    return {
      items: items.map((s) => this.mapToResponse(s)),
      total,
      page,
      limit: boundedLimit,
      totalPages: Math.ceil(total / boundedLimit) || 1,
    };
  }

  /**
   * Retrieves a specific service owned by the authenticated vendor
   */
  async getMyServiceById(vendorId: string, serviceId: string): Promise<VendorServiceResponseDto> {
    await this.assertActiveVendor(vendorId);

    const service = await this.prisma.vendorService.findFirst({
      where: { id: serviceId, vendorId, deletedAt: null },
    });

    if (!service) {
      throw new NotFoundException('Service not found or access denied');
    }

    return this.mapToResponse(service);
  }

  /**
   * Updates an existing service offering owned by the vendor
   */
  async updateService(
    vendorId: string,
    serviceId: string,
    dto: UpdateVendorServiceDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<VendorServiceResponseDto> {
    await this.assertActiveVendor(vendorId);

    const existing = await this.prisma.vendorService.findFirst({
      where: { id: serviceId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Service not found');
    }

    if (existing.vendorId !== vendorId) {
      throw new ForbiddenException('You do not have permission to modify this service');
    }

    const updateData: Prisma.VendorServiceUpdateInput = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.pricingModel !== undefined) updateData.pricingModel = dto.pricingModel;
    if (dto.price !== undefined) updateData.price = new Prisma.Decimal(dto.price);
    if (dto.currency !== undefined) updateData.currency = dto.currency;
    if (dto.deliveryDuration !== undefined) updateData.deliveryDuration = dto.deliveryDuration;
    if (dto.serviceAreas !== undefined) updateData.serviceAreas = dto.serviceAreas;
    if (dto.tags !== undefined) updateData.tags = dto.tags;
    if (dto.minimumOrder !== undefined) updateData.minimumOrder = dto.minimumOrder;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    const updated = await this.prisma.vendorService.update({
      where: { id: serviceId },
      data: updateData,
    });

    await this.auditService.log({
      actorUserId: vendorId,
      action: 'SERVICE_UPDATED',
      resourceType: 'vendor_service',
      resourceId: serviceId,
      metadata: { changedKeys: Object.keys(dto) },
      ipAddress,
      userAgent,
    });

    this.logger.log(`Vendor ${vendorId} updated service ${serviceId}`);
    return this.mapToResponse(updated);
  }

  /**
   * Activates a vendor service
   */
  async activateService(
    vendorId: string,
    serviceId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<VendorServiceResponseDto> {
    return this.updateServiceStatus(
      vendorId,
      serviceId,
      true,
      'SERVICE_ACTIVATED',
      ipAddress,
      userAgent,
    );
  }

  /**
   * Deactivates a vendor service
   */
  async deactivateService(
    vendorId: string,
    serviceId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<VendorServiceResponseDto> {
    return this.updateServiceStatus(
      vendorId,
      serviceId,
      false,
      'SERVICE_DEACTIVATED',
      ipAddress,
      userAgent,
    );
  }

  /**
   * Soft-deletes a vendor service offering
   */
  async deleteService(
    vendorId: string,
    serviceId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.assertActiveVendor(vendorId);

    const existing = await this.prisma.vendorService.findFirst({
      where: { id: serviceId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Service not found');
    }

    if (existing.vendorId !== vendorId) {
      throw new ForbiddenException('You do not have permission to delete this service');
    }

    await this.prisma.vendorService.update({
      where: { id: serviceId },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    await this.auditService.log({
      actorUserId: vendorId,
      action: 'SERVICE_DELETED',
      resourceType: 'vendor_service',
      resourceId: serviceId,
      ipAddress,
      userAgent,
    });

    this.logger.log(`Vendor ${vendorId} deleted service ${serviceId}`);
    return { success: true, message: 'Service deleted successfully' };
  }

  private async updateServiceStatus(
    vendorId: string,
    serviceId: string,
    isActive: boolean,
    action: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<VendorServiceResponseDto> {
    await this.assertActiveVendor(vendorId);

    const existing = await this.prisma.vendorService.findFirst({
      where: { id: serviceId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Service not found');
    }

    if (existing.vendorId !== vendorId) {
      throw new ForbiddenException('You do not have permission to update this service');
    }

    const updated = await this.prisma.vendorService.update({
      where: { id: serviceId },
      data: { isActive },
    });

    await this.auditService.log({
      actorUserId: vendorId,
      action,
      resourceType: 'vendor_service',
      resourceId: serviceId,
      metadata: { isActive },
      ipAddress,
      userAgent,
    });

    return this.mapToResponse(updated);
  }

  private mapToResponse(s: {
    id: string;
    vendorId: string;
    name: string;
    description: string;
    category: string;
    pricingModel: PricingModel;
    price: Prisma.Decimal;
    currency: string;
    deliveryDuration: string;
    serviceAreas: string[];
    tags: string[];
    minimumOrder: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  }): VendorServiceResponseDto {
    return {
      id: s.id,
      vendorId: s.vendorId,
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
      isActive: s.isActive,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      deletedAt: s.deletedAt ? s.deletedAt.toISOString() : null,
    };
  }
}
