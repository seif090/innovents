/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { AdminModerationService } from './admin-moderation.service';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ModerationAction } from '../dto/admin-moderation.dto';
import { ReportTargetType } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';

describe('AdminModerationService', () => {
  let service: AdminModerationService;
  let prisma: any;
  let auditService: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      communityPost: { findUnique: jest.fn(), update: jest.fn() },
      communityPostReply: { findUnique: jest.fn(), update: jest.fn() },
      communityMeetup: { findUnique: jest.fn(), update: jest.fn() },
      c2bService: { findUnique: jest.fn(), update: jest.fn() },
      vendorService: { findUnique: jest.fn(), update: jest.fn() },
      sponsorAd: { findUnique: jest.fn(), update: jest.fn() },
    };

    auditService = { log: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminModerationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<AdminModerationService>(AdminModerationService);
  });

  it('should hide community post and record audit log', async () => {
    prisma.communityPost.findUnique.mockResolvedValue({ id: 'post-1', status: 'PUBLISHED' });
    prisma.communityPost.update.mockResolvedValue({ id: 'post-1', status: 'HIDDEN' });

    const result = await service.moderateContent('admin-1', {
      targetType: ReportTargetType.COMMUNITY_POST,
      targetId: 'post-1',
      action: ModerationAction.HIDE,
      reason: 'Inappropriate content',
    });

    expect(result.success).toBe(true);
    expect(result.action).toBe(ModerationAction.HIDE);
    expect(prisma.communityPost.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: { status: 'HIDDEN' },
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CONTENT_MODERATED',
        resourceType: ReportTargetType.COMMUNITY_POST,
        resourceId: 'post-1',
      }),
    );
  });

  it('should throw NotFoundException if target content does not exist', async () => {
    prisma.communityPost.findUnique.mockResolvedValue(null);

    await expect(
      service.moderateContent('admin-1', {
        targetType: ReportTargetType.COMMUNITY_POST,
        targetId: 'missing-post',
        action: ModerationAction.HIDE,
        reason: 'Spam',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
