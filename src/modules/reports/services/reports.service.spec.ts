/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ReportStatus, ReportTargetType } from '@prisma/client';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: any;
  let auditService: { log: jest.Mock };

  const mockReport = {
    id: 'report-1',
    reporterId: 'user-1',
    targetType: ReportTargetType.COMMUNITY_POST,
    targetId: 'post-10',
    reason: 'Hate speech',
    description: 'Offensive language used in community post',
    status: ReportStatus.OPEN,
    resolvedByUserId: null,
    resolvedAt: null,
    resolutionNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    reporter: { id: 'user-1', email: 'reporter@test.com' },
    resolvedBy: null,
  };

  beforeEach(async () => {
    prisma = {
      report: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      communityPost: { findFirst: jest.fn(), findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
    };

    auditService = { log: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  describe('createReport', () => {
    it('should throw NotFoundException if target entity does not exist', async () => {
      prisma.communityPost.findFirst.mockResolvedValue(null);

      await expect(
        service.createReport('user-1', {
          targetType: ReportTargetType.COMMUNITY_POST,
          targetId: 'missing-post',
          reason: 'Spam',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if duplicate active report exists', async () => {
      prisma.communityPost.findFirst.mockResolvedValue({ id: 'post-10' });
      prisma.report.findFirst.mockResolvedValue(mockReport); // Active report already exists

      await expect(
        service.createReport('user-1', {
          targetType: ReportTargetType.COMMUNITY_POST,
          targetId: 'post-10',
          reason: 'Spam',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create report successfully when target exists and no duplicate active report', async () => {
      prisma.communityPost.findFirst.mockResolvedValue({ id: 'post-10' });
      prisma.report.findFirst.mockResolvedValue(null);
      prisma.report.create.mockResolvedValue(mockReport);

      const result = await service.createReport('user-1', {
        targetType: ReportTargetType.COMMUNITY_POST,
        targetId: 'post-10',
        reason: 'Hate speech',
      });

      expect(result.id).toBe('report-1');
      expect(result.status).toBe(ReportStatus.OPEN);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REPORT_SUBMITTED' }),
      );
    });
  });

  describe('resolveReport', () => {
    it('should resolve report and record resolution timestamp and moderator', async () => {
      prisma.report.findUnique.mockResolvedValue(mockReport);
      prisma.report.update.mockResolvedValue({
        ...mockReport,
        status: ReportStatus.RESOLVED,
        resolvedByUserId: 'admin-1',
        resolvedAt: new Date(),
        resolutionNote: 'Post hidden',
      });

      const result = await service.resolveReport('report-1', 'admin-1', {
        status: ReportStatus.RESOLVED,
        resolutionNote: 'Post hidden',
      });

      expect(result.status).toBe(ReportStatus.RESOLVED);
      expect(prisma.report.update).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REPORT_RESOLVED' }),
      );
    });

    it('should throw BadRequestException if report is already closed', async () => {
      prisma.report.findUnique.mockResolvedValue({
        ...mockReport,
        status: ReportStatus.RESOLVED,
      });

      await expect(
        service.resolveReport('report-1', 'admin-1', {
          status: ReportStatus.DISMISSED,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
