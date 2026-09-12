import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AdminAuditQueryDto } from '../dto/admin-audit-query.dto';
import { AuditLogItemDto, PaginatedAuditLogsDto } from '../dto/admin-audit-response.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class AdminAuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAuditLogs(query: AdminAuditQueryDto): Promise<PaginatedAuditLogsDto> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};

    if (query.actorUserId) where.actorUserId = query.actorUserId;
    if (query.action) where.action = { contains: query.action, mode: 'insensitive' };
    if (query.resourceType) {
      where.resourceType = { contains: query.resourceType, mode: 'insensitive' };
    }
    if (query.resourceId) where.resourceId = query.resourceId;

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: { select: { id: true, email: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: items.map((log) => this.mapToItem(log)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAuditLogById(id: string): Promise<AuditLogItemDto> {
    const log = await this.prisma.auditLog.findUnique({
      where: { id },
      include: {
        actor: { select: { id: true, email: true } },
      },
    });

    if (!log) {
      throw new NotFoundException('Audit log entry not found');
    }

    return this.mapToItem(log);
  }

  private mapToItem(log: {
    id: string;
    actorUserId: string | null;
    action: string;
    resourceType: string;
    resourceId: string | null;
    metadata: Prisma.JsonValue | null;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
    actor?: { id: string; email: string } | null;
  }): AuditLogItemDto {
    return {
      id: log.id,
      actorUserId: log.actorUserId,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      metadata: (log.metadata as Record<string, unknown>) || null,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      createdAt: log.createdAt,
      actorEmail: log.actor?.email || null,
    };
  }
}
