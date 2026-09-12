import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { AdminUserQueryDto } from '../dto/admin-user-query.dto';
import {
  AdminUserSummaryDto,
  AdminUserDetailDto,
  PaginatedAdminUsersDto,
} from '../dto/admin-user-response.dto';
import { SuspendUserDto } from '../dto/suspend-user.dto';
import { DeactivateUserDto } from '../dto/deactivate-user.dto';
import { AccountStatus, Prisma } from '@prisma/client';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
  ) {}

  async listUsers(query: AdminUserQueryDto): Promise<PaginatedAdminUsersDto> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (query.status) where.status = query.status;

    if (query.emailVerified !== undefined) {
      where.emailVerifiedAt = query.emailVerified ? { not: null } : null;
    }

    if (query.role) {
      where.userRoles = {
        some: {
          role: {
            name: { equals: query.role, mode: 'insensitive' },
          },
        },
      };
    }

    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          userRoles: { include: { role: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map((u) => this.mapToSummary(u)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUserDetails(id: string): Promise<AdminUserDetailDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: { include: { role: true } },
        sponsorProfile: true,
        vendorProfile: true,
        providerProfile: true,
        attendeeProfile: true,
        eventOwnerProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.mapToDetail(user);
  }

  async activateUser(
    id: string,
    adminUserId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AdminUserDetailDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.user.update({
        where: { id },
        data: {
          status: AccountStatus.ACTIVE,
          approvedAt: user.approvedAt || new Date(),
          approvedByUserId: user.approvedByUserId || adminUserId,
        },
        include: { userRoles: { include: { role: true } } },
      });

      await this.outboxService.enqueue(
        {
          aggregateType: 'USER',
          aggregateId: id,
          eventType: 'USER_ACTIVATED',
          payload: { userId: id, adminUserId },
        },
        tx,
      );

      return res;
    });

    await this.auditService.log({
      action: 'USER_ACTIVATED',
      resourceType: 'USER',
      resourceId: id,
      actorUserId: adminUserId,
      metadata: { previousStatus: user.status, newStatus: AccountStatus.ACTIVE },
      ipAddress,
      userAgent,
    });

    return this.mapToDetail(updated);
  }

  async suspendUser(
    id: string,
    adminUserId: string,
    dto: SuspendUserDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AdminUserDetailDto> {
    if (id === adminUserId) {
      throw new BadRequestException(
        'Security Violation: Administrators cannot suspend their own account',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      // 1. Update user account status
      const res = await tx.user.update({
        where: { id },
        data: {
          status: AccountStatus.SUSPENDED,
          suspendedAt: new Date(),
          suspensionReason: dto.reason.trim(),
        },
        include: { userRoles: { include: { role: true } } },
      });

      // 2. Revoke active refresh tokens immediately
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // 3. Outbox notification
      await this.outboxService.enqueue(
        {
          aggregateType: 'USER',
          aggregateId: id,
          eventType: 'USER_SUSPENDED',
          payload: { userId: id, reason: dto.reason, adminUserId },
        },
        tx,
      );

      return res;
    });

    await this.auditService.log({
      action: 'USER_SUSPENDED',
      resourceType: 'USER',
      resourceId: id,
      actorUserId: adminUserId,
      metadata: { reason: dto.reason, previousStatus: user.status },
      ipAddress,
      userAgent,
    });

    return this.mapToDetail(updated);
  }

  async reactivateUser(
    id: string,
    adminUserId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AdminUserDetailDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.status !== AccountStatus.SUSPENDED && user.status !== AccountStatus.REJECTED) {
      throw new BadRequestException('User is not suspended or rejected');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.user.update({
        where: { id },
        data: {
          status: AccountStatus.ACTIVE,
          suspendedAt: null,
          suspensionReason: null,
        },
        include: { userRoles: { include: { role: true } } },
      });

      await this.outboxService.enqueue(
        {
          aggregateType: 'USER',
          aggregateId: id,
          eventType: 'USER_REACTIVATED',
          payload: { userId: id, adminUserId },
        },
        tx,
      );

      return res;
    });

    await this.auditService.log({
      action: 'USER_REACTIVATED',
      resourceType: 'USER',
      resourceId: id,
      actorUserId: adminUserId,
      metadata: { previousStatus: user.status },
      ipAddress,
      userAgent,
    });

    return this.mapToDetail(updated);
  }

  async deactivateUser(
    id: string,
    adminUserId: string,
    dto: DeactivateUserDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AdminUserDetailDto> {
    if (id === adminUserId) {
      throw new BadRequestException(
        'Security Violation: Administrators cannot deactivate their own account',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.user.update({
        where: { id },
        data: {
          status: AccountStatus.DEACTIVATED,
          deletedAt: new Date(),
        },
        include: { userRoles: { include: { role: true } } },
      });

      // Revoke sessions
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await this.outboxService.enqueue(
        {
          aggregateType: 'USER',
          aggregateId: id,
          eventType: 'USER_DEACTIVATED',
          payload: { userId: id, reason: dto.reason, adminUserId },
        },
        tx,
      );

      return res;
    });

    await this.auditService.log({
      action: 'USER_DEACTIVATED',
      resourceType: 'USER',
      resourceId: id,
      actorUserId: adminUserId,
      metadata: { reason: dto.reason, previousStatus: user.status },
      ipAddress,
      userAgent,
    });

    return this.mapToDetail(updated);
  }

  private mapToSummary(u: {
    id: string;
    email: string;
    phone: string | null;
    status: AccountStatus;
    emailVerifiedAt: Date | null;
    lastLoginAt: Date | null;
    createdAt: Date;
    userRoles?: Array<{ role?: { name?: string } }>;
  }): AdminUserSummaryDto {
    return {
      id: u.id,
      email: u.email,
      phone: u.phone,
      status: u.status,
      emailVerifiedAt: u.emailVerifiedAt,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      roles:
        u.userRoles?.map((ur) => ur.role?.name).filter((name): name is string => Boolean(name)) ||
        [],
    };
  }

  private mapToDetail(u: {
    id: string;
    email: string;
    phone: string | null;
    status: AccountStatus;
    emailVerifiedAt: Date | null;
    lastLoginAt: Date | null;
    createdAt: Date;
    userRoles?: Array<{ role?: { name?: string } }>;
    approvedAt: Date | null;
    rejectedAt: Date | null;
    rejectionReason: string | null;
    suspendedAt: Date | null;
    suspensionReason: string | null;
    deletedAt: Date | null;
    sponsorProfile?: unknown;
    vendorProfile?: unknown;
    providerProfile?: unknown;
    attendeeProfile?: unknown;
    eventOwnerProfile?: unknown;
  }): AdminUserDetailDto {
    const summary = this.mapToSummary(u);
    return {
      ...summary,
      approvedAt: u.approvedAt,
      rejectedAt: u.rejectedAt,
      rejectionReason: u.rejectionReason,
      suspendedAt: u.suspendedAt,
      suspensionReason: u.suspensionReason,
      deletedAt: u.deletedAt,
      profiles: {
        sponsorProfile: (u.sponsorProfile as Record<string, unknown>) || null,
        vendorProfile: (u.vendorProfile as Record<string, unknown>) || null,
        providerProfile: (u.providerProfile as Record<string, unknown>) || null,
        attendeeProfile: (u.attendeeProfile as Record<string, unknown>) || null,
        eventOwnerProfile: (u.eventOwnerProfile as Record<string, unknown>) || null,
      },
    };
  }
}
