/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { AdminDashboardService } from './admin-dashboard.service';
import { PrismaService } from '../../../database/prisma.service';
import { RevenueService } from '../../payments/services/revenue.service';

describe('AdminDashboardService', () => {
  let service: AdminDashboardService;
  let prisma: any;
  let revenueService: { getRevenueReport: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { count: jest.fn().mockResolvedValue(10) },
      event: { count: jest.fn().mockResolvedValue(5) },
      eventRegistration: { count: jest.fn().mockResolvedValue(20) },
      community: { count: jest.fn().mockResolvedValue(4) },
      communitySponsorship: { count: jest.fn().mockResolvedValue(2) },
      communityMember: { count: jest.fn().mockResolvedValue(50) },
      vendorService: { count: jest.fn().mockResolvedValue(8) },
      c2bService: { count: jest.fn().mockResolvedValue(6) },
      rfq: { count: jest.fn().mockResolvedValue(3) },
      quotation: { count: jest.fn().mockResolvedValue(7) },
      c2bBooking: { count: jest.fn().mockResolvedValue(12) },
      sponsorProfile: { count: jest.fn().mockResolvedValue(3) },
      vendorProfile: { count: jest.fn().mockResolvedValue(4) },
      providerProfile: { count: jest.fn().mockResolvedValue(5) },
      subscription: { count: jest.fn().mockResolvedValue(15) },
      report: { count: jest.fn().mockResolvedValue(1) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
    };

    revenueService = {
      getRevenueReport: jest.fn().mockResolvedValue({
        totalGrossRevenue: 10000,
        netRevenue: 9500,
        totalRefunds: 500,
        currency: 'SAR',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminDashboardService,
        { provide: PrismaService, useValue: prisma },
        { provide: RevenueService, useValue: revenueService },
      ],
    }).compile();

    service = module.get<AdminDashboardService>(AdminDashboardService);
  });

  it('should compile and return aggregated platform metrics', async () => {
    const result = await service.getDashboardMetrics();

    expect(result).toBeDefined();
    expect(result.users.total).toBe(10);
    expect(result.events.total).toBe(5);
    expect(result.financial.totalGrossRevenue).toBe(10000);
    expect(result.financial.totalNetRevenue).toBe(9500);
    expect(result.financial.currency).toBe('SAR');
    expect(revenueService.getRevenueReport).toHaveBeenCalledWith({});
  });
});
