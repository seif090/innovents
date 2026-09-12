import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ExportQueryDto } from '../dto/export-query.dto';
import { CsvExportUtil } from '../utils/csv-export.util';
import { Prisma } from '@prisma/client';

interface UserExportItem {
  id: string;
  email: string;
  phone: string | null;
  status: string;
  emailVerifiedAt: Date | null;
  userRoles: Array<{ role: { name: string } }>;
  createdAt: Date;
}

interface EventExportItem {
  id: string;
  name: string;
  status: string;
  visibility: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  createdAt: Date;
}

interface PaymentExportItem {
  id: string;
  userId: string;
  amount: Prisma.Decimal;
  currency: string;
  status: string;
  purpose: string;
  stripePaymentIntentId: string | null;
  refundAmount: Prisma.Decimal | null;
  createdAt: Date;
}

interface AuditLogExportItem {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorUserId: string | null;
  ipAddress: string | null;
  createdAt: Date;
}

interface ReportExportItem {
  id: string;
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: string;
  status: string;
  resolvedByUserId: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class AdminExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async exportUsers(
    res: Response,
    adminUserId: string,
    query: ExportQueryDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    const take = Math.min(query.limit || 1000, 5000);
    const where: Prisma.UserWhereInput = {};
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const users = await this.prisma.user.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
      include: { userRoles: { include: { role: true } } },
    });

    const csv = CsvExportUtil.formatCsv<UserExportItem>(
      [
        { header: 'ID', key: 'id' },
        { header: 'Email', key: 'email' },
        { header: 'Phone', key: (u) => u.phone || '' },
        { header: 'Status', key: 'status' },
        { header: 'Email Verified', key: (u) => (u.emailVerifiedAt ? 'YES' : 'NO') },
        {
          header: 'Roles',
          key: (u) => u.userRoles.map((ur) => ur.role.name).join('; '),
        },
        { header: 'Created At', key: 'createdAt' },
      ],
      users,
    );

    await this.auditService.log({
      action: 'EXPORT_USERS',
      resourceType: 'EXPORT',
      actorUserId: adminUserId,
      metadata: { count: users.length, limit: take },
      ipAddress,
      userAgent,
    });

    this.sendCsvResponse(res, 'innovent-users-export.csv', csv);
  }

  async exportEvents(
    res: Response,
    adminUserId: string,
    query: ExportQueryDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    const take = Math.min(query.limit || 1000, 5000);
    const where: Prisma.EventWhereInput = { deletedAt: null };
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const events = await this.prisma.event.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
    });

    const csv = CsvExportUtil.formatCsv<EventExportItem>(
      [
        { header: 'ID', key: 'id' },
        { header: 'Title', key: 'name' },
        { header: 'Status', key: 'status' },
        { header: 'Visibility', key: 'visibility' },
        { header: 'Starts At', key: 'startsAt' },
        { header: 'Ends At', key: 'endsAt' },
        { header: 'Capacity', key: (e) => e.capacity },
        { header: 'Created At', key: 'createdAt' },
      ],
      events,
    );

    await this.auditService.log({
      action: 'EXPORT_EVENTS',
      resourceType: 'EXPORT',
      actorUserId: adminUserId,
      metadata: { count: events.length, limit: take },
      ipAddress,
      userAgent,
    });

    this.sendCsvResponse(res, 'innovent-events-export.csv', csv);
  }

  async exportTransactions(
    res: Response,
    adminUserId: string,
    query: ExportQueryDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    const take = Math.min(query.limit || 1000, 5000);
    const where: Prisma.PaymentWhereInput = {};
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const payments = await this.prisma.payment.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
    });

    const csv = CsvExportUtil.formatCsv<PaymentExportItem>(
      [
        { header: 'Payment ID', key: 'id' },
        { header: 'User ID', key: 'userId' },
        { header: 'Amount', key: (p) => p.amount.toNumber() },
        { header: 'Currency', key: 'currency' },
        { header: 'Status', key: 'status' },
        { header: 'Purpose', key: 'purpose' },
        { header: 'Stripe Payment Intent', key: (p) => p.stripePaymentIntentId || '' },
        {
          header: 'Refunded Amount',
          key: (p) => (p.refundAmount ? p.refundAmount.toNumber() : 0),
        },
        { header: 'Created At', key: 'createdAt' },
      ],
      payments,
    );

    await this.auditService.log({
      action: 'EXPORT_TRANSACTIONS',
      resourceType: 'EXPORT',
      actorUserId: adminUserId,
      metadata: { count: payments.length, limit: take },
      ipAddress,
      userAgent,
    });

    this.sendCsvResponse(res, 'innovent-transactions-export.csv', csv);
  }

  async exportAuditLogs(
    res: Response,
    adminUserId: string,
    query: ExportQueryDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    const take = Math.min(query.limit || 1000, 5000);
    const where: Prisma.AuditLogWhereInput = {};
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
    });

    const csv = CsvExportUtil.formatCsv<AuditLogExportItem>(
      [
        { header: 'ID', key: 'id' },
        { header: 'Action', key: 'action' },
        { header: 'Resource Type', key: 'resourceType' },
        { header: 'Resource ID', key: (l) => l.resourceId || '' },
        { header: 'Actor User ID', key: (l) => l.actorUserId || '' },
        { header: 'IP Address', key: (l) => l.ipAddress || '' },
        { header: 'Created At', key: 'createdAt' },
      ],
      logs,
    );

    await this.auditService.log({
      action: 'EXPORT_AUDIT_LOGS',
      resourceType: 'EXPORT',
      actorUserId: adminUserId,
      metadata: { count: logs.length, limit: take },
      ipAddress,
      userAgent,
    });

    this.sendCsvResponse(res, 'innovent-audit-logs-export.csv', csv);
  }

  async exportReports(
    res: Response,
    adminUserId: string,
    query: ExportQueryDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    const take = Math.min(query.limit || 1000, 5000);
    const where: Prisma.ReportWhereInput = {};
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const reports = await this.prisma.report.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
    });

    const csv = CsvExportUtil.formatCsv<ReportExportItem>(
      [
        { header: 'ID', key: 'id' },
        { header: 'Reporter ID', key: 'reporterId' },
        { header: 'Target Type', key: 'targetType' },
        { header: 'Target ID', key: 'targetId' },
        { header: 'Reason', key: 'reason' },
        { header: 'Status', key: 'status' },
        { header: 'Resolved By', key: (r) => r.resolvedByUserId || '' },
        {
          header: 'Resolved At',
          key: (r) => (r.resolvedAt ? r.resolvedAt.toISOString() : ''),
        },
        { header: 'Created At', key: 'createdAt' },
      ],
      reports,
    );

    await this.auditService.log({
      action: 'EXPORT_REPORTS',
      resourceType: 'EXPORT',
      actorUserId: adminUserId,
      metadata: { count: reports.length, limit: take },
      ipAddress,
      userAgent,
    });

    this.sendCsvResponse(res, 'innovent-reports-export.csv', csv);
  }

  private sendCsvResponse(res: Response, filename: string, content: string): void {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(content);
  }
}
