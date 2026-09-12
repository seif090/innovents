import { Test, TestingModule } from '@nestjs/testing';
import { BusinessProfilesService } from './business-profiles.service';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { NotFoundException } from '@nestjs/common';
import { AccountStatus } from '@prisma/client';

describe('BusinessProfilesService', () => {
  let service: BusinessProfilesService;
  let prisma: {
    user: { findFirst: jest.Mock };
    sponsorProfile: { upsert: jest.Mock };
    vendorProfile: { upsert: jest.Mock };
    providerProfile: { upsert: jest.Mock };
    eventOwnerProfile: { upsert: jest.Mock };
    organizerProfile: { upsert: jest.Mock };
    mediaProfile: { upsert: jest.Mock };
    attendeeProfile: { upsert: jest.Mock };
  };
  let auditService: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findFirst: jest.fn() },
      sponsorProfile: { upsert: jest.fn().mockResolvedValue({}) },
      vendorProfile: { upsert: jest.fn().mockResolvedValue({}) },
      providerProfile: { upsert: jest.fn().mockResolvedValue({}) },
      eventOwnerProfile: { upsert: jest.fn().mockResolvedValue({}) },
      organizerProfile: { upsert: jest.fn().mockResolvedValue({}) },
      mediaProfile: { upsert: jest.fn().mockResolvedValue({}) },
      attendeeProfile: { upsert: jest.fn().mockResolvedValue({}) },
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessProfilesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<BusinessProfilesService>(BusinessProfilesService);
  });

  describe('getOwnProfile', () => {
    it('should return own profile with user identity and sponsor profile', async () => {
      const mockUser = {
        id: 'u-1',
        email: 'sponsor@company.com',
        phone: '+966501234567',
        status: AccountStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        lastLoginAt: new Date('2026-09-12T10:00:00Z'),
        createdAt: new Date('2026-09-10T10:00:00Z'),
        userRoles: [{ role: { name: 'SPONSOR' } }],
        sponsorProfile: {
          companyName: 'Acme Corp',
          industry: 'Tech',
        },
      };

      prisma.user.findFirst.mockResolvedValue(mockUser);

      const result = await service.getOwnProfile('u-1');

      expect(result.id).toBe('u-1');
      expect(result.email).toBe('sponsor@company.com');
      expect(result.roles).toContain('SPONSOR');
      expect(result.profile).toEqual(mockUser.sponsorProfile);
    });

    it('should throw NotFoundException if user is not found', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.getOwnProfile('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateOwnProfile', () => {
    it('should update sponsor profile when user has SPONSOR role', async () => {
      const mockUser = {
        id: 'u-1',
        email: 'sponsor@company.com',
        status: AccountStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        lastLoginAt: null,
        createdAt: new Date(),
        userRoles: [{ role: { name: 'SPONSOR' } }],
        sponsorProfile: { companyName: 'Acme Corp Updated' },
      };

      prisma.user.findFirst.mockResolvedValue(mockUser);

      const result = await service.updateOwnProfile('u-1', {
        companyName: 'Acme Corp Updated',
        website: 'https://acme.com',
      });

      expect(prisma.sponsorProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u-1' },
          update: expect.objectContaining({ companyName: 'Acme Corp Updated' }),
        }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'u-1',
          action: 'BUSINESS_PROFILE_UPDATED',
        }),
      );
      expect(result.profile).toEqual({ companyName: 'Acme Corp Updated' });
    });
  });

  describe('getPublicBusiness', () => {
    it('should return sanitized business profile without private contact info or tokens', async () => {
      const mockBusiness = {
        id: 'b-1',
        email: 'private-auth@company.com',
        phone: '+966500000000',
        status: AccountStatus.ACTIVE,
        deletedAt: null,
        userRoles: [{ role: { name: 'SPONSOR' } }],
        sponsorProfile: {
          companyName: 'Mega Sponsor',
          logoUrl: 'https://cdn.innovent.app/logo.png',
          website: 'https://megasponsor.com',
          description: 'Global Cloud Platform',
          industry: 'Cloud Computing',
          tier: 'PLATINUM',
          city: 'Riyadh',
          country: 'Saudi Arabia',
          contactEmail: 'internal-secret@megasponsor.com',
          documents: { cr: '12345' },
          createdAt: new Date('2026-09-01T00:00:00Z'),
        },
      };

      prisma.user.findFirst.mockResolvedValue(mockBusiness);

      const result = await service.getPublicBusiness('b-1');

      expect(result.id).toBe('b-1');
      expect(result.name).toBe('Mega Sponsor');
      expect(result.role).toBe('SPONSOR');
      expect(result.category).toBe('Cloud Computing');
      expect(result.tags).toContain('PLATINUM');
      // Anti-leakage checks:
      expect((result as unknown as Record<string, unknown>).email).toBeUndefined();
      expect((result as unknown as Record<string, unknown>).phone).toBeUndefined();
      expect((result as unknown as Record<string, unknown>).contactEmail).toBeUndefined();
      expect((result as unknown as Record<string, unknown>).documents).toBeUndefined();
      expect((result as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
    });

    it('should throw NotFoundException (anti-enumeration) if account is not active or missing', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.getPublicBusiness('pending-user')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPublicUser', () => {
    it('should return sanitized public user without email or phone', async () => {
      const mockUser = {
        id: 'att-1',
        email: 'secret-attendee@gmail.com',
        phone: '+966555555555',
        status: AccountStatus.ACTIVE,
        deletedAt: null,
        attendeeProfile: {
          firstName: 'Sara',
          lastName: 'Ahmed',
          avatarUrl: 'https://cdn.innovent.app/avatar.png',
          bio: 'Data Scientist',
          city: 'Dubai',
          country: 'UAE',
          interests: ['AI', 'Data'],
          createdAt: new Date(),
        },
      };

      prisma.user.findFirst.mockResolvedValue(mockUser);

      const result = await service.getPublicUser('att-1');

      expect(result.id).toBe('att-1');
      expect(result.firstName).toBe('Sara');
      expect(result.lastName).toBe('Ahmed');
      expect((result as unknown as Record<string, unknown>).email).toBeUndefined();
      expect((result as unknown as Record<string, unknown>).phone).toBeUndefined();
    });
  });
});
