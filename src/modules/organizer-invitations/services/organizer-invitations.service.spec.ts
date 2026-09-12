import { Test, TestingModule } from '@nestjs/testing';
import { OrganizerInvitationsService } from './organizer-invitations.service';
import { PrismaService } from '../../../database/prisma.service';
import { EventAuthorizationService } from '../../events/services/event-authorization.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { TokenService } from '../../auth/services/token.service';
import { PasswordService } from '../../auth/services/password.service';
import { CryptoUtil } from '../../../common/utils/crypto.util';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AccountStatus, InvitationStatus } from '@prisma/client';

describe('OrganizerInvitationsService', () => {
  let service: OrganizerInvitationsService;
  let prisma: {
    organizerInvitation: {
      updateMany: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    event: { findFirst: jest.Mock };
    role: { findUnique: jest.Mock };
    user: { findFirst: jest.Mock; create: jest.Mock; findUnique: jest.Mock };
    userRole: { create: jest.Mock };
    organizerProfile: { create: jest.Mock };
    eventOrganizer: { upsert: jest.Mock };
    $transaction: jest.Mock;
  };
  let eventAuth: { assertCanInviteOrganizer: jest.Mock };
  let auditService: { log: jest.Mock };
  let outboxService: { enqueue: jest.Mock };
  let tokenService: { generateTokens: jest.Mock };
  let passwordService: { hash: jest.Mock };

  beforeEach(async () => {
    prisma = {
      organizerInvitation: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'inv-1', ...data, createdAt: new Date() })),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'inv-1', ...data })),
      },
      event: { findFirst: jest.fn() },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 'r-org', name: 'ORGANIZER' }) },
      user: {
        findFirst: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'u-new', ...data })),
        findUnique: jest.fn(),
      },
      userRole: { create: jest.fn().mockResolvedValue({}) },
      organizerProfile: { create: jest.fn().mockResolvedValue({}) },
      eventOrganizer: { upsert: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockImplementation(async (cb) => cb(prisma)),
    };

    eventAuth = {
      assertCanInviteOrganizer: jest
        .fn()
        .mockResolvedValue({ id: 'ev-1', name: 'Tech Summit 2026', ownerId: 'owner-1' }),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    outboxService = { enqueue: jest.fn().mockResolvedValue(undefined) };
    tokenService = {
      generateTokens: jest.fn().mockResolvedValue({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        tokenType: 'Bearer',
        expiresIn: 900,
      }),
    };
    passwordService = { hash: jest.fn().mockResolvedValue('hashed_password') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizerInvitationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventAuthorizationService, useValue: eventAuth },
        { provide: AuditService, useValue: auditService },
        { provide: OutboxService, useValue: outboxService },
        { provide: TokenService, useValue: tokenService },
        { provide: PasswordService, useValue: passwordService },
      ],
    }).compile();

    service = module.get<OrganizerInvitationsService>(OrganizerInvitationsService);
  });

  describe('createInvitation', () => {
    it('should create invitation with hashed token, enqueue outbox, and log audit', async () => {
      const result = await service.createInvitation('ev-1', 'owner-1', ['EVENT_OWNER'], {
        email: 'neworg@example.com',
        expiresDays: 5,
      });

      expect(eventAuth.assertCanInviteOrganizer).toHaveBeenCalledWith(
        'owner-1',
        ['EVENT_OWNER'],
        'ev-1',
      );
      expect(result.token).toBeDefined();
      expect(result.token.length).toBe(64); // 32 bytes hex
      expect(prisma.organizerInvitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventId: 'ev-1',
            email: 'neworg@example.com',
            status: InvitationStatus.PENDING,
            tokenHash: CryptoUtil.sha256(result.token),
          }),
        }),
      );
      expect(outboxService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'ORGANIZER_INVITATION_CREATED',
          payload: expect.objectContaining({ email: 'neworg@example.com' }),
        }),
        expect.anything(),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ORGANIZER_INVITATION_CREATED',
          actorUserId: 'owner-1',
        }),
      );
    });

    it('should reject if caller is not authorized for this event', async () => {
      eventAuth.assertCanInviteOrganizer.mockRejectedValue(new ForbiddenException('Unauthorized'));

      await expect(
        service.createInvitation('ev-1', 'intruder-id', ['ATTENDEE'], { email: 'target@test.com' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('revokeInvitation', () => {
    it('should revoke a pending invitation', async () => {
      const mockInv = {
        id: 'inv-1',
        eventId: 'ev-1',
        email: 'org@test.com',
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      };

      prisma.organizerInvitation.findUnique.mockResolvedValue(mockInv);
      prisma.organizerInvitation.update.mockResolvedValue({
        ...mockInv,
        status: InvitationStatus.REVOKED,
        revokedAt: new Date(),
      });

      const result = await service.revokeInvitation('inv-1', 'owner-1', ['EVENT_OWNER']);

      expect(result.status).toBe(InvitationStatus.REVOKED);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ORGANIZER_INVITATION_REVOKED' }),
      );
    });

    it('should throw BadRequestException if invitation is already accepted', async () => {
      const mockInv = {
        id: 'inv-1',
        eventId: 'ev-1',
        status: InvitationStatus.ACCEPTED,
      };

      prisma.organizerInvitation.findUnique.mockResolvedValue(mockInv);

      await expect(service.revokeInvitation('inv-1', 'owner-1', ['EVENT_OWNER'])).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('acceptInvitation', () => {
    it('should create new active user, assign ORGANIZER role, create EventOrganizer junction, and issue tokens', async () => {
      const rawToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const tokenHash = CryptoUtil.sha256(rawToken);

      const mockInv = {
        id: 'inv-1',
        eventId: 'ev-1',
        eventOwnerId: 'owner-1',
        email: 'fresh.organizer@test.com',
        tokenHash,
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 86400000),
        acceptedAt: null,
        revokedAt: null,
      };

      prisma.organizerInvitation.findUnique.mockResolvedValue(mockInv);
      prisma.event.findFirst.mockResolvedValue({ id: 'ev-1', name: 'AI Summit', deletedAt: null });
      prisma.user.findFirst.mockResolvedValue(null); // New user
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-new',
        email: 'fresh.organizer@test.com',
        userRoles: [{ role: { name: 'ORGANIZER', rolePermissions: [] } }],
      });

      const result = await service.acceptInvitation({
        token: rawToken,
        password: 'OrganizerPass2026!',
        firstName: 'Tariq',
        lastName: 'Al-Harbi',
      });

      expect(result.success).toBe(true);
      expect(result.accessToken).toBe('mock-access-token');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'fresh.organizer@test.com',
            status: AccountStatus.ACTIVE,
          }),
        }),
      );
      expect(prisma.userRole.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ roleId: 'r-org' }),
        }),
      );
      expect(prisma.eventOrganizer.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventId_userId: { eventId: 'ev-1', userId: 'u-new' } },
        }),
      );
      expect(prisma.organizerInvitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-1' },
          data: expect.objectContaining({ status: InvitationStatus.ACCEPTED }),
        }),
      );
    });

    it('should reject already accepted invitation (replay protection)', async () => {
      const rawToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const mockInv = {
        id: 'inv-1',
        status: InvitationStatus.ACCEPTED,
      };

      prisma.organizerInvitation.findUnique.mockResolvedValue(mockInv);

      await expect(service.acceptInvitation({ token: rawToken })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject expired invitation and mark it EXPIRED', async () => {
      const rawToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const mockInv = {
        id: 'inv-1',
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() - 1000), // Past
      };

      prisma.organizerInvitation.findUnique.mockResolvedValue(mockInv);

      await expect(service.acceptInvitation({ token: rawToken })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.organizerInvitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-1' },
          data: { status: InvitationStatus.EXPIRED },
        }),
      );
    });
  });
});
