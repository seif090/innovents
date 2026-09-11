import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { CommunityMeetupStatus } from '@prisma/client';
import { CommunityMeetupsService } from './community-meetups.service';
import { CommunityAuthorizationService } from './community-authorization.service';
import { PrismaService } from '../../../database/prisma.service';

describe('CommunityMeetupsService', () => {
  let service: CommunityMeetupsService;
  let prisma: {
    user: { findUnique: jest.Mock };
    event: { findUnique: jest.Mock };
    communityMeetup: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
    communityMeetupParticipant: {
      create: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
    outboxEvent: { create: jest.Mock };
    auditLog: { create: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let authService: {
    assertActiveMember: jest.Mock;
    assertCanViewCommunity: jest.Mock;
    assertCanManageCommunity: jest.Mock;
  };

  const sampleEvent = {
    id: 'evt-1',
    startsAt: new Date('2026-10-10T00:00:00.000Z'),
    endsAt: new Date('2026-10-12T23:59:59.000Z'),
  };

  const sampleCommunity = {
    id: 'comm-1',
    eventId: 'evt-1',
  };

  const sampleMeetup = {
    id: 'meetup-1',
    communityId: 'comm-1',
    eventId: 'evt-1',
    createdById: 'user-creator',
    title: 'AI Coffee Jam',
    description: 'Casual networking at the lounge',
    startsAt: new Date('2026-10-11T14:00:00.000Z'),
    endsAt: new Date('2026-10-11T16:00:00.000Z'),
    location: 'Lounge B',
    mapUrl: null,
    participantLimit: 10,
    participantCount: 1,
    isPinned: true,
    status: CommunityMeetupStatus.SCHEDULED,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      event: { findUnique: jest.fn() },
      communityMeetup: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      communityMeetupParticipant: {
        create: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      outboxEvent: { create: jest.fn() },
      auditLog: { create: jest.fn() },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
    };

    authService = {
      assertActiveMember: jest.fn(),
      assertCanViewCommunity: jest.fn(),
      assertCanManageCommunity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityMeetupsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CommunityAuthorizationService, useValue: authService },
      ],
    }).compile();

    service = module.get<CommunityMeetupsService>(CommunityMeetupsService);
  });

  describe('create', () => {
    it('should throw BadRequestException if endsAt <= startsAt', async () => {
      authService.assertActiveMember.mockResolvedValue({ community: sampleCommunity });

      await expect(
        service.create('comm-1', 'user-creator', {
          title: 'AI Coffee',
          description: 'Meetup description',
          startsAt: '2026-10-11T16:00:00.000Z',
          endsAt: '2026-10-11T15:00:00.000Z',
          location: 'Hall B',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if date is far outside event timeframe', async () => {
      authService.assertActiveMember.mockResolvedValue({ community: sampleCommunity });
      prisma.event.findUnique.mockResolvedValue(sampleEvent);

      await expect(
        service.create('comm-1', 'user-creator', {
          title: 'AI Coffee',
          description: 'Meetup description',
          startsAt: '2026-11-20T16:00:00.000Z',
          location: 'Hall B',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create meetup and automatically participate creator', async () => {
      authService.assertActiveMember.mockResolvedValue({ community: sampleCommunity });
      prisma.event.findUnique.mockResolvedValue(sampleEvent);
      prisma.communityMeetup.create.mockResolvedValue(sampleMeetup);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-creator',
        email: 'creator@innovent.app',
      });

      const res = await service.create('comm-1', 'user-creator', {
        title: 'AI Coffee Jam',
        description: 'Casual networking at the lounge',
        startsAt: '2026-10-11T14:00:00.000Z',
        location: 'Lounge B',
        participantLimit: 10,
      });

      expect(prisma.communityMeetup.create).toHaveBeenCalled();
      expect(prisma.communityMeetupParticipant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            meetupId: 'meetup-1',
            userId: 'user-creator',
          },
        }),
      );
      expect(res.id).toBe('meetup-1');
      expect(res.isPinned).toBe(true);
    });
  });

  describe('join', () => {
    it('should throw ConflictException if participantLimit reached', async () => {
      authService.assertActiveMember.mockResolvedValue({});
      prisma.$queryRaw.mockResolvedValue([
        {
          ...sampleMeetup,
          participant_limit: 5,
          participant_count: 5,
        },
      ]);
      prisma.communityMeetupParticipant.findUnique.mockResolvedValue(null);

      await expect(service.join('comm-1', 'meetup-1', 'user-2')).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if user already participating', async () => {
      authService.assertActiveMember.mockResolvedValue({});
      prisma.$queryRaw.mockResolvedValue([
        {
          ...sampleMeetup,
          participant_limit: 10,
          participant_count: 3,
        },
      ]);
      prisma.communityMeetupParticipant.findUnique.mockResolvedValue({ id: 'part-1' });

      await expect(service.join('comm-1', 'meetup-1', 'user-2')).rejects.toThrow(ConflictException);
    });

    it('should join successfully when capacity available', async () => {
      authService.assertActiveMember.mockResolvedValue({});
      prisma.$queryRaw.mockResolvedValue([
        {
          ...sampleMeetup,
          participant_limit: 10,
          participant_count: 3,
        },
      ]);
      prisma.communityMeetupParticipant.findUnique.mockResolvedValue(null);
      prisma.communityMeetup.update.mockResolvedValue({
        ...sampleMeetup,
        participantCount: 4,
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-creator', email: 'c@app.com' });

      const res = await service.join('comm-1', 'meetup-1', 'user-2');
      expect(prisma.communityMeetupParticipant.create).toHaveBeenCalled();
      expect(prisma.communityMeetup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { participantCount: { increment: 1 } },
        }),
      );
      expect(res.participantCount).toBe(4);
    });
  });

  describe('leave', () => {
    it('should throw BadRequestException if creator attempts to leave meetup', async () => {
      authService.assertActiveMember.mockResolvedValue({});
      prisma.communityMeetup.findFirst.mockResolvedValue({
        ...sampleMeetup,
        createdById: 'user-creator',
      });

      await expect(service.leave('comm-1', 'meetup-1', 'user-creator')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow regular participant to leave', async () => {
      authService.assertActiveMember.mockResolvedValue({});
      prisma.communityMeetup.findFirst.mockResolvedValue({
        ...sampleMeetup,
        createdById: 'user-creator',
      });
      prisma.communityMeetupParticipant.findUnique.mockResolvedValue({ id: 'part-user2' });

      const res = await service.leave('comm-1', 'meetup-1', 'user-2');
      expect(res.success).toBe(true);
      expect(prisma.communityMeetupParticipant.delete).toHaveBeenCalled();
      expect(prisma.communityMeetup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { participantCount: { decrement: 1 } },
        }),
      );
    });
  });

  describe('cancel', () => {
    it('should cancel meetup and set status CANCELLED', async () => {
      prisma.communityMeetup.findFirst.mockResolvedValue(sampleMeetup);

      const res = await service.cancel('comm-1', 'meetup-1', 'user-creator', ['ATTENDEE']);
      expect(res.success).toBe(true);
      expect(prisma.communityMeetup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: CommunityMeetupStatus.CANCELLED },
        }),
      );
    });
  });
});
