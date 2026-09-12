/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { AdminOperationalReportsService } from './admin-operational-reports.service';
import { PrismaService } from '../../../database/prisma.service';
import { RevenueService } from '../../payments/services/revenue.service';

describe('AdminOperationalReportsService', () => {
  let service: AdminOperationalReportsService;
  let prisma: any;
  let revenueService: { getRevenueReport: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        count: jest.fn().mockResolvedValue(15),
        groupBy: jest.fn().mockResolvedValue([{ status: 'ACTIVE', _count: { id: 10 } }]),
      },
      userRole: {
        groupBy: jest.fn().mockResolvedValue([{ roleId: 'role-1', _count: { id: 10 } }]),
      },
      role: {
        findMany: jest.fn().mockResolvedValue([{ id: 'role-1', name: 'ATTENDEE' }]),
      },
      event: {
        count: jest.fn().mockResolvedValue(8),
        groupBy: jest.fn().mockResolvedValue([{ status: 'PUBLISHED', _count: { id: 6 } }]),
      },
      eventRegistration: { count: jest.fn().mockResolvedValue(25) },
      community: { count: jest.fn().mockResolvedValue(5) },
      communitySponsorship: { count: jest.fn().mockResolvedValue(3) },
      communityPost: { count: jest.fn().mockResolvedValue(40) },
      communityPostReply: { count: jest.fn().mockResolvedValue(80) },
      communityMember: { count: jest.fn().mockResolvedValue(100) },
      vendorService: { count: jest.fn().mockResolvedValue(12) },
      c2bService: { count: jest.fn().mockResolvedValue(10) },
      rfq: { count: jest.fn().mockResolvedValue(4) },
      quotation: { count: jest.fn().mockResolvedValue(6) },
      c2bBooking: { count: jest.fn().mockResolvedValue(14) },
    };

    revenueService = {
      getRevenueReport: jest.fn().mockResolvedValue({
        totalGrossRevenue: 50000,
        netRevenue: 48000,
        totalRefunds: 2000,
        currency: 'SAR',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminOperationalReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RevenueService, useValue: revenueService },
      ],
    }).compile();

    service = module.get<AdminOperationalReportsService>(AdminOperationalReportsService);
  });

  it('should compile user operational reports', async () => {
    const report = await service.getUsersReport();
    expect(report.totalUsers).toBe(15);
    expect(report.statusBreakdown['ACTIVE']).toBe(10);
    expect(report.roleBreakdown['ATTENDEE']).toBe(10);
  });

  it('should delegate revenue report authoritative calculations to RevenueService', async () => {
    const report = await service.getRevenueReport();
    expect(report.totalGrossRevenue).toBe(50000);
    expect(revenueService.getRevenueReport).toHaveBeenCalledWith({});
  });
});
