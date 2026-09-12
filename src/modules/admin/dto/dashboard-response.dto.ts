import { ApiProperty } from '@nestjs/swagger';

export class DashboardUsersKpiDto {
  @ApiProperty() total!: number;
  @ApiProperty() active!: number;
  @ApiProperty() pending!: number;
  @ApiProperty() suspended!: number;
  @ApiProperty() deactivated!: number;
}

export class DashboardEventsKpiDto {
  @ApiProperty() total!: number;
  @ApiProperty() published!: number;
  @ApiProperty() upcoming!: number;
  @ApiProperty() registrations!: number;
}

export class DashboardCommunitiesKpiDto {
  @ApiProperty() total!: number;
  @ApiProperty() active!: number;
  @ApiProperty() sponsored!: number;
  @ApiProperty() totalMembers!: number;
}

export class DashboardMarketplaceKpiDto {
  @ApiProperty() activeVendorServices!: number;
  @ApiProperty() activeC2bServices!: number;
  @ApiProperty() openRfqs!: number;
  @ApiProperty() pendingQuotations!: number;
  @ApiProperty() c2bBookings!: number;
}

export class DashboardBusinessKpiDto {
  @ApiProperty() activeSponsors!: number;
  @ApiProperty() activeVendors!: number;
  @ApiProperty() activeProviders!: number;
  @ApiProperty() pendingApprovals!: number;
}

export class DashboardSubscriptionsKpiDto {
  @ApiProperty() activeSubscriptions!: number;
}

export class DashboardFinancialKpiDto {
  @ApiProperty() totalGrossRevenue!: number;
  @ApiProperty() totalNetRevenue!: number;
  @ApiProperty() totalRefunds!: number;
  @ApiProperty() currency!: string;
}

export class DashboardModerationKpiDto {
  @ApiProperty() openReportsCount!: number;
  @ApiProperty() inReviewReportsCount!: number;
}

export class RecentActivityDto {
  @ApiProperty() id!: string;
  @ApiProperty() action!: string;
  @ApiProperty() actorUserId!: string | null;
  @ApiProperty() resourceType!: string;
  @ApiProperty() resourceId!: string | null;
  @ApiProperty() createdAt!: Date;
}

export class AdminDashboardResponseDto {
  @ApiProperty({ type: DashboardUsersKpiDto }) users!: DashboardUsersKpiDto;
  @ApiProperty({ type: DashboardEventsKpiDto }) events!: DashboardEventsKpiDto;
  @ApiProperty({ type: DashboardCommunitiesKpiDto }) communities!: DashboardCommunitiesKpiDto;
  @ApiProperty({ type: DashboardMarketplaceKpiDto }) marketplace!: DashboardMarketplaceKpiDto;
  @ApiProperty({ type: DashboardBusinessKpiDto }) business!: DashboardBusinessKpiDto;
  @ApiProperty({ type: DashboardSubscriptionsKpiDto }) subscriptions!: DashboardSubscriptionsKpiDto;
  @ApiProperty({ type: DashboardFinancialKpiDto }) financial!: DashboardFinancialKpiDto;
  @ApiProperty({ type: DashboardModerationKpiDto }) moderation!: DashboardModerationKpiDto;
  @ApiProperty({ type: [RecentActivityDto] }) recentActivity!: RecentActivityDto[];
}
