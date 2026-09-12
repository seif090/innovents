import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import {
  AdminModerationDto,
  ModerationAction,
  ModerationResultDto,
} from '../dto/admin-moderation.dto';
import {
  CommunityMeetupStatus,
  CommunityPostStatus,
  EventStatus,
  ReportTargetType,
} from '@prisma/client';

@Injectable()
export class AdminModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async moderateContent(
    adminUserId: string,
    dto: AdminModerationDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<ModerationResultDto> {
    const { targetType, targetId, action, reason } = dto;

    switch (targetType) {
      case ReportTargetType.COMMUNITY_POST: {
        const post = await this.prisma.communityPost.findUnique({ where: { id: targetId } });
        if (!post) throw new NotFoundException('Community post not found');

        const newStatus =
          action === ModerationAction.RESTORE
            ? CommunityPostStatus.PUBLISHED
            : CommunityPostStatus.HIDDEN;

        await this.prisma.communityPost.update({
          where: { id: targetId },
          data: { status: newStatus },
        });
        break;
      }

      case ReportTargetType.COMMUNITY_REPLY: {
        const reply = await this.prisma.communityPostReply.findUnique({ where: { id: targetId } });
        if (!reply) throw new NotFoundException('Community post reply not found');

        const newStatus =
          action === ModerationAction.RESTORE
            ? CommunityPostStatus.PUBLISHED
            : CommunityPostStatus.HIDDEN;

        await this.prisma.communityPostReply.update({
          where: { id: targetId },
          data: { status: newStatus },
        });
        break;
      }

      case ReportTargetType.COMMUNITY_MEETUP: {
        const meetup = await this.prisma.communityMeetup.findUnique({ where: { id: targetId } });
        if (!meetup) throw new NotFoundException('Community meetup not found');

        await this.prisma.communityMeetup.update({
          where: { id: targetId },
          data: {
            status:
              action === ModerationAction.RESTORE
                ? CommunityMeetupStatus.SCHEDULED
                : CommunityMeetupStatus.CANCELLED,
          },
        });
        break;
      }

      case ReportTargetType.SPONSOR_AD: {
        const ad = await this.prisma.sponsorAd.findUnique({ where: { id: targetId } });
        if (!ad) throw new NotFoundException('Sponsor ad not found');

        await this.prisma.sponsorAd.update({
          where: { id: targetId },
          data: {
            status: action === ModerationAction.RESTORE ? 'APPROVED' : 'REJECTED',
            rejectionReason: action === ModerationAction.REJECT ? reason : null,
          },
        });
        break;
      }

      case ReportTargetType.C2B_SERVICE: {
        const c2b = await this.prisma.c2bService.findUnique({ where: { id: targetId } });
        if (!c2b) throw new NotFoundException('C2B service not found');

        await this.prisma.c2bService.update({
          where: { id: targetId },
          data: { isAvailable: action === ModerationAction.RESTORE },
        });
        break;
      }

      case ReportTargetType.VENDOR_SERVICE: {
        const vs = await this.prisma.vendorService.findUnique({ where: { id: targetId } });
        if (!vs) throw new NotFoundException('Vendor service not found');

        await this.prisma.vendorService.update({
          where: { id: targetId },
          data: { isActive: action === ModerationAction.RESTORE },
        });
        break;
      }

      case ReportTargetType.EVENT: {
        const ev = await this.prisma.event.findUnique({ where: { id: targetId } });
        if (!ev) throw new NotFoundException('Event not found');

        await this.prisma.event.update({
          where: { id: targetId },
          data: {
            status:
              action === ModerationAction.RESTORE ? EventStatus.PUBLISHED : EventStatus.CANCELLED,
          },
        });
        break;
      }

      default:
        throw new BadRequestException(`Moderation not supported for target type ${targetType}`);
    }

    // Immutable audit record of the moderation action
    await this.auditService.log({
      action: 'CONTENT_MODERATED',
      resourceType: targetType,
      resourceId: targetId,
      actorUserId: adminUserId,
      metadata: { action, reason },
      ipAddress,
      userAgent,
    });

    return {
      success: true,
      targetType,
      targetId,
      action,
      reason,
      moderatedAt: new Date(),
      moderatorId: adminUserId,
    };
  }
}
