/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { AdminAuditLogsService } from './admin-audit-logs.service';
import { PrismaService } from '../../../database/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('AdminAuditLogsService', () => {
  let service: AdminAuditLogsService;
  let prisma: any;

  const mockLog = {
    id: 'log-1',
    actorUserId: 'admin-1',
    action: 'USER_SUSPENDED',
    resourceType: 'USER',
    resourceId: 'user-1',
    metadata: { reason: 'TOS' },
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
    createdAt: new Date(),
    actor: { id: 'admin-1', email: 'admin@innovent.com' },
  };

  beforeEach(async () => {
    prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([mockLog]),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminAuditLogsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AdminAuditLogsService>(AdminAuditLogsService);
  });

  it('should list and paginate audit logs', async () => {
    const result = await service.listAuditLogs({ page: 1, limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.action).toBe('USER_SUSPENDED');
  });

  it('should get audit log by ID', async () => {
    prisma.auditLog.findUnique.mockResolvedValue(mockLog);
    const result = await service.getAuditLogById('log-1');
    expect(result.id).toBe('log-1');
    expect(result.actorEmail).toBe('admin@innovent.com');
  });

  it('should throw NotFoundException if log entry missing', async () => {
    prisma.auditLog.findUnique.mockResolvedValue(null);
    await expect(service.getAuditLogById('missing-log')).rejects.toThrow(NotFoundException);
  });
});
