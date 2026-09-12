/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { createGlobalValidationPipe } from '../src/common/pipes/validation.pipe';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/infrastructure/cache/redis.service';
import { QueueService } from '../src/infrastructure/queue/queue.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { AccountStatus, InvitationStatus } from '@prisma/client';

describe('B2B Portal, Business Accounts & Organizer Invitations E2E Suite (e2e)', () => {
  jest.setTimeout(45000);
  let app: INestApplication;
  let tokenService: TokenService;

  // Hermetic in-memory store
  type MockEntity = any;
  const mockUsers = new Map<string, MockEntity>();
  const mockRoles = new Map<string, MockEntity>([
    ['ADMIN', { id: uuidv4(), name: 'ADMIN', rolePermissions: [] }],
    ['EVENT_OWNER', { id: uuidv4(), name: 'EVENT_OWNER', rolePermissions: [] }],
    ['ORGANIZER', { id: uuidv4(), name: 'ORGANIZER', rolePermissions: [] }],
    ['SPONSOR', { id: uuidv4(), name: 'SPONSOR', rolePermissions: [] }],
    ['VENDOR', { id: uuidv4(), name: 'VENDOR', rolePermissions: [] }],
    ['PROVIDER', { id: uuidv4(), name: 'PROVIDER', rolePermissions: [] }],
    ['ATTENDEE', { id: uuidv4(), name: 'ATTENDEE', rolePermissions: [] }],
    ['MEDIA', { id: uuidv4(), name: 'MEDIA', rolePermissions: [] }],
  ]);
  const mockUserRoles = new Map<string, MockEntity>();
  const mockSponsorProfiles = new Map<string, MockEntity>();
  const mockVendorProfiles = new Map<string, MockEntity>();
  const mockProviderProfiles = new Map<string, MockEntity>();
  const mockEventOwnerProfiles = new Map<string, MockEntity>();
  const mockOrganizerProfiles = new Map<string, MockEntity>();
  const mockAttendeeProfiles = new Map<string, MockEntity>();
  const mockEvents = new Map<string, MockEntity>();
  const mockEventOrganizers = new Map<string, MockEntity>();
  const mockOrganizerInvitations = new Map<string, MockEntity>();
  const mockRefreshTokens = new Map<string, MockEntity>();
  const mockOutboxEvents: MockEntity[] = [];
  const mockAuditLogs: MockEntity[] = [];

  // Test users
  const adminUser = {
    id: uuidv4(),
    email: 'admin@innovent.app',
    phone: '+1000000001',
    status: AccountStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    passwordHash: 'hash_admin',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    approvedAt: new Date(),
    approvedByUserId: null,
    rejectedAt: null,
    rejectionReason: null,
    suspendedAt: null,
    suspensionReason: null,
  };

  const ownerUser = {
    id: uuidv4(),
    email: 'owner@innovent.app',
    phone: '+1000000002',
    status: AccountStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    passwordHash: 'hash_owner',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    approvedAt: new Date(),
    approvedByUserId: adminUser.id,
    rejectedAt: null,
    rejectionReason: null,
    suspendedAt: null,
    suspensionReason: null,
  };

  const otherOwnerUser = {
    id: uuidv4(),
    email: 'other_owner@innovent.app',
    phone: '+1000000003',
    status: AccountStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    passwordHash: 'hash_other_owner',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    approvedAt: new Date(),
    approvedByUserId: adminUser.id,
    rejectedAt: null,
    rejectionReason: null,
    suspendedAt: null,
    suspensionReason: null,
  };

  const sponsorUser = {
    id: uuidv4(),
    email: 'pending_sponsor@innovent.app',
    phone: '+1000000004',
    status: AccountStatus.PENDING,
    emailVerifiedAt: new Date(),
    passwordHash: 'hash_sponsor',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    approvedAt: null,
    approvedByUserId: null,
    rejectedAt: null,
    rejectionReason: null,
    suspendedAt: null,
    suspensionReason: null,
  };

  const vendorUser = {
    id: uuidv4(),
    email: 'pending_vendor@innovent.app',
    phone: '+1000000005',
    status: AccountStatus.PENDING,
    emailVerifiedAt: new Date(),
    passwordHash: 'hash_vendor',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    approvedAt: null,
    approvedByUserId: null,
    rejectedAt: null,
    rejectionReason: null,
    suspendedAt: null,
    suspensionReason: null,
  };

  const providerUser = {
    id: uuidv4(),
    email: 'active_provider@innovent.app',
    phone: '+1000000006',
    status: AccountStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    passwordHash: 'hash_provider',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    approvedAt: new Date(),
    approvedByUserId: adminUser.id,
    rejectedAt: null,
    rejectionReason: null,
    suspendedAt: null,
    suspensionReason: null,
  };

  const attendeeUser = {
    id: uuidv4(),
    email: 'attendee@innovent.app',
    phone: '+1000000007',
    status: AccountStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    passwordHash: 'hash_attendee',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    approvedAt: null,
    approvedByUserId: null,
    rejectedAt: null,
    rejectionReason: null,
    suspendedAt: null,
    suspensionReason: null,
  };

  // Test Event
  const testEventId = uuidv4();
  const testEvent = {
    id: testEventId,
    ownerId: ownerUser.id,
    name: 'B2B Global Tech Summit 2026',
    slug: 'b2b-global-tech-summit-2026',
    description: 'Enterprise Tech Summit',
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    startsAt: new Date(Date.now() + 86400000),
    endsAt: new Date(Date.now() + 172800000),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  let adminToken: string;
  let ownerToken: string;
  let otherOwnerToken: string;
  let sponsorToken: string;
  let vendorToken: string;
  let providerToken: string;
  let attendeeToken: string;

  beforeAll(async () => {
    // Populate mock users
    [
      adminUser,
      ownerUser,
      otherOwnerUser,
      sponsorUser,
      vendorUser,
      providerUser,
      attendeeUser,
    ].forEach((u) => mockUsers.set(u.id, u));

    // Populate mock profiles
    mockSponsorProfiles.set(sponsorUser.id, {
      id: uuidv4(),
      userId: sponsorUser.id,
      companyName: 'Acme Enterprise Solutions',
      industry: 'Technology',
      website: 'https://acme.example.com',
      description: 'Cloud and AI infrastructure solutions',
      city: 'Riyadh',
      country: 'SA',
      tier: 'PLATINUM',
      logoUrl: 'https://acme.example.com/logo.png',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockVendorProfiles.set(vendorUser.id, {
      id: uuidv4(),
      userId: vendorUser.id,
      companyName: 'Global Audio Visuals',
      serviceCategory: 'Production & AV',
      website: 'https://audiovisual.example.com',
      description: 'Stage lighting and sound equipment',
      city: 'Dubai',
      country: 'AE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockProviderProfiles.set(providerUser.id, {
      id: uuidv4(),
      userId: providerUser.id,
      businessName: 'Elite Catering Services',
      serviceType: 'Hospitality',
      website: 'https://catering.example.com',
      description: 'Premium catering for enterprise conventions',
      city: 'Riyadh',
      country: 'SA',
      logoUrl: 'https://catering.example.com/logo.png',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockEventOwnerProfiles.set(ownerUser.id, {
      id: uuidv4(),
      userId: ownerUser.id,
      organizationName: 'Innovent Productions Inc.',
      website: 'https://innovent-productions.example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockAttendeeProfiles.set(attendeeUser.id, {
      id: uuidv4(),
      userId: attendeeUser.id,
      firstName: 'John',
      lastName: 'Attendee',
      headline: 'Software Engineer',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Populate roles
    const assignRole = (userId: string, roleName: string) => {
      const id = uuidv4();
      mockUserRoles.set(id, { id, userId, roleId: mockRoles.get(roleName)!.id, roleName });
    };

    assignRole(adminUser.id, 'ADMIN');
    assignRole(ownerUser.id, 'EVENT_OWNER');
    assignRole(otherOwnerUser.id, 'EVENT_OWNER');
    assignRole(sponsorUser.id, 'SPONSOR');
    assignRole(vendorUser.id, 'VENDOR');
    assignRole(providerUser.id, 'PROVIDER');
    assignRole(attendeeUser.id, 'ATTENDEE');

    // Populate events
    mockEvents.set(testEvent.id, testEvent);

    // Populate refresh tokens for provider (to verify suspension revocation)
    const providerRefreshToken = {
      id: uuidv4(),
      userId: providerUser.id,
      tokenHash: 'sample_token_hash_provider',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 7 * 86400000),
      createdAt: new Date(),
    };
    mockRefreshTokens.set(providerRefreshToken.id, providerRefreshToken);

    const mockPrisma = {
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue(true),
      $transaction: jest.fn().mockImplementation(async (callback) => callback(mockPrisma)),

      role: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.name) return mockRoles.get(where.name) || null;
          if (where.id) {
            return Array.from(mockRoles.values()).find((r) => r.id === where.id) || null;
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(() => Array.from(mockRoles.values())),
      },

      userRole: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          return Array.from(mockUserRoles.values())
            .filter((ur) => ur.userId === where.userId)
            .map((ur) => ({
              ...ur,
              role: mockRoles.get(ur.roleName),
            }));
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const id = uuidv4();
          const roleObj = Array.from(mockRoles.values()).find((r) => r.id === data.roleId);
          const ur = {
            id,
            userId: data.userId,
            roleId: data.roleId,
            roleName: roleObj ? roleObj.name : 'UNKNOWN',
          };
          mockUserRoles.set(id, ur);
          return ur;
        }),
      },

      user: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          for (const u of mockUsers.values()) {
            if (where.id && u.id !== where.id) continue;
            if (where.email && u.email !== where.email) continue;
            if (where.status && u.status !== where.status) continue;
            if (where.deletedAt === null && u.deletedAt !== null) continue;

            const roles = Array.from(mockUserRoles.values())
              .filter((ur) => ur.userId === u.id)
              .map((ur) => ({ role: mockRoles.get(ur.roleName) }));

            return {
              ...u,
              userRoles: roles,
              sponsorProfile: mockSponsorProfiles.get(u.id) || null,
              vendorProfile: mockVendorProfiles.get(u.id) || null,
              providerProfile: mockProviderProfiles.get(u.id) || null,
              eventOwnerProfile: mockEventOwnerProfiles.get(u.id) || null,
              organizerProfile: mockOrganizerProfiles.get(u.id) || null,
              attendeeProfile: mockAttendeeProfiles.get(u.id) || null,
              mediaProfile: null,
            };
          }
          return null;
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const u = where.id
            ? mockUsers.get(where.id)
            : Array.from(mockUsers.values()).find((usr) => usr.email === where.email);
          if (!u) return null;
          const roles = Array.from(mockUserRoles.values())
            .filter((ur) => ur.userId === u.id)
            .map((ur) => ({ role: mockRoles.get(ur.roleName) }));
          return {
            ...u,
            userRoles: roles,
            sponsorProfile: mockSponsorProfiles.get(u.id) || null,
            vendorProfile: mockVendorProfiles.get(u.id) || null,
            providerProfile: mockProviderProfiles.get(u.id) || null,
            eventOwnerProfile: mockEventOwnerProfiles.get(u.id) || null,
            organizerProfile: mockOrganizerProfiles.get(u.id) || null,
            attendeeProfile: mockAttendeeProfiles.get(u.id) || null,
            mediaProfile: null,
          };
        }),
        findMany: jest.fn().mockImplementation(({ where, skip = 0, take = 20 }) => {
          const results = [];
          for (const u of mockUsers.values()) {
            if (where.deletedAt === null && u.deletedAt !== null) continue;
            if (where.status && u.status !== where.status) continue;

            const roles = Array.from(mockUserRoles.values())
              .filter((ur) => ur.userId === u.id)
              .map((ur) => ({ role: mockRoles.get(ur.roleName) }));

            if (where.userRoles?.some?.role?.name) {
              const reqRole = where.userRoles.some.role.name;
              if (!roles.some((r) => r.role?.name === reqRole)) continue;
            }

            results.push({
              ...u,
              userRoles: roles,
              sponsorProfile: mockSponsorProfiles.get(u.id) || null,
              vendorProfile: mockVendorProfiles.get(u.id) || null,
              providerProfile: mockProviderProfiles.get(u.id) || null,
              eventOwnerProfile: mockEventOwnerProfiles.get(u.id) || null,
              organizerProfile: mockOrganizerProfiles.get(u.id) || null,
              attendeeProfile: mockAttendeeProfiles.get(u.id) || null,
              mediaProfile: null,
            });
          }
          return results.slice(skip, skip + take);
        }),
        count: jest.fn().mockImplementation(({ where }) => {
          let count = 0;
          for (const u of mockUsers.values()) {
            if (where.deletedAt === null && u.deletedAt !== null) continue;
            if (where.status && u.status !== where.status) continue;
            if (where.userRoles?.some?.role?.name) {
              const reqRole = where.userRoles.some.role.name;
              const hasRole = Array.from(mockUserRoles.values()).some(
                (ur) => ur.userId === u.id && ur.roleName === reqRole,
              );
              if (!hasRole) continue;
            }
            count++;
          }
          return count;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const u = mockUsers.get(where.id);
          if (!u) throw new Error('User not found');
          Object.assign(u, data, { updatedAt: new Date() });
          return { ...u };
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const id = uuidv4();
          const newUser = {
            id,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            approvedAt: null,
            approvedByUserId: null,
            rejectedAt: null,
            rejectionReason: null,
            suspendedAt: null,
            suspensionReason: null,
          };
          mockUsers.set(id, newUser);
          return newUser;
        }),
      },

      refreshToken: {
        updateMany: jest.fn().mockImplementation(({ where, data }) => {
          let count = 0;
          for (const rt of mockRefreshTokens.values()) {
            if (where.userId && rt.userId !== where.userId) continue;
            if (where.revokedAt === null && rt.revokedAt !== null) continue;
            Object.assign(rt, data);
            count++;
          }
          return { count };
        }),
        create: jest.fn().mockResolvedValue({}),
      },

      sponsorProfile: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }) => mockSponsorProfiles.get(where.userId) || null),
        upsert: jest.fn().mockImplementation(({ where, update, create }) => {
          let p = mockSponsorProfiles.get(where.userId);
          if (p) {
            Object.assign(p, update, { updatedAt: new Date() });
          } else {
            p = {
              id: uuidv4(),
              userId: where.userId,
              ...create,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            mockSponsorProfiles.set(where.userId, p);
          }
          return { ...p };
        }),
      },

      vendorProfile: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }) => mockVendorProfiles.get(where.userId) || null),
        upsert: jest.fn().mockImplementation(({ where, update, create }) => {
          let p = mockVendorProfiles.get(where.userId);
          if (p) {
            Object.assign(p, update, { updatedAt: new Date() });
          } else {
            p = {
              id: uuidv4(),
              userId: where.userId,
              ...create,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            mockVendorProfiles.set(where.userId, p);
          }
          return { ...p };
        }),
      },

      providerProfile: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }) => mockProviderProfiles.get(where.userId) || null),
        upsert: jest.fn().mockImplementation(({ where, update, create }) => {
          let p = mockProviderProfiles.get(where.userId);
          if (p) {
            Object.assign(p, update, { updatedAt: new Date() });
          } else {
            p = {
              id: uuidv4(),
              userId: where.userId,
              ...create,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            mockProviderProfiles.set(where.userId, p);
          }
          return { ...p };
        }),
      },

      eventOwnerProfile: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }) => mockEventOwnerProfiles.get(where.userId) || null),
        upsert: jest.fn().mockImplementation(({ where, update, create }) => {
          let p = mockEventOwnerProfiles.get(where.userId);
          if (p) {
            Object.assign(p, update, { updatedAt: new Date() });
          } else {
            p = {
              id: uuidv4(),
              userId: where.userId,
              ...create,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            mockEventOwnerProfiles.set(where.userId, p);
          }
          return { ...p };
        }),
      },

      organizerProfile: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }) => mockOrganizerProfiles.get(where.userId) || null),
        upsert: jest.fn().mockImplementation(({ where, update, create }) => {
          let p = mockOrganizerProfiles.get(where.userId);
          if (p) {
            Object.assign(p, update, { updatedAt: new Date() });
          } else {
            p = {
              id: uuidv4(),
              userId: where.userId,
              ...create,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            mockOrganizerProfiles.set(where.userId, p);
          }
          return { ...p };
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const id = uuidv4();
          const p = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
          mockOrganizerProfiles.set(data.userId, p);
          return p;
        }),
      },

      attendeeProfile: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }) => mockAttendeeProfiles.get(where.userId) || null),
        upsert: jest.fn().mockImplementation(({ where, update, create }) => {
          let p = mockAttendeeProfiles.get(where.userId);
          if (p) {
            Object.assign(p, update, { updatedAt: new Date() });
          } else {
            p = {
              id: uuidv4(),
              userId: where.userId,
              ...create,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            mockAttendeeProfiles.set(where.userId, p);
          }
          return { ...p };
        }),
      },

      mediaProfile: {
        findUnique: jest.fn().mockReturnValue(null),
        upsert: jest.fn().mockImplementation(({ create }) => ({ id: uuidv4(), ...create })),
      },

      event: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          for (const ev of mockEvents.values()) {
            if (where.id && ev.id !== where.id) continue;
            if (where.deletedAt === null && ev.deletedAt !== null) continue;
            return { ...ev };
          }
          return null;
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => mockEvents.get(where.id) || null),
      },

      eventOrganizer: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const key = `${where.eventId_userId.eventId}_${where.eventId_userId.userId}`;
          return mockEventOrganizers.get(key) || null;
        }),
        upsert: jest.fn().mockImplementation(({ where, create }) => {
          const key = `${where.eventId_userId.eventId}_${where.eventId_userId.userId}`;
          let eo = mockEventOrganizers.get(key);
          if (!eo) {
            eo = { id: uuidv4(), ...create, createdAt: new Date() };
            mockEventOrganizers.set(key, eo);
          }
          return { ...eo };
        }),
      },

      organizerInvitation: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id) return mockOrganizerInvitations.get(where.id) || null;
          if (where.tokenHash) {
            for (const inv of mockOrganizerInvitations.values()) {
              if (inv.tokenHash === where.tokenHash) return { ...inv };
            }
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          const results = [];
          for (const inv of mockOrganizerInvitations.values()) {
            if (where.eventId && inv.eventId !== where.eventId) continue;
            results.push({ ...inv });
          }
          return results;
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const id = uuidv4();
          const inv = {
            id,
            ...data,
            acceptedAt: null,
            acceptedByUserId: null,
            revokedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockOrganizerInvitations.set(id, inv);
          return { ...inv };
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const inv = mockOrganizerInvitations.get(where.id);
          if (!inv) throw new Error('Invitation not found');
          Object.assign(inv, data, { updatedAt: new Date() });
          return { ...inv };
        }),
        updateMany: jest.fn().mockImplementation(({ where, data }) => {
          let count = 0;
          for (const inv of mockOrganizerInvitations.values()) {
            if (where.eventId && inv.eventId !== where.eventId) continue;
            if (where.email && inv.email !== where.email) continue;
            if (where.status && inv.status !== where.status) continue;
            Object.assign(inv, data, { updatedAt: new Date() });
            count++;
          }
          return { count };
        }),
      },

      outboxEvent: {
        create: jest.fn().mockImplementation(({ data }) => {
          const ev = {
            id: `outbox-${Date.now()}-${Math.random()}`,
            ...data,
            createdAt: new Date(),
          };
          mockOutboxEvents.push(ev);
          return ev;
        }),
      },

      auditLog: {
        create: jest.fn().mockImplementation(({ data }) => {
          const al = { id: uuidv4(), ...data, timestamp: new Date() };
          mockAuditLogs.push(al);
          return al;
        }),
      },
    };

    const mockRedis = {
      getClient: jest.fn().mockReturnValue({
        set: jest.fn().mockResolvedValue('OK'),
        get: jest.fn().mockResolvedValue(null),
        del: jest.fn().mockResolvedValue(1),
        incr: jest.fn().mockResolvedValue(1),
        expire: jest.fn().mockResolvedValue(1),
      }),
      ping: jest.fn().mockResolvedValue(true),
    };

    const mockQueue = {
      addJob: jest.fn().mockResolvedValue(undefined),
      getQueue: jest.fn().mockReturnValue({
        add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(RedisService)
      .useValue(mockRedis)
      .overrideProvider(QueueService)
      .useValue(mockQueue)
      .compile();

    tokenService = moduleFixture.get<TokenService>(TokenService);

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createGlobalValidationPipe());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();

    // Generate valid tokens
    const tokens = await Promise.all([
      tokenService.generateTokens(adminUser.id, adminUser.email, ['ADMIN'], []),
      tokenService.generateTokens(ownerUser.id, ownerUser.email, ['EVENT_OWNER'], []),
      tokenService.generateTokens(otherOwnerUser.id, otherOwnerUser.email, ['EVENT_OWNER'], []),
      tokenService.generateTokens(sponsorUser.id, sponsorUser.email, ['SPONSOR'], []),
      tokenService.generateTokens(vendorUser.id, vendorUser.email, ['VENDOR'], []),
      tokenService.generateTokens(providerUser.id, providerUser.email, ['PROVIDER'], []),
      tokenService.generateTokens(attendeeUser.id, attendeeUser.email, ['ATTENDEE'], []),
    ]);

    adminToken = tokens[0].accessToken;
    ownerToken = tokens[1].accessToken;
    otherOwnerToken = tokens[2].accessToken;
    sponsorToken = tokens[3].accessToken;
    vendorToken = tokens[4].accessToken;
    providerToken = tokens[5].accessToken;
    attendeeToken = tokens[6].accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // =========================================================================
  // 1. ADMIN APPROVALS & ACCOUNT LIFECYCLE
  // =========================================================================
  describe('Admin Approvals Management (/api/v1/admin/approvals)', () => {
    it('GET /: should reject non-admin access with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/approvals')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/admin/approvals')
        .set('Authorization', `Bearer ${sponsorToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/admin/approvals')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(403);
    });

    it('GET /: should allow admin to view paginated approvals queue', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/approvals?status=PENDING')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toBeDefined();
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.total).toBeDefined();
      expect(res.body.data.page).toBe(1);
      // Should find pending sponsor and vendor
      const emails = res.body.data.items.map((i: any) => i.email);
      expect(emails).toContain(sponsorUser.email);
      expect(emails).toContain(vendorUser.email);
    });

    it('GET /:id: should return full admin review view for an account', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/approvals/${sponsorUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(sponsorUser.id);
      expect(res.body.data.email).toBe(sponsorUser.email);
      expect(res.body.data.status).toBe(AccountStatus.PENDING);
      expect(res.body.data.profile).toBeDefined();
      expect(res.body.data.profile.companyName).toBe('Acme Enterprise Solutions');
    });

    it('POST /:id/approve: should approve pending sponsor account', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/approvals/${sponsorUser.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(AccountStatus.ACTIVE);

      // Verify in-memory user updated
      const updated = mockUsers.get(sponsorUser.id);
      expect(updated.status).toBe(AccountStatus.ACTIVE);
      expect(updated.approvedByUserId).toBe(adminUser.id);

      // Verify outbox event emitted
      const approvalEvent = mockOutboxEvents.find(
        (e) => e.eventType === 'ACCOUNT_APPROVED' && e.aggregateId === sponsorUser.id,
      );
      expect(approvalEvent).toBeDefined();
    });

    it('POST /:id/approve: should be idempotent if called on already active account', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/approvals/${sponsorUser.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(AccountStatus.ACTIVE);
      expect(res.body.data.message).toContain('already approved');
    });

    it('POST /:id/reject: should reject pending vendor account with reason', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/approvals/${vendorUser.id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Commercial registration certificate was unreadable.' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(AccountStatus.REJECTED);

      // Verify in-memory user updated
      const updated = mockUsers.get(vendorUser.id);
      expect(updated.status).toBe(AccountStatus.REJECTED);
      expect(updated.rejectionReason).toBe('Commercial registration certificate was unreadable.');

      // Verify outbox event emitted
      const rejectionEvent = mockOutboxEvents.find(
        (e) => e.eventType === 'ACCOUNT_REJECTED' && e.aggregateId === vendorUser.id,
      );
      expect(rejectionEvent).toBeDefined();
    });

    it('POST /:id/suspend: should suspend active provider account and invalidate sessions', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/approvals/${providerUser.id}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Policy violation: safety complaints received.' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(AccountStatus.SUSPENDED);

      // Verify in-memory user updated
      const updated = mockUsers.get(providerUser.id);
      expect(updated.status).toBe(AccountStatus.SUSPENDED);
      expect(updated.suspensionReason).toBe('Policy violation: safety complaints received.');

      // Verify refresh token revocation
      const rt = Array.from(mockRefreshTokens.values()).find((r) => r.userId === providerUser.id);
      expect(rt?.revokedAt).not.toBeNull();

      // Verify outbox event emitted
      const suspensionEvent = mockOutboxEvents.find(
        (e) => e.eventType === 'ACCOUNT_SUSPENDED' && e.aggregateId === providerUser.id,
      );
      expect(suspensionEvent).toBeDefined();
    });

    it('POST /:id/reactivate: should restore suspended provider to ACTIVE', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/approvals/${providerUser.id}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(AccountStatus.ACTIVE);

      const updated = mockUsers.get(providerUser.id);
      expect(updated.status).toBe(AccountStatus.ACTIVE);
      expect(updated.suspendedAt).toBeNull();
      expect(updated.suspensionReason).toBeNull();
    });
  });

  // =========================================================================
  // 2. BUSINESS PROFILES & PUBLIC PROJECTIONS
  // =========================================================================
  describe('Business Profiles & Public API (/api/v1/profile & /api/v1/public)', () => {
    it('GET /profile: should return authenticated user own profile with details', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/profile')
        .set('Authorization', `Bearer ${sponsorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(sponsorUser.id);
      expect(res.body.data.email).toBe(sponsorUser.email);
      expect(res.body.data.roles).toContain('SPONSOR');
      expect(res.body.data.profile.companyName).toBe('Acme Enterprise Solutions');
    });

    it('PATCH /profile: should update authenticated user profile', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/profile')
        .set('Authorization', `Bearer ${sponsorToken}`)
        .send({
          website: 'https://acme-global.example.com',
          description: 'Updated enterprise cloud descriptions',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.profile.website).toBe('https://acme-global.example.com');
      expect(res.body.data.profile.description).toBe('Updated enterprise cloud descriptions');
    });

    it('PATCH /business-profile: should update provider specific profile fields', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/business-profile')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          businessName: 'Elite Gourmet Catering Co.',
          description: 'Michelin-grade corporate dining and banquets',
          city: 'Jeddah',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.profile.businessName).toBe('Elite Gourmet Catering Co.');
      expect(res.body.data.profile.city).toBe('Jeddah');
    });

    it('PATCH /business-profile: should update vendor specific profile fields', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/business-profile')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          companyName: 'Global Stage & Sound Pro',
          serviceCategory: 'Lighting & Sound',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.profile.companyName).toBe('Global Stage & Sound Pro');
    });

    it('GET /public/businesses/:id: should return public-safe profile for active business', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/public/businesses/${sponsorUser.id}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(sponsorUser.id);
      expect(res.body.data.role).toBe('SPONSOR');
      expect(res.body.data.name).toBe('Acme Enterprise Solutions');
      expect(res.body.data.category).toBe('Technology');

      // Security check: must NOT leak email, phone, documents, or timestamps
      expect(res.body.data.email).toBeUndefined();
      expect(res.body.data.phone).toBeUndefined();
      expect(res.body.data.passwordHash).toBeUndefined();
      expect(res.body.data.documents).toBeUndefined();
      expect(res.body.data.approvedAt).toBeUndefined();
    });

    it('GET /public/businesses/:id: should return 404 for Attendee (anti-enumeration)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/public/businesses/${attendeeUser.id}`)
        .expect(404);
    });

    it('GET /public/businesses/:id: should return 404 for Non-existent ID', async () => {
      await request(app.getHttpServer()).get(`/api/v1/public/businesses/${uuidv4()}`).expect(404);
    });

    it('GET /public/users/:id: should return sanitized public user info', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/public/users/${attendeeUser.id}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(attendeeUser.id);
      expect(res.body.data.firstName).toBe('John');
      expect(res.body.data.lastName).toBe('Attendee');

      // Security: no sensitive details
      expect(res.body.data.email).toBeUndefined();
      expect(res.body.data.phone).toBeUndefined();
      expect(res.body.data.passwordHash).toBeUndefined();
    });
  });

  // =========================================================================
  // 3. ORGANIZER INVITATION WORKFLOW & SECURITY
  // =========================================================================
  describe('Organizer Invitations Workflow (/api/v1/events/:eventId/organizer-invitations)', () => {
    let createdInvitationId: string;
    let invitationRawToken: string;
    const inviteeEmail = 'invited.co.organizer@innovent.app';

    it('POST /events/:eventId/organizer-invitations: should allow event owner to invite organizer', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/events/${testEvent.id}/organizer-invitations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          email: inviteeEmail,
          expiresDays: 5,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.invitation).toBeDefined();
      expect(res.body.data.invitation.email).toBe(inviteeEmail);
      expect(res.body.data.invitation.status).toBe(InvitationStatus.PENDING);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.invitationUrl).toContain(res.body.data.token);

      createdInvitationId = res.body.data.invitation.id;
      invitationRawToken = res.body.data.token;

      // Verify token hash is stored in DB, raw token is NOT stored
      const stored = mockOrganizerInvitations.get(createdInvitationId);
      expect(stored.tokenHash).toBeDefined();
      expect(stored.tokenHash).not.toBe(invitationRawToken);

      // Verify outbox notification event
      const notifEvent = mockOutboxEvents.find(
        (e) =>
          e.eventType === 'ORGANIZER_INVITATION_CREATED' && e.aggregateId === createdInvitationId,
      );
      expect(notifEvent).toBeDefined();
      expect(notifEvent.payload.email).toBe(inviteeEmail);
    });

    it('POST /events/:eventId/organizer-invitations: should reject unauthorized event owner (IDOR)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/events/${testEvent.id}/organizer-invitations`)
        .set('Authorization', `Bearer ${otherOwnerToken}`)
        .send({
          email: 'unauthorized.invite@innovent.app',
        })
        .expect(403);
    });

    it('POST /events/:eventId/organizer-invitations: should reject attendee attempt to invite', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/events/${testEvent.id}/organizer-invitations`)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          email: 'attendee.invite@innovent.app',
        })
        .expect(403);
    });

    it('GET /events/:eventId/organizer-invitations: should list invitations without revealing token hash', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/events/${testEvent.id}/organizer-invitations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      const found = res.body.data.find((i: any) => i.id === createdInvitationId);
      expect(found).toBeDefined();
      expect(found.tokenHash).toBeUndefined(); // Crucial security check: never expose hash
    });

    it('POST /organizer-invitations/accept: should accept invitation, create user, assign role & junction', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/organizer-invitations/accept')
        .send({
          token: invitationRawToken,
          password: 'Password123!Secure',
          firstName: 'Sara',
          lastName: 'Organizer',
          phone: '+966500000008',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.userId).toBeDefined();
      expect(res.body.data.eventId).toBe(testEvent.id);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();

      const newUserId = res.body.data.userId;

      // Verify user created in DB
      const dbUser = mockUsers.get(newUserId);
      expect(dbUser).toBeDefined();
      expect(dbUser.status).toBe(AccountStatus.ACTIVE);

      // Verify ORGANIZER role assigned
      const roleAssigned = Array.from(mockUserRoles.values()).some(
        (ur) => ur.userId === newUserId && ur.roleName === 'ORGANIZER',
      );
      expect(roleAssigned).toBe(true);

      // Verify EventOrganizer record created
      const eoKey = `${testEvent.id}_${newUserId}`;
      const eoRecord = mockEventOrganizers.get(eoKey);
      expect(eoRecord).toBeDefined();
      expect(eoRecord.assignedBy).toBe(ownerUser.id);

      // Verify invitation status updated to ACCEPTED
      const inv = mockOrganizerInvitations.get(createdInvitationId);
      expect(inv.status).toBe(InvitationStatus.ACCEPTED);
      expect(inv.acceptedByUserId).toBe(newUserId);

      // Verify acceptance outbox event emitted
      const acceptedEvent = mockOutboxEvents.find(
        (e) =>
          e.eventType === 'ORGANIZER_INVITATION_ACCEPTED' && e.aggregateId === createdInvitationId,
      );
      expect(acceptedEvent).toBeDefined();
    });

    it('POST /organizer-invitations/accept: should reject replay of already accepted token with 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/organizer-invitations/accept')
        .send({
          token: invitationRawToken,
          password: 'Password123!Secure',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('already been accepted');
    });

    it('POST /organizer-invitations/accept: should reject invalid / random token with 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/organizer-invitations/accept')
        .send({
          token: 'totally_invalid_nonexistent_token_string',
          password: 'Password123!Secure',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Invalid or unknown');
    });

    it('POST /organizer-invitations/:id/revoke: should allow event owner to revoke pending invitation', async () => {
      // 1. Create a fresh invitation
      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/events/${testEvent.id}/organizer-invitations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          email: 'to_be_revoked@innovent.app',
        })
        .expect(201);

      const toRevokeId = createRes.body.data.invitation.id;
      const toRevokeToken = createRes.body.data.token;

      // 2. Revoke invitation
      const revokeRes = await request(app.getHttpServer())
        .post(`/api/v1/organizer-invitations/${toRevokeId}/revoke`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(revokeRes.body.success).toBe(true);
      expect(revokeRes.body.data.status).toBe(InvitationStatus.REVOKED);

      // 3. Attempting to accept revoked token must be rejected with 400
      await request(app.getHttpServer())
        .post('/api/v1/organizer-invitations/accept')
        .send({
          token: toRevokeToken,
          password: 'Password123!Secure',
        })
        .expect(400);
    });
  });
});
