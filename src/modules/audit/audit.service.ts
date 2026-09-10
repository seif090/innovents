import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '@prisma/client';

export interface CreateAuditLogParams {
  actorUserId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(params: CreateAuditLogParams): Promise<void> {
    try {
      // Strip sensitive keys from metadata
      const sanitizedMeta = this.sanitizeMetadata(params.metadata);

      await this.prisma.auditLog.create({
        data: {
          actorUserId: params.actorUserId || null,
          action: params.action,
          resourceType: params.resourceType,
          resourceId: params.resourceId || null,
          metadata: sanitizedMeta as Prisma.InputJsonValue,
          ipAddress: params.ipAddress || null,
          userAgent: params.userAgent || null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to persist audit log: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private sanitizeMetadata(meta?: Record<string, unknown>): Record<string, unknown> {
    if (!meta) return {};
    const sanitized: Record<string, unknown> = {};
    const sensitive = ['password', 'token', 'secret', 'otp', 'authorization'];

    for (const [key, val] of Object.entries(meta)) {
      if (sensitive.some((s) => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = val;
      }
    }
    return sanitized;
  }
}
