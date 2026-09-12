import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { AccountStatus, Prisma } from '@prisma/client';
import { ApprovalQueryDto } from '../dto/approval-query.dto';
import {
  ApprovalListItemDto,
  PaginatedApprovalsDto,
  ApprovalActionResponseDto,
} from '../dto/approval-response.dto';
import { AdminProfileDto } from '../../business-profiles/dto/profile-response.dto';

@Injectable()
export class AdminApprovalsService {
  private readonly logger = new Logger(AdminApprovalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
  ) {}

  /**
   * Retrieves paginated approval queue with filtering and search
   */
  async listApprovals(query: ApprovalQueryDto): Promise<PaginatedApprovalsDto> {
    const {
      status,
      role,
      search,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
    };

    if (status) {
      where.status = status;
    }

    if (role) {
      where.userRoles = {
        some: {
          role: {
            name: role,
          },
        },
      };
    }

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { sponsorProfile: { companyName: { contains: search, mode: 'insensitive' } } },
        { vendorProfile: { companyName: { contains: search, mode: 'insensitive' } } },
        { providerProfile: { businessName: { contains: search, mode: 'insensitive' } } },
        { eventOwnerProfile: { organizationName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const orderBy: Prisma.UserOrderByWithRelationInput = {};
    if (sortBy === 'email') {
      orderBy.email = sortOrder;
    } else if (sortBy === 'status') {
      orderBy.status = sortOrder;
    } else {
      orderBy.createdAt = sortOrder;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          userRoles: { include: { role: true } },
          sponsorProfile: true,
          vendorProfile: true,
          providerProfile: true,
          eventOwnerProfile: true,
          mediaProfile: true,
          organizerProfile: true,
          attendeeProfile: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const items: ApprovalListItemDto[] = users.map((u) => {
      const primaryRole = u.userRoles[0]?.role.name || 'UNKNOWN';
      const companyOrName =
        u.sponsorProfile?.companyName ||
        u.vendorProfile?.companyName ||
        u.providerProfile?.businessName ||
        u.eventOwnerProfile?.organizationName ||
        u.mediaProfile?.mediaOutlet ||
        (u.attendeeProfile
          ? `${u.attendeeProfile.firstName} ${u.attendeeProfile.lastName}`
          : null) ||
        (u.organizerProfile
          ? `${u.organizerProfile.firstName} ${u.organizerProfile.lastName}`
          : null) ||
        null;

      return {
        id: u.id,
        email: u.email,
        phone: u.phone,
        status: u.status,
        role: primaryRole,
        companyOrName,
        emailVerified: u.emailVerifiedAt !== null,
        createdAt: u.createdAt.toISOString(),
        approvedAt: u.approvedAt ? u.approvedAt.toISOString() : null,
        rejectedAt: u.rejectedAt ? u.rejectedAt.toISOString() : null,
        suspendedAt: u.suspendedAt ? u.suspendedAt.toISOString() : null,
      };
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Retrieves full profile and review details for an account
   */
  async getApprovalDetails(userId: string): Promise<AdminProfileDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        userRoles: { include: { role: true } },
        sponsorProfile: true,
        vendorProfile: true,
        providerProfile: true,
        eventOwnerProfile: true,
        organizerProfile: true,
        mediaProfile: true,
        attendeeProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Account not found');
    }

    const roles = user.userRoles.map((ur) => ur.role.name);
    const activeProfile =
      user.sponsorProfile ||
      user.vendorProfile ||
      user.providerProfile ||
      user.eventOwnerProfile ||
      user.organizerProfile ||
      user.mediaProfile ||
      user.attendeeProfile ||
      null;

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      status: user.status,
      roles,
      emailVerified: user.emailVerifiedAt !== null,
      emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
      approvedAt: user.approvedAt ? user.approvedAt.toISOString() : null,
      approvedByUserId: user.approvedByUserId,
      rejectedAt: user.rejectedAt ? user.rejectedAt.toISOString() : null,
      rejectionReason: user.rejectionReason,
      suspendedAt: user.suspendedAt ? user.suspendedAt.toISOString() : null,
      suspensionReason: user.suspensionReason,
      createdAt: user.createdAt.toISOString(),
      profile: activeProfile as Record<string, unknown> | null,
    };
  }

  /**
   * Approves a business account (Atomic, Idempotent, Audited, Outbox-backed)
   */
  async approveAccount(
    userId: string,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<ApprovalActionResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, deletedAt: null },
        include: { userRoles: { include: { role: true } } },
      });

      if (!user) {
        throw new NotFoundException('Account not found');
      }

      // Idempotency: repeated approve returns active status without duplicate side effects
      if (user.status === AccountStatus.ACTIVE) {
        return {
          success: true,
          message: 'Account is already approved and active',
          status: AccountStatus.ACTIVE,
          userId: user.id,
        };
      }

      if (user.status === AccountStatus.DEACTIVATED) {
        throw new BadRequestException('Cannot approve a deactivated account');
      }

      const previousStatus = user.status;
      const approvedAt = new Date();

      await tx.user.update({
        where: { id: userId },
        data: {
          status: AccountStatus.ACTIVE,
          approvedAt,
          approvedByUserId: adminId,
          rejectedAt: null,
          rejectionReason: null,
        },
      });

      const roleNames = user.userRoles.map((ur) => ur.role.name);

      await this.auditService.log({
        actorUserId: adminId,
        action: 'BUSINESS_ACCOUNT_APPROVED',
        resourceType: 'user',
        resourceId: userId,
        metadata: {
          previousStatus,
          newStatus: AccountStatus.ACTIVE,
          roles: roleNames,
        },
        ipAddress,
        userAgent,
      });

      await this.outboxService.enqueue(
        {
          eventType: 'ACCOUNT_APPROVED',
          aggregateType: 'User',
          aggregateId: userId,
          payload: {
            userId,
            email: user.email,
            roles: roleNames,
            approvedAt: approvedAt.toISOString(),
          },
        },
        tx,
      );

      this.logger.log(`Admin ${adminId} approved account ${userId} (${roleNames.join(', ')})`);

      return {
        success: true,
        message: 'Account approved successfully',
        status: AccountStatus.ACTIVE,
        userId: user.id,
      };
    });
  }

  /**
   * Rejects a business account (Atomic, Idempotent, Audited, Outbox-backed)
   */
  async rejectAccount(
    userId: string,
    adminId: string,
    reason: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<ApprovalActionResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, deletedAt: null },
        include: { userRoles: { include: { role: true } } },
      });

      if (!user) {
        throw new NotFoundException('Account not found');
      }

      // Idempotency: repeated reject with same reason returns status
      if (user.status === AccountStatus.REJECTED) {
        return {
          success: true,
          message: 'Account is already rejected',
          status: AccountStatus.REJECTED,
          userId: user.id,
        };
      }

      const previousStatus = user.status;
      const rejectedAt = new Date();

      await tx.user.update({
        where: { id: userId },
        data: {
          status: AccountStatus.REJECTED,
          rejectedAt,
          rejectionReason: reason,
        },
      });

      const roleNames = user.userRoles.map((ur) => ur.role.name);

      await this.auditService.log({
        actorUserId: adminId,
        action: 'BUSINESS_ACCOUNT_REJECTED',
        resourceType: 'user',
        resourceId: userId,
        metadata: {
          previousStatus,
          newStatus: AccountStatus.REJECTED,
          reason,
          roles: roleNames,
        },
        ipAddress,
        userAgent,
      });

      await this.outboxService.enqueue(
        {
          eventType: 'ACCOUNT_REJECTED',
          aggregateType: 'User',
          aggregateId: userId,
          payload: {
            userId,
            email: user.email,
            reason,
            roles: roleNames,
            rejectedAt: rejectedAt.toISOString(),
          },
        },
        tx,
      );

      this.logger.log(`Admin ${adminId} rejected account ${userId} with reason: ${reason}`);

      return {
        success: true,
        message: 'Account rejected successfully',
        status: AccountStatus.REJECTED,
        userId: user.id,
      };
    });
  }

  /**
   * Suspends an active account and revokes all active refresh tokens (Atomic, Audited, Outbox-backed)
   */
  async suspendAccount(
    userId: string,
    adminId: string,
    reason?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<ApprovalActionResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, deletedAt: null },
        include: { userRoles: { include: { role: true } } },
      });

      if (!user) {
        throw new NotFoundException('Account not found');
      }

      if (user.status === AccountStatus.SUSPENDED) {
        return {
          success: true,
          message: 'Account is already suspended',
          status: AccountStatus.SUSPENDED,
          userId: user.id,
        };
      }

      const previousStatus = user.status;
      const suspendedAt = new Date();

      await tx.user.update({
        where: { id: userId },
        data: {
          status: AccountStatus.SUSPENDED,
          suspendedAt,
          suspensionReason: reason || null,
        },
      });

      // Immediate session invalidation: revoke all active refresh tokens
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: {
          revokedAt: new Date(),
        },
      });

      const roleNames = user.userRoles.map((ur) => ur.role.name);

      await this.auditService.log({
        actorUserId: adminId,
        action: 'BUSINESS_ACCOUNT_SUSPENDED',
        resourceType: 'user',
        resourceId: userId,
        metadata: {
          previousStatus,
          newStatus: AccountStatus.SUSPENDED,
          reason,
          roles: roleNames,
        },
        ipAddress,
        userAgent,
      });

      await this.outboxService.enqueue(
        {
          eventType: 'ACCOUNT_SUSPENDED',
          aggregateType: 'User',
          aggregateId: userId,
          payload: {
            userId,
            email: user.email,
            reason: reason || 'Account suspended by administrator',
            roles: roleNames,
            suspendedAt: suspendedAt.toISOString(),
          },
        },
        tx,
      );

      this.logger.warn(`Admin ${adminId} suspended account ${userId}. Reason: ${reason || 'N/A'}`);

      return {
        success: true,
        message: 'Account suspended successfully and sessions revoked',
        status: AccountStatus.SUSPENDED,
        userId: user.id,
      };
    });
  }

  /**
   * Reactivates a suspended or rejected account back to ACTIVE
   */
  async reactivateAccount(
    userId: string,
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<ApprovalActionResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, deletedAt: null },
        include: { userRoles: { include: { role: true } } },
      });

      if (!user) {
        throw new NotFoundException('Account not found');
      }

      if (user.status !== AccountStatus.SUSPENDED && user.status !== AccountStatus.REJECTED) {
        throw new BadRequestException('Only suspended or rejected accounts can be reactivated');
      }

      const previousStatus = user.status;
      const reactivatedAt = new Date();

      await tx.user.update({
        where: { id: userId },
        data: {
          status: AccountStatus.ACTIVE,
          suspendedAt: null,
          suspensionReason: null,
          rejectedAt: null,
          rejectionReason: null,
          approvedAt: reactivatedAt,
          approvedByUserId: adminId,
        },
      });

      const roleNames = user.userRoles.map((ur) => ur.role.name);

      await this.auditService.log({
        actorUserId: adminId,
        action: 'BUSINESS_ACCOUNT_REACTIVATED',
        resourceType: 'user',
        resourceId: userId,
        metadata: {
          previousStatus,
          newStatus: AccountStatus.ACTIVE,
          roles: roleNames,
        },
        ipAddress,
        userAgent,
      });

      await this.outboxService.enqueue(
        {
          eventType: 'ACCOUNT_APPROVED',
          aggregateType: 'User',
          aggregateId: userId,
          payload: {
            userId,
            email: user.email,
            reactivated: true,
            roles: roleNames,
            approvedAt: reactivatedAt.toISOString(),
          },
        },
        tx,
      );

      this.logger.log(`Admin ${adminId} reactivated account ${userId}`);

      return {
        success: true,
        message: 'Account reactivated successfully',
        status: AccountStatus.ACTIVE,
        userId: user.id,
      };
    });
  }
}
