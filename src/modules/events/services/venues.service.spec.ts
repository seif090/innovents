import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { VenuesService } from './venues.service';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { EventAuthorizationService } from './event-authorization.service';

describe('VenuesService', () => {
  let service: VenuesService;
  let prisma: {
    venue: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    session: {
      count: jest.Mock;
    };
  };
  let auditService: {
    log: jest.Mock;
  };
  let eventAuthService: {
    assertCanManageEvent: jest.Mock;
    assertCanViewEvent: jest.Mock;
  };

  const sampleVenue = {
    id: 'ven-1',
    eventId: 'evt-1',
    name: 'Hall A',
    description: 'Main Hall',
    capacity: 200,
    floor: '1st',
    location: 'North Wing',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      venue: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      session: {
        count: jest.fn(),
      },
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    eventAuthService = {
      assertCanManageEvent: jest.fn().mockResolvedValue({ id: 'evt-1' }),
      assertCanViewEvent: jest.fn().mockResolvedValue({ id: 'evt-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VenuesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: EventAuthorizationService, useValue: eventAuthService },
      ],
    }).compile();

    service = module.get<VenuesService>(VenuesService);
  });

  describe('create', () => {
    it('should throw BadRequestException if capacity < 1 (User Refinement 6)', async () => {
      await expect(
        service.create('evt-1', 'user-owner-1', ['ORGANIZER'], {
          name: 'Hall A',
          capacity: 0,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create venue successfully', async () => {
      prisma.venue.create.mockResolvedValue(sampleVenue);

      const result = await service.create('evt-1', 'user-owner-1', ['ORGANIZER'], {
        name: 'Hall A',
        capacity: 200,
      });

      expect(result.id).toBe('ven-1');
      expect(result.name).toBe('Hall A');
      expect(auditService.log).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should throw NotFoundException if venue not found in event', async () => {
      prisma.venue.findFirst.mockResolvedValue(null);

      await expect(
        service.delete('evt-1', 'ven-missing', 'user-owner-1', ['ORGANIZER']),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if active sessions exist in venue (User Refinement 3)', async () => {
      prisma.venue.findFirst.mockResolvedValue(sampleVenue);
      prisma.session.count.mockResolvedValue(2); // 2 active sessions

      await expect(service.delete('evt-1', 'ven-1', 'user-owner-1', ['ORGANIZER'])).rejects.toThrow(
        ConflictException,
      );
    });

    it('should delete venue if no active sessions exist', async () => {
      prisma.venue.findFirst.mockResolvedValue(sampleVenue);
      prisma.session.count.mockResolvedValue(0);

      await service.delete('evt-1', 'ven-1', 'user-owner-1', ['ORGANIZER']);

      expect(prisma.venue.delete).toHaveBeenCalledWith({ where: { id: 'ven-1' } });
      expect(auditService.log).toHaveBeenCalled();
    });
  });
});
