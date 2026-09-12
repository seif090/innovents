import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CreateReportDto } from '../dto/create-report.dto';
import { ReportQueryDto } from '../dto/report-query.dto';
import { ResolveReportDto } from '../dto/resolve-report.dto';
import { ReportResponseDto, PaginatedReportsDto } from '../dto/report-response.dto';
import { Prisma, ReportStatus, ReportTargetType } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createReport(
    reporterId: string,
    dto: CreateReportDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<ReportResponseDto> {
    // 1. Target Validation: verify target exists and is reportable
    await this.validateTargetExistence(dto.targetType, dto.targetId);

    // 2. Duplicate Defense: Check for existing active report (OPEN or IN_REVIEW) by same user
    const existingActive = await this.prisma.report.findFirst({
      where: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        status: { in: [ReportStatus.OPEN, ReportStatus.IN_REVIEW] },
      },
    });

    if (existingActive) {
      throw new ConflictException(
        'An active report submitted by you is already under review for this resource',
      );
    }

    // 3. Create Report record
    const report = await this.prisma.report.create({
      data: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason.trim(),
        description: dto.description?.trim() || null,
        status: ReportStatus.OPEN,
      },
      include: {
        reporter: { select: { id: true, email: true } },
      },
    });

    // 4. Immutable Audit Trail
    await this.auditService.log({
      action: 'REPORT_SUBMITTED',
      resourceType: 'REPORT',
      resourceId: report.id,
      actorUserId: reporterId,
      metadata: {
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
      },
      ipAddress,
      userAgent,
    });

    return this.mapToResponse(report);
  }

  async getMyReports(userId: string, query: ReportQueryDto): Promise<PaginatedReportsDto> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ReportWhereInput = {
      reporterId: userId,
    };

    if (query.status) where.status = query.status;
    if (query.targetType) where.targetType = query.targetType;

    const [items, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.report.count({ where }),
    ]);

    return {
      items: items.map((r) => this.mapToResponse(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAdminReports(query: ReportQueryDto): Promise<PaginatedReportsDto> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ReportWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.targetType) where.targetType = query.targetType;
    if (query.reporterId) where.reporterId = query.reporterId;

    const [items, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: { select: { id: true, email: true } },
          resolvedBy: { select: { id: true, email: true } },
        },
      }),
      this.prisma.report.count({ where }),
    ]);

    return {
      items: items.map((r) => this.mapToResponse(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAdminReportById(id: string): Promise<ReportResponseDto> {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        reporter: { select: { id: true, email: true } },
        resolvedBy: { select: { id: true, email: true } },
      },
    });

    if (!report) {
      throw new NotFoundException('Report record not found');
    }

    return this.mapToResponse(report);
  }

  async resolveReport(
    id: string,
    adminUserId: string,
    dto: ResolveReportDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<ReportResponseDto> {
    const report = await this.prisma.report.findUnique({
      where: { id },
    });

    if (!report) {
      throw new NotFoundException('Report record not found');
    }

    // Explicit valid state transitions
    if (report.status === ReportStatus.RESOLVED || report.status === ReportStatus.DISMISSED) {
      throw new BadRequestException('Report is already closed and cannot be modified');
    }

    if (dto.status === ReportStatus.OPEN) {
      throw new BadRequestException('Cannot transition a report back to OPEN status');
    }

    const updated = await this.prisma.report.update({
      where: { id },
      data: {
        status: dto.status,
        resolvedByUserId: adminUserId,
        resolvedAt: dto.status === ReportStatus.IN_REVIEW ? null : new Date(),
        resolutionNote: dto.resolutionNote?.trim() || null,
      },
      include: {
        reporter: { select: { id: true, email: true } },
        resolvedBy: { select: { id: true, email: true } },
      },
    });

    await this.auditService.log({
      action: 'REPORT_RESOLVED',
      resourceType: 'REPORT',
      resourceId: report.id,
      actorUserId: adminUserId,
      metadata: {
        previousStatus: report.status,
        newStatus: dto.status,
        resolutionNote: dto.resolutionNote,
      },
      ipAddress,
      userAgent,
    });

    return this.mapToResponse(updated);
  }

  private async validateTargetExistence(
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<void> {
    let exists = false;

    switch (targetType) {
      case ReportTargetType.COMMUNITY_POST: {
        const post = await this.prisma.communityPost.findFirst({
          where: { id: targetId, deletedAt: null },
        });
        exists = !!post;
        break;
      }
      case ReportTargetType.COMMUNITY_REPLY: {
        const reply = await this.prisma.communityPostReply.findFirst({
          where: { id: targetId, deletedAt: null },
        });
        exists = !!reply;
        break;
      }
      case ReportTargetType.COMMUNITY_MEETUP: {
        const meetup = await this.prisma.communityMeetup.findFirst({
          where: { id: targetId },
        });
        exists = !!meetup;
        break;
      }
      case ReportTargetType.COMMUNITY_CHAT_MESSAGE: {
        const msg = await this.prisma.communityChatMessage.findFirst({
          where: { id: targetId },
        });
        exists = !!msg;
        break;
      }
      case ReportTargetType.EVENT: {
        const event = await this.prisma.event.findFirst({
          where: { id: targetId, deletedAt: null },
        });
        exists = !!event;
        break;
      }
      case ReportTargetType.COMMUNITY: {
        const community = await this.prisma.community.findFirst({
          where: { id: targetId, deletedAt: null },
        });
        exists = !!community;
        break;
      }
      case ReportTargetType.SPONSOR_AD: {
        const ad = await this.prisma.sponsorAd.findFirst({
          where: { id: targetId, deletedAt: null },
        });
        exists = !!ad;
        break;
      }
      case ReportTargetType.C2B_SERVICE: {
        const c2b = await this.prisma.c2bService.findFirst({
          where: { id: targetId, deletedAt: null },
        });
        exists = !!c2b;
        break;
      }
      case ReportTargetType.VENDOR_SERVICE: {
        const vs = await this.prisma.vendorService.findFirst({
          where: { id: targetId, deletedAt: null },
        });
        exists = !!vs;
        break;
      }
      case ReportTargetType.USER: {
        const user = await this.prisma.user.findFirst({
          where: { id: targetId, deletedAt: null },
        });
        exists = !!user;
        break;
      }
      default:
        throw new BadRequestException('Unsupported target type for reporting');
    }

    if (!exists) {
      throw new NotFoundException('The specified resource does not exist or cannot be reported');
    }
  }

  private mapToResponse(r: {
    id: string;
    reporterId: string;
    targetType: ReportTargetType;
    targetId: string;
    reason: string;
    description: string | null;
    status: ReportStatus;
    resolvedByUserId: string | null;
    resolvedAt: Date | null;
    resolutionNote: string | null;
    createdAt: Date;
    updatedAt: Date;
    reporter?: { id: string; email: string } | null;
    resolvedBy?: { id: string; email: string } | null;
  }): ReportResponseDto {
    return {
      id: r.id,
      reporterId: r.reporterId,
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      description: r.description,
      status: r.status,
      resolvedByUserId: r.resolvedByUserId,
      resolvedAt: r.resolvedAt,
      resolutionNote: r.resolutionNote,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      reporter: r.reporter ? { id: r.reporter.id, email: r.reporter.email } : null,
      resolvedBy: r.resolvedBy ? { id: r.resolvedBy.id, email: r.resolvedBy.email } : null,
    };
  }
}
