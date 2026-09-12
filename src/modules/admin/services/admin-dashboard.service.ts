import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { RevenueService } from '../../payments/services/revenue.service';
import { AdminDashboardResponseDto } from '../dto/dashboard-response.dto';
import {
  AccountStatus,
  CommunitySponsorshipStatus,
  EventStatus,
  QuotationStatus,
  ReportStatus,
  RfqStatus,
  SubscriptionStatus,
} from '@prisma/client';

@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revenueService: RevenueService,
  ) {}

  async getDashboardMetrics(): Promise<AdminDashboardResponseDto> {
    const now = new Date();

    // Fast parallel aggregate execution across domains
    const [
      // Users
      totalUsers,
      activeUsers,
      pendingUsers,
      suspendedUsers,
      deactivatedUsers,

      // Events
      totalEvents,
      publishedEvents,
      upcomingEvents,
      totalRegistrations,

      // Communities
      totalCommunities,
      sponsoredCommunities,
      totalMembers,

      // Marketplace
      activeVendorServices,
      activeC2bServices,
      openRfqs,
      pendingQuotations,
      c2bBookings,

      // Business Profiles
      activeSponsors,
      activeVendors,
      activeProviders,
      pendingApprovals,

      // Subscriptions
      activeSubscriptions,

      // Moderation
      openReportsCount,
      inReviewReportsCount,

      // Financial (authoritative from RevenueService)
      financialReport,

      // Recent Activity
      recentLogs,
    ] = await Promise.all([
      // Users
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: AccountStatus.ACTIVE, deletedAt: null } }),
      this.prisma.user.count({ where: { status: AccountStatus.PENDING, deletedAt: null } }),
      this.prisma.user.count({ where: { status: AccountStatus.SUSPENDED } }),
      this.prisma.user.count({ where: { status: AccountStatus.DEACTIVATED } }),

      // Events
      this.prisma.event.count({ where: { deletedAt: null } }),
      this.prisma.event.count({ where: { status: EventStatus.PUBLISHED, deletedAt: null } }),
      this.prisma.event.count({
        where: { status: EventStatus.PUBLISHED, startsAt: { gt: now }, deletedAt: null },
      }),
      this.prisma.eventRegistration.count(),

      // Communities
      this.prisma.community.count({ where: { deletedAt: null } }),
      this.prisma.communitySponsorship.count({
        where: { status: CommunitySponsorshipStatus.ACTIVE, endsAt: { gt: now } },
      }),
      this.prisma.communityMember.count(),

      // Marketplace
      this.prisma.vendorService.count({ where: { isActive: true, deletedAt: null } }),
      this.prisma.c2bService.count({
        where: { isAvailable: true, expiresAt: { gt: now }, deletedAt: null },
      }),
      this.prisma.rfq.count({
        where: {
          status: { in: [RfqStatus.SENT, RfqStatus.VIEWED, RfqStatus.CLARIFICATION_REQUESTED] },
        },
      }),
      this.prisma.quotation.count({ where: { status: QuotationStatus.PENDING } }),
      this.prisma.c2bBooking.count(),

      // Business Profiles
      this.prisma.sponsorProfile.count({ where: { deletedAt: null } }),
      this.prisma.vendorProfile.count({ where: { deletedAt: null } }),
      this.prisma.providerProfile.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { status: AccountStatus.PENDING } }),

      // Subscriptions
      this.prisma.subscription.count({
        where: { status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] } },
      }),

      // Moderation
      this.prisma.report.count({ where: { status: ReportStatus.OPEN } }),
      this.prisma.report.count({ where: { status: ReportStatus.IN_REVIEW } }),

      // Financial (authoritative reuse)
      this.revenueService.getRevenueReport({}),

      // Recent Activity
      this.prisma.auditLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          action: true,
          actorUserId: true,
          resourceType: true,
          resourceId: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        pending: pendingUsers,
        suspended: suspendedUsers,
        deactivated: deactivatedUsers,
      },
      events: {
        total: totalEvents,
        published: publishedEvents,
        upcoming: upcomingEvents,
        registrations: totalRegistrations,
      },
      communities: {
        total: totalCommunities,
        active: totalCommunities,
        sponsored: sponsoredCommunities,
        totalMembers,
      },
      marketplace: {
        activeVendorServices,
        activeC2bServices,
        openRfqs,
        pendingQuotations,
        c2bBookings,
      },
      business: {
        activeSponsors,
        activeVendors,
        activeProviders,
        pendingApprovals,
      },
      subscriptions: {
        activeSubscriptions,
      },
      financial: {
        totalGrossRevenue: financialReport.totalGrossRevenue,
        totalNetRevenue: financialReport.netRevenue,
        totalRefunds: financialReport.totalRefunds,
        currency: financialReport.currency || 'SAR',
      },
      moderation: {
        openReportsCount,
        inReviewReportsCount,
      },
      recentActivity: recentLogs,
    };
  }
}
