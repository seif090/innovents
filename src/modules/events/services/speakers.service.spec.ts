import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SpeakersService } from './speakers.service';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { EventAuthorizationService } from './event-authorization.service';

describe('SpeakersService', () => {
  let service: SpeakersService;
  let prisma: {
    speaker: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    sessionSpeaker: {
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

  const sampleSpeaker = {
    id: 'spk-1',
    eventId: 'evt-1',
    fullName: 'Dr. Jane Doe',
    jobTitle: 'Chief Scientist',
    company: 'AI Labs',
    bio: 'Pioneer in Machine Learning',
    photoUrl: 'https://example.com/photo.jpg',
    linkedinUrl: 'https://linkedin.com/in/janedoe',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      speaker: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      sessionSpeaker: {
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
        SpeakersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: EventAuthorizationService, useValue: eventAuthService },
      ],
    }).compile();

    service = module.get<SpeakersService>(SpeakersService);
  });

  describe('create', () => {
    it('should create speaker successfully and log audit', async () => {
      prisma.speaker.create.mockResolvedValue(sampleSpeaker);

      const result = await service.create('evt-1', 'user-owner-1', ['ORGANIZER'], {
        fullName: 'Dr. Jane Doe',
        jobTitle: 'Chief Scientist',
        company: 'AI Labs',
      });

      expect(result.id).toBe('spk-1');
      expect(result.fullName).toBe('Dr. Jane Doe');
      expect(auditService.log).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should throw NotFoundException if speaker not found in event', async () => {
      prisma.speaker.findFirst.mockResolvedValue(null);

      await expect(
        service.delete('evt-1', 'spk-missing', 'user-owner-1', ['ORGANIZER']),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if speaker is assigned to active sessions (User Refinement 4)', async () => {
      prisma.speaker.findFirst.mockResolvedValue(sampleSpeaker);
      prisma.sessionSpeaker.count.mockResolvedValue(1); // assigned to 1 session

      await expect(service.delete('evt-1', 'spk-1', 'user-owner-1', ['ORGANIZER'])).rejects.toThrow(
        ConflictException,
      );
    });

    it('should delete speaker if not assigned to any sessions', async () => {
      prisma.speaker.findFirst.mockResolvedValue(sampleSpeaker);
      prisma.sessionSpeaker.count.mockResolvedValue(0);

      await service.delete('evt-1', 'spk-1', 'user-owner-1', ['ORGANIZER']);

      expect(prisma.speaker.delete).toHaveBeenCalledWith({ where: { id: 'spk-1' } });
      expect(auditService.log).toHaveBeenCalled();
    });
  });
});
