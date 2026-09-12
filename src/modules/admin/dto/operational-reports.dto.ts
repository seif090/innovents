import { ApiProperty } from '@nestjs/swagger';

export class UsersReportDto {
  @ApiProperty() totalUsers!: number;
  @ApiProperty() statusBreakdown!: Record<string, number>;
  @ApiProperty() roleBreakdown!: Record<string, number>;
  @ApiProperty() emailVerifiedCount!: number;
}

export class EventsReportDto {
  @ApiProperty() totalEvents!: number;
  @ApiProperty() statusBreakdown!: Record<string, number>;
  @ApiProperty() upcomingCount!: number;
  @ApiProperty() totalRegistrations!: number;
}

export class CommunitiesReportDto {
  @ApiProperty() totalCommunities!: number;
  @ApiProperty() activeCount!: number;
  @ApiProperty() sponsoredCount!: number;
  @ApiProperty() totalPosts!: number;
  @ApiProperty() totalReplies!: number;
  @ApiProperty() totalMembers!: number;
}

export class MarketplaceReportDto {
  @ApiProperty() totalVendorServices!: number;
  @ApiProperty() activeVendorServices!: number;
  @ApiProperty() totalC2bServices!: number;
  @ApiProperty() availableC2bServices!: number;
  @ApiProperty() totalRfqs!: number;
  @ApiProperty() openRfqs!: number;
  @ApiProperty() totalQuotations!: number;
  @ApiProperty() totalC2bBookings!: number;
}
