import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { RevenueService } from '../../payments/services/revenue.service';
import { RevenueReportResponseDto } from '../../payments/dto/revenue-report.dto';
import {
  UsersReportDto,
  EventsReportDto,
  CommunitiesReportDto,
  MarketplaceReportDto,
} from '../dto/operational-reports.dto';
import { CommunitySponsorshipStatus, EventStatus, RfqStatus } from '@prisma/client';

@Injectable()
export class AdminOperationalReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revenueService: RevenueService,
  ) {}

  async getUsersReport(): Promise<UsersReportDto> {
    const [totalUsers, statusGroups, roleGroups, emailVerifiedCount] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      this.prisma.userRole.groupBy({
        by: ['roleId'],
        _count: { id: true },
      }),
      this.prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
    ]);

    const statusBreakdown: Record<string, number> = {};
    for (const g of statusGroups) {
      statusBreakdown[g.status] = g._count.id;
    }

    // Role mapping
    const roles = await this.prisma.role.findMany();
    const roleNameMap = new Map(roles.map((r) => [r.id, r.name]));
    const roleBreakdown: Record<string, number> = {};
    for (const g of roleGroups) {
      const name = roleNameMap.get(g.roleId) || g.roleId;
      roleBreakdown[name] = g._count.id;
    }

    return {
      totalUsers,
      statusBreakdown,
      roleBreakdown,
      emailVerifiedCount,
    };
  }

  async getEventsReport(): Promise<EventsReportDto> {
    const now = new Date();
    const [totalEvents, statusGroups, upcomingCount, totalRegistrations] = await Promise.all([
      this.prisma.event.count({ where: { deletedAt: null } }),
      this.prisma.event.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      this.prisma.event.count({
        where: { status: EventStatus.PUBLISHED, startsAt: { gt: now }, deletedAt: null },
      }),
      this.prisma.eventRegistration.count(),
    ]);

    const statusBreakdown: Record<string, number> = {};
    for (const g of statusGroups) {
      statusBreakdown[g.status] = g._count.id;
    }

    return {
      totalEvents,
      statusBreakdown,
      upcomingCount,
      totalRegistrations,
    };
  }

  async getCommunitiesReport(): Promise<CommunitiesReportDto> {
    const now = new Date();
    const [totalCommunities, sponsoredCount, totalPosts, totalReplies, totalMembers] =
      await Promise.all([
        this.prisma.community.count({ where: { deletedAt: null } }),
        this.prisma.communitySponsorship.count({
          where: { status: CommunitySponsorshipStatus.ACTIVE, endsAt: { gt: now } },
        }),
        this.prisma.communityPost.count({ where: { deletedAt: null } }),
        this.prisma.communityPostReply.count({ where: { deletedAt: null } }),
        this.prisma.communityMember.count(),
      ]);

    return {
      totalCommunities,
      activeCount: totalCommunities,
      sponsoredCount,
      totalPosts,
      totalReplies,
      totalMembers,
    };
  }

  async getMarketplaceReport(): Promise<MarketplaceReportDto> {
    const now = new Date();
    const [
      totalVendorServices,
      activeVendorServices,
      totalC2bServices,
      availableC2bServices,
      totalRfqs,
      openRfqs,
      totalQuotations,
      totalC2bBookings,
    ] = await Promise.all([
      this.prisma.vendorService.count({ where: { deletedAt: null } }),
      this.prisma.vendorService.count({ where: { isActive: true, deletedAt: null } }),
      this.prisma.c2bService.count({ where: { deletedAt: null } }),
      this.prisma.c2bService.count({
        where: { isAvailable: true, expiresAt: { gt: now }, deletedAt: null },
      }),
      this.prisma.rfq.count(),
      this.prisma.rfq.count({
        where: {
          status: { in: [RfqStatus.SENT, RfqStatus.VIEWED, RfqStatus.CLARIFICATION_REQUESTED] },
        },
      }),
      this.prisma.quotation.count(),
      this.prisma.c2bBooking.count(),
    ]);

    return {
      totalVendorServices,
      activeVendorServices,
      totalC2bServices,
      availableC2bServices,
      totalRfqs,
      openRfqs,
      totalQuotations,
      totalC2bBookings,
    };
  }

  async getRevenueReport(): Promise<RevenueReportResponseDto> {
    // Authoritative reuse of RevenueService
    return this.revenueService.getRevenueReport({});
  }
}
