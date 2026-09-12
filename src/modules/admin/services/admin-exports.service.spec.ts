/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { AdminExportsService } from './admin-exports.service';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CsvExportUtil } from '../utils/csv-export.util';

describe('AdminExportsService', () => {
  let service: AdminExportsService;
  let prisma: any;
  let auditService: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'u1',
            email: "=cmd|'/C calc'!A0", // Formula injection attempt
            phone: '+966500000001',
            status: 'ACTIVE',
            emailVerifiedAt: new Date(),
            userRoles: [{ role: { name: 'ATTENDEE' } }],
            createdAt: new Date(),
          },
        ]),
      },
    };

    auditService = { log: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminExportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<AdminExportsService>(AdminExportsService);
  });

  it('should neutralize formula injection in CSV exports', async () => {
    const mockRes: any = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    await service.exportUsers(mockRes, 'admin-1', { limit: 1000 });

    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(mockRes.send).toHaveBeenCalled();

    const outputCsv = mockRes.send.mock.calls[0][0];
    // Must neutralize = with single quote
    expect(outputCsv).toContain("'=cmd");
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EXPORT_USERS' }),
    );
  });

  it('CsvExportUtil should neutralize =, +, -, @ characters', () => {
    expect(CsvExportUtil.sanitizeCell('=1+1')).toBe("'=1+1");
    expect(CsvExportUtil.sanitizeCell('+44')).toBe("'+44");
    expect(CsvExportUtil.sanitizeCell('-50')).toBe("'-50");
    expect(CsvExportUtil.sanitizeCell('@danger')).toBe("'@danger");
    expect(CsvExportUtil.sanitizeCell('Normal text')).toBe('Normal text');
  });
});
