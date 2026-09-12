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
import { RevenueService } from '../src/modules/payments/services/revenue.service';
import { ModerationAction } from '../src/modules/admin/dto/admin-moderation.dto';
import {
  AccountStatus,
  CommunityMeetupStatus,
  CommunityPostStatus,
  EventStatus,
  EventVisibility,
  PaymentPurpose,
  PaymentStatus,
  Prisma,
  ReportStatus,
  ReportTargetType,
  SponsorAdStatus,
} from '@prisma/client';

describe('Sprint 10: Admin Operations, Moderation, Reporting & Platform Governance (e2e)', () => {
  jest.setTimeout(45000);
  let app: INestApplication;
  let tokenService: TokenService;

  // In-memory Hermetic Store
  type MockEntity = any;
  const mockUsers = new Map<string, MockEntity>();
  const mockRoles = new Map<string, MockEntity>([
    ['ADMIN', { id: uuidv4(), name: 'ADMIN', rolePermissions: [] }],
    ['ATTENDEE', { id: uuidv4(), name: 'ATTENDEE', rolePermissions: [] }],
    ['VENDOR', { id: uuidv4(), name: 'VENDOR', rolePermissions: [] }],
  ]);
  const mockUserRoles = new Map<string, MockEntity>();
  const mockEvents = new Map<string, MockEntity>();
  const mockCommunities = new Map<string, MockEntity>();
  const mockCommunityPosts = new Map<string, MockEntity>();
  const mockCommunityReplies = new Map<string, MockEntity>();
  const mockCommunityMeetups = new Map<string, MockEntity>();
  const mockVendorServices = new Map<string, MockEntity>();
  const mockC2bServices = new Map<string, MockEntity>();
  const mockSponsorAds = new Map<string, MockEntity>();
  const mockReports = new Map<string, MockEntity>();
  const mockAuditLogs: MockEntity[] = [];
  const mockRefreshTokens = new Map<string, MockEntity>();

  // Users
  const adminUser = {
    id: uuidv4(),
    email: 'admin_lead@innovent.app',
    phone: '+966500000001',
    status: AccountStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const attendeeUser = {
    id: uuidv4(),
    email: 'attendee_regular@innovent.app',
    phone: '+966500000002',
    status: AccountStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const targetUser = {
    id: uuidv4(),
    email: '=HYPERLINK("malicious")@innovent.app', // CSV injection payload in email
    phone: '+966500000003',
    status: AccountStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  let adminToken: string;
  let attendeeToken: string;

  // Mock Entities
  const testCommunity = {
    id: uuidv4(),
    name: 'Tech Innovators',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const testPost = {
    id: uuidv4(),
    communityId: testCommunity.id,
    authorId: attendeeUser.id,
    title: 'Inappropriate Post',
    content: 'Violating terms of service',
    status: CommunityPostStatus.PUBLISHED,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const testReply = {
    id: uuidv4(),
    postId: testPost.id,
    authorId: attendeeUser.id,
    content: 'Offensive reply',
    status: CommunityPostStatus.PUBLISHED,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const testMeetup = {
    id: uuidv4(),
    communityId: testCommunity.id,
    creatorId: attendeeUser.id,
    title: 'Flagged Meetup',
    status: CommunityMeetupStatus.SCHEDULED,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const testVendorService = {
    id: uuidv4(),
    vendorProfileId: uuidv4(),
    title: 'Violating Catering',
    description: 'Bad quality',
    price: new Prisma.Decimal(500),
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const testC2bService = {
    id: uuidv4(),
    providerProfileId: uuidv4(),
    eventId: uuidv4(),
    title: 'Dubious Service',
    description: 'Spam service',
    price: new Prisma.Decimal(200),
    isAvailable: true,
    expiresAt: new Date(Date.now() + 86400000),
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const testSponsorAd = {
    id: uuidv4(),
    sponsorProfileId: uuidv4(),
    eventId: uuidv4(),
    title: 'Spam Sponsor Banner',
    description: 'Deceptive promo',
    destinationUrl: 'https://spam.example.com',
    status: SponsorAdStatus.APPROVED,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const testEvent = {
    id: uuidv4(),
    name: 'Global Tech Expo 2026',
    status: EventStatus.PUBLISHED,
    visibility: EventVisibility.PUBLIC,
    startsAt: new Date(Date.now() + 86400000),
    endsAt: new Date(Date.now() + 172800000),
    capacity: 1000,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    // Populate entities
    mockUsers.set(adminUser.id, adminUser);
    mockUsers.set(attendeeUser.id, attendeeUser);
    mockUsers.set(targetUser.id, targetUser);

    const assignRole = (userId: string, roleName: string) => {
      const id = uuidv4();
      mockUserRoles.set(id, { id, userId, roleId: mockRoles.get(roleName)!.id, roleName });
    };

    assignRole(adminUser.id, 'ADMIN');
    assignRole(attendeeUser.id, 'ATTENDEE');
    assignRole(targetUser.id, 'ATTENDEE');

    // Add active refresh token for target user
    mockRefreshTokens.set('token-1', {
      id: 'token-1',
      userId: targetUser.id,
      token: 'hash-1',
      revokedAt: null,
    });

    mockCommunities.set(testCommunity.id, testCommunity);
    mockCommunityPosts.set(testPost.id, testPost);
    mockCommunityReplies.set(testReply.id, testReply);
    mockCommunityMeetups.set(testMeetup.id, testMeetup);
    mockVendorServices.set(testVendorService.id, testVendorService);
    mockC2bServices.set(testC2bService.id, testC2bService);
    mockSponsorAds.set(testSponsorAd.id, testSponsorAd);
    mockEvents.set(testEvent.id, testEvent);

    const mockPrisma = {
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue(true),
      $transaction: jest.fn().mockImplementation(async (cb) => {
        if (typeof cb === 'function') return cb(mockPrisma);
        return cb;
      }),

      user: {
        count: jest.fn().mockImplementation((args?: { where?: any }) => {
          const where = args?.where;
          let list = Array.from(mockUsers.values());
          if (where?.status) list = list.filter((u) => u.status === where.status);
          if (where?.deletedAt === null) list = list.filter((u) => u.deletedAt === null);
          if (where?.OR) {
            list = list.filter((u) => {
              return where.OR.some((clause: any) => {
                if (
                  clause.email?.contains &&
                  u.email.toLowerCase().includes(clause.email.contains.toLowerCase())
                ) {
                  return true;
                }
                if (clause.phone?.contains && u.phone && u.phone.includes(clause.phone.contains)) {
                  return true;
                }
                return false;
              });
            });
          }
          return list.length;
        }),
        groupBy: jest.fn().mockResolvedValue([{ status: AccountStatus.ACTIVE, _count: { id: 3 } }]),
        findMany: jest.fn().mockImplementation(({ where, skip, take }) => {
          let list = Array.from(mockUsers.values());
          if (where?.status) list = list.filter((u) => u.status === where.status);
          if (where?.email?.contains) {
            list = list.filter((u) =>
              u.email.toLowerCase().includes(where.email.contains.toLowerCase()),
            );
          }
          if (where?.OR) {
            list = list.filter((u) => {
              return where.OR.some((clause: any) => {
                if (
                  clause.email?.contains &&
                  u.email.toLowerCase().includes(clause.email.contains.toLowerCase())
                ) {
                  return true;
                }
                if (clause.phone?.contains && u.phone && u.phone.includes(clause.phone.contains)) {
                  return true;
                }
                return false;
              });
            });
          }
          const sliced = list.slice(skip || 0, (skip || 0) + (take || 100));
          return sliced.map((u) => ({
            ...u,
            userRoles: Array.from(mockUserRoles.values())
              .filter((ur) => ur.userId === u.id)
              .map((ur) => ({ role: { name: ur.roleName } })),
          }));
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const u = mockUsers.get(where.id);
          if (!u) return null;
          return {
            ...u,
            userRoles: Array.from(mockUserRoles.values())
              .filter((ur) => ur.userId === u.id)
              .map((ur) => ({ role: { name: ur.roleName } })),
            sponsorProfile: null,
            vendorProfile: null,
            providerProfile: null,
            attendeeProfile: null,
            eventOwnerProfile: null,
          };
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.id) {
            const u = mockUsers.get(where.id);
            if (!u || (where.deletedAt === null && u.deletedAt !== null)) return null;
            return {
              ...u,
              userRoles: Array.from(mockUserRoles.values())
                .filter((ur) => ur.userId === u.id)
                .map((ur) => ({ role: { name: ur.roleName } })),
              sponsorProfile: null,
              vendorProfile: null,
            };
          }
          return null;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const u = mockUsers.get(where.id);
          if (!u) return null;
          const updated = { ...u, ...data, updatedAt: new Date() };
          mockUsers.set(where.id, updated);
          return {
            ...updated,
            userRoles: Array.from(mockUserRoles.values())
              .filter((ur) => ur.userId === updated.id)
              .map((ur) => ({ role: { name: ur.roleName } })),
          };
        }),
      },

      role: {
        findMany: jest.fn().mockResolvedValue(Array.from(mockRoles.values())),
        findUnique: jest.fn().mockImplementation(({ where }) => mockRoles.get(where.name) || null),
      },

      userRole: {
        groupBy: jest.fn().mockResolvedValue([
          { roleId: mockRoles.get('ADMIN')!.id, _count: { id: 1 } },
          { roleId: mockRoles.get('ATTENDEE')!.id, _count: { id: 2 } },
        ]),
      },

      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockImplementation(({ where, data }) => {
          let count = 0;
          for (const [id, t] of mockRefreshTokens.entries()) {
            if (
              t.userId === where.userId &&
              (where.revokedAt === null ? t.revokedAt === null : true)
            ) {
              mockRefreshTokens.set(id, { ...t, ...data });
              count++;
            }
          }
          return { count };
        }),
      },

      event: {
        count: jest.fn().mockImplementation(() => mockEvents.size),
        groupBy: jest
          .fn()
          .mockResolvedValue([{ status: EventStatus.PUBLISHED, _count: { id: mockEvents.size } }]),
        findMany: jest.fn().mockImplementation(() => Array.from(mockEvents.values())),
        findFirst: jest.fn().mockImplementation(({ where }) => mockEvents.get(where.id) || null),
      },

      eventRegistration: { count: jest.fn().mockResolvedValue(10) },

      community: {
        count: jest.fn().mockImplementation(() => mockCommunities.size),
        findMany: jest.fn().mockImplementation(() => Array.from(mockCommunities.values())),
        findFirst: jest
          .fn()
          .mockImplementation(({ where }) => mockCommunities.get(where.id) || null),
      },

      communitySponsorship: { count: jest.fn().mockResolvedValue(1) },
      communityMember: { count: jest.fn().mockResolvedValue(5) },

      communityPost: {
        count: jest.fn().mockImplementation(() => mockCommunityPosts.size),
        findFirst: jest
          .fn()
          .mockImplementation(({ where }) => mockCommunityPosts.get(where.id) || null),
        findUnique: jest
          .fn()
          .mockImplementation(({ where }) => mockCommunityPosts.get(where.id) || null),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const p = mockCommunityPosts.get(where.id);
          if (!p) return null;
          const updated = { ...p, ...data, updatedAt: new Date() };
          mockCommunityPosts.set(where.id, updated);
          return updated;
        }),
      },

      communityPostReply: {
        count: jest.fn().mockImplementation(() => mockCommunityReplies.size),
        findFirst: jest
          .fn()
          .mockImplementation(({ where }) => mockCommunityReplies.get(where.id) || null),
        findUnique: jest
          .fn()
          .mockImplementation(({ where }) => mockCommunityReplies.get(where.id) || null),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const r = mockCommunityReplies.get(where.id);
          if (!r) return null;
          const updated = { ...r, ...data, updatedAt: new Date() };
          mockCommunityReplies.set(where.id, updated);
          return updated;
        }),
      },

      communityMeetup: {
        findFirst: jest
          .fn()
          .mockImplementation(({ where }) => mockCommunityMeetups.get(where.id) || null),
        findUnique: jest
          .fn()
          .mockImplementation(({ where }) => mockCommunityMeetups.get(where.id) || null),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const m = mockCommunityMeetups.get(where.id);
          if (!m) return null;
          const updated = { ...m, ...data, updatedAt: new Date() };
          mockCommunityMeetups.set(where.id, updated);
          return updated;
        }),
      },

      vendorService: {
        count: jest.fn().mockImplementation(() => mockVendorServices.size),
        findFirst: jest
          .fn()
          .mockImplementation(({ where }) => mockVendorServices.get(where.id) || null),
        findUnique: jest
          .fn()
          .mockImplementation(({ where }) => mockVendorServices.get(where.id) || null),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const v = mockVendorServices.get(where.id);
          if (!v) return null;
          const updated = { ...v, ...data, updatedAt: new Date() };
          mockVendorServices.set(where.id, updated);
          return updated;
        }),
      },

      c2bService: {
        count: jest.fn().mockImplementation(() => mockC2bServices.size),
        findFirst: jest
          .fn()
          .mockImplementation(({ where }) => mockC2bServices.get(where.id) || null),
        findUnique: jest
          .fn()
          .mockImplementation(({ where }) => mockC2bServices.get(where.id) || null),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const c = mockC2bServices.get(where.id);
          if (!c) return null;
          const updated = { ...c, ...data, updatedAt: new Date() };
          mockC2bServices.set(where.id, updated);
          return updated;
        }),
      },

      sponsorAd: {
        findFirst: jest
          .fn()
          .mockImplementation(({ where }) => mockSponsorAds.get(where.id) || null),
        findUnique: jest
          .fn()
          .mockImplementation(({ where }) => mockSponsorAds.get(where.id) || null),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const a = mockSponsorAds.get(where.id);
          if (!a) return null;
          const updated = { ...a, ...data, updatedAt: new Date() };
          mockSponsorAds.set(where.id, updated);
          return updated;
        }),
      },

      rfq: { count: jest.fn().mockResolvedValue(2) },
      quotation: { count: jest.fn().mockResolvedValue(3) },
      c2bBooking: { count: jest.fn().mockResolvedValue(4) },
      sponsorProfile: { count: jest.fn().mockResolvedValue(1) },
      vendorProfile: { count: jest.fn().mockResolvedValue(1) },
      providerProfile: { count: jest.fn().mockResolvedValue(1) },
      subscription: { count: jest.fn().mockResolvedValue(5) },

      payment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: uuidv4(),
            userId: attendeeUser.id,
            amount: new Prisma.Decimal(500),
            currency: 'SAR',
            status: PaymentStatus.SUCCEEDED,
            purpose: PaymentPurpose.COMMUNITY_SPONSORSHIP,
            stripePaymentIntentId: 'pi_test_123',
            refundAmount: null,
            createdAt: new Date(),
          },
        ]),
      },

      // Moderation Reports
      report: {
        count: jest.fn().mockImplementation((args?: { where?: any }) => {
          const where = args?.where;
          let list = Array.from(mockReports.values());
          if (where?.status) list = list.filter((r) => r.status === where.status);
          if (where?.reporterId) list = list.filter((r) => r.reporterId === where.reporterId);
          return list.length;
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          return (
            Array.from(mockReports.values()).find((r) => {
              if (where.reporterId && r.reporterId !== where.reporterId) return false;
              if (where.targetType && r.targetType !== where.targetType) return false;
              if (where.targetId && r.targetId !== where.targetId) return false;
              if (where.status?.in && !where.status.in.includes(r.status)) return false;
              return true;
            }) || null
          );
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const r = mockReports.get(where.id);
          if (!r) return null;
          return {
            ...r,
            reporter: mockUsers.get(r.reporterId) || null,
            resolvedBy: r.resolvedByUserId ? mockUsers.get(r.resolvedByUserId) : null,
          };
        }),
        findMany: jest.fn().mockImplementation(({ where, skip, take }) => {
          let list = Array.from(mockReports.values());
          if (where?.reporterId) list = list.filter((r) => r.reporterId === where.reporterId);
          if (where?.status) list = list.filter((r) => r.status === where.status);
          if (where?.targetType) list = list.filter((r) => r.targetType === where.targetType);
          const sliced = list.slice(skip || 0, (skip || 0) + (take || 100));
          return sliced.map((r) => ({
            ...r,
            reporter: mockUsers.get(r.reporterId) || null,
            resolvedBy: r.resolvedByUserId ? mockUsers.get(r.resolvedByUserId) : null,
          }));
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const id = uuidv4();
          const r = {
            id,
            ...data,
            resolvedByUserId: null,
            resolvedAt: null,
            resolutionNote: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockReports.set(id, r);
          return {
            ...r,
            reporter: mockUsers.get(r.reporterId) || null,
            resolvedBy: null,
          };
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const r = mockReports.get(where.id);
          if (!r) return null;
          const updated = { ...r, ...data, updatedAt: new Date() };
          mockReports.set(where.id, updated);
          return {
            ...updated,
            reporter: mockUsers.get(updated.reporterId) || null,
            resolvedBy: updated.resolvedByUserId ? mockUsers.get(updated.resolvedByUserId) : null,
          };
        }),
      },

      auditLog: {
        count: jest.fn().mockImplementation(() => mockAuditLogs.length),
        findMany: jest.fn().mockImplementation(({ skip, take }) => {
          return mockAuditLogs.slice(skip || 0, (skip || 0) + (take || 100)).map((l) => ({
            ...l,
            actor: l.actorUserId ? mockUsers.get(l.actorUserId) : null,
          }));
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const l = mockAuditLogs.find((entry) => entry.id === where.id);
          if (!l) return null;
          return {
            ...l,
            actor: l.actorUserId ? mockUsers.get(l.actorUserId) : null,
          };
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const entry = { id: uuidv4(), ...data, createdAt: new Date() };
          mockAuditLogs.push(entry);
          return entry;
        }),
      },

      outboxEvent: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: uuidv4(), ...data })),
      },
    };

    const mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      setex: jest.fn().mockResolvedValue('OK'),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      ping: jest.fn().mockResolvedValue('PONG'),
    };

    const mockQueue = {
      addJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    const mockRevenueService = {
      getRevenueReport: jest.fn().mockResolvedValue({
        totalGrossRevenue: 75000,
        netRevenue: 71000,
        totalRefunds: 4000,
        currency: 'SAR',
        successfulTransactions: 150,
        refundedTransactions: 8,
        breakdownByPurpose: {
          COMMUNITY_SPONSORSHIP: { gross: 25000, refunds: 1000, net: 24000, count: 50 },
          SUBSCRIPTION: { gross: 50000, refunds: 3000, net: 47000, count: 100 },
        },
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
      .overrideProvider(RevenueService)
      .useValue(mockRevenueService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createGlobalValidationPipe());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();

    tokenService = moduleFixture.get<TokenService>(TokenService);

    // Generate JWTs
    const adminTokens = await tokenService.generateTokens(
      adminUser.id,
      adminUser.email,
      ['ADMIN'],
      ['*'],
    );
    adminToken = adminTokens.accessToken;

    const attendeeTokens = await tokenService.generateTokens(
      attendeeUser.id,
      attendeeUser.email,
      ['ATTENDEE'],
      ['read:all'],
    );
    attendeeToken = attendeeTokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  // ============================================================================
  // 1. ADMIN DASHBOARD
  // ============================================================================
  describe('1. Admin Dashboard (GET /api/v1/admin/dashboard)', () => {
    it('1.1 should return 401 when unauthenticated', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/admin/dashboard');
      expect(res.status).toBe(401);
    });

    it('1.2 should return 403 when non-admin accesses dashboard', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${attendeeToken}`);
      expect(res.status).toBe(403);
    });

    it('1.3 should return comprehensive dashboard metrics for admin', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data).toHaveProperty('users');
      expect(data).toHaveProperty('events');
      expect(data).toHaveProperty('communities');
      expect(data).toHaveProperty('marketplace');
      expect(data).toHaveProperty('business');
      expect(data).toHaveProperty('subscriptions');
      expect(data).toHaveProperty('financial');
      expect(data).toHaveProperty('moderation');
      expect(data).toHaveProperty('recentActivity');

      // Authoritative financial KPI assertions
      expect(data.financial.totalGrossRevenue).toBe(75000);
      expect(data.financial.totalNetRevenue).toBe(71000);
      expect(data.financial.totalRefunds).toBe(4000);
      expect(data.financial.currency).toBe('SAR');
    });
  });

  // ============================================================================
  // 2. ADMIN USER GOVERNANCE & SESSION REVOCATION
  // ============================================================================
  describe('2. Admin User Governance (User Management & Revocation)', () => {
    it('2.1 should list users with pagination and role filter', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/users?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toBeInstanceOf(Array);
      expect(res.body.data.total).toBeGreaterThanOrEqual(3);
    });

    it('2.2 should search users by email keyword', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/users?search=malicious')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].id).toBe(targetUser.id);
    });

    it('2.3 should get sanitized user details by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/users/${targetUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(targetUser.id);
      expect(res.body.data.email).toBe(targetUser.email);
      expect(res.body.data.roles).toContain('ATTENDEE');
      expect(res.body.data.passwordHash).toBeUndefined(); // Sanitized check
    });

    it('2.4 should return 404 when querying non-existent user', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/users/${uuidv4()}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });

    it('2.5 should prevent admin self-suspension with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${adminUser.id}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Accidental lock' });

      expect(res.status).toBe(400);
    });

    it('2.6 should require reason when suspending a user', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${targetUser.id}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('2.7 should suspend target user, update status and revoke active refresh tokens', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${targetUser.id}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Repeated spam violations' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(AccountStatus.SUSPENDED);
      expect(res.body.data.suspensionReason).toBe('Repeated spam violations');

      // Verify token revocation in mock store
      const revokedToken = mockRefreshTokens.get('token-1');
      expect(revokedToken.revokedAt).not.toBeNull();
    });

    it('2.8 should reactivate suspended user successfully', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${targetUser.id}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(AccountStatus.ACTIVE);
    });

    it('2.9 should prevent admin self-deactivation with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${adminUser.id}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Leave company' });

      expect(res.status).toBe(400);
    });

    it('2.10 should soft-deactivate target user and revoke active sessions', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${targetUser.id}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'GDPR right to be forgotten' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(AccountStatus.DEACTIVATED);
      expect(res.body.data.deletedAt).not.toBeNull();
    });

    it('2.11 should deny non-admin from performing suspension', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${targetUser.id}/suspend`)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({ reason: 'Unauthorized attempt' });

      expect(res.status).toBe(403);
    });
  });

  // ============================================================================
  // 3. CONTENT REPORTING WORKFLOW
  // ============================================================================
  describe('3. Content Reporting Workflow (POST/GET /api/v1/reports)', () => {
    let createdReportId: string;

    it('3.1 should reject report with non-existent target ID (404 Not Found)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/reports')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          targetType: ReportTargetType.COMMUNITY_POST,
          targetId: uuidv4(),
          reason: 'Spam content',
        });

      expect(res.status).toBe(404);
    });

    it('3.2 should allow authenticated user to report a community post (201 Created)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/reports')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          targetType: ReportTargetType.COMMUNITY_POST,
          targetId: testPost.id,
          reason: 'Harassment & offensive language',
          description: 'Post contains terms violating code of conduct',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.targetType).toBe(ReportTargetType.COMMUNITY_POST);
      expect(res.body.data.targetId).toBe(testPost.id);
      expect(res.body.data.status).toBe(ReportStatus.OPEN);
      createdReportId = res.body.data.id;
    });

    it('3.3 should prevent duplicate active reports with 409 Conflict', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/reports')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          targetType: ReportTargetType.COMMUNITY_POST,
          targetId: testPost.id,
          reason: 'Duplicate flag attempt',
        });

      expect(res.status).toBe(409);
    });

    it('3.4 should list authenticated user reports via GET /api/v1/reports/my', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/my?page=1&limit=10')
        .set('Authorization', `Bearer ${attendeeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].id).toBe(createdReportId);
    });

    it('3.5 should deny non-admin from admin reports queue (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/reports')
        .set('Authorization', `Bearer ${attendeeToken}`);

      expect(res.status).toBe(403);
    });

    it('3.6 should allow admin to view reports queue with filtering', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/admin/reports?status=${ReportStatus.OPEN}&targetType=${ReportTargetType.COMMUNITY_POST}`,
        )
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items[0].id).toBe(createdReportId);
    });

    it('3.7 should get single report details by ID for admin', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/reports/${createdReportId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(createdReportId);
      expect(res.body.data.reporter).toBeDefined();
    });

    it('3.8 should resolve report via PATCH /api/v1/admin/reports/:id', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/reports/${createdReportId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: ReportStatus.RESOLVED,
          resolutionNote: 'Post content reviewed and action taken',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(ReportStatus.RESOLVED);
      expect(res.body.data.resolvedByUserId).toBe(adminUser.id);
      expect(res.body.data.resolvedAt).not.toBeNull();
    });

    it('3.9 should reject modifying already closed report with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/reports/${createdReportId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: ReportStatus.DISMISSED,
        });

      expect(res.status).toBe(400);
    });

    it('3.10 should reject transitioning report back to OPEN with 400 Bad Request', async () => {
      // Create another report
      const newReportRes = await request(app.getHttpServer())
        .post('/api/v1/reports')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          targetType: ReportTargetType.COMMUNITY_REPLY,
          targetId: testReply.id,
          reason: 'Spam reply',
        });
      const newRepId = newReportRes.body.data.id;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/reports/${newRepId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: ReportStatus.OPEN,
        });

      expect(res.status).toBe(400);
    });
  });

  // ============================================================================
  // 4. ADMINISTRATIVE CONTENT MODERATION ACTIONS
  // ============================================================================
  describe('4. Administrative Content Moderation (POST /api/v1/admin/moderation)', () => {
    it('4.1 should deny non-admin from executing moderation (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/moderation')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          targetType: ReportTargetType.COMMUNITY_POST,
          targetId: testPost.id,
          action: ModerationAction.HIDE,
          reason: 'Unauthorized test',
        });

      expect(res.status).toBe(403);
    });

    it('4.2 should moderate community post: HIDE sets status HIDDEN', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/moderation')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          targetType: ReportTargetType.COMMUNITY_POST,
          targetId: testPost.id,
          action: ModerationAction.HIDE,
          reason: 'Toxic community post',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
      expect(mockCommunityPosts.get(testPost.id).status).toBe('HIDDEN');
    });

    it('4.3 should moderate community post: RESTORE sets status PUBLISHED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/moderation')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          targetType: ReportTargetType.COMMUNITY_POST,
          targetId: testPost.id,
          action: ModerationAction.RESTORE,
          reason: 'Restored after user appeal',
        });

      expect(res.status).toBe(200);
      expect(mockCommunityPosts.get(testPost.id).status).toBe('PUBLISHED');
    });

    it('4.4 should moderate community reply: HIDE sets status HIDDEN', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/moderation')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          targetType: ReportTargetType.COMMUNITY_REPLY,
          targetId: testReply.id,
          action: ModerationAction.HIDE,
          reason: 'Inappropriate language in reply',
        });

      expect(res.status).toBe(200);
      expect(mockCommunityReplies.get(testReply.id).status).toBe(CommunityPostStatus.HIDDEN);
    });

    it('4.5 should moderate community meetup: HIDE sets status CANCELLED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/moderation')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          targetType: ReportTargetType.COMMUNITY_MEETUP,
          targetId: testMeetup.id,
          action: ModerationAction.HIDE,
          reason: 'Suspicious gathering cancelled',
        });

      expect(res.status).toBe(200);
      expect(mockCommunityMeetups.get(testMeetup.id).status).toBe(CommunityMeetupStatus.CANCELLED);
    });

    it('4.6 should moderate vendor service: HIDE sets isActive false', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/moderation')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          targetType: ReportTargetType.VENDOR_SERVICE,
          targetId: testVendorService.id,
          action: ModerationAction.HIDE,
          reason: 'Vendor non-compliance',
        });

      expect(res.status).toBe(200);
      expect(mockVendorServices.get(testVendorService.id).isActive).toBe(false);
    });

    it('4.7 should moderate c2b service: HIDE sets isAvailable false', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/moderation')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          targetType: ReportTargetType.C2B_SERVICE,
          targetId: testC2bService.id,
          action: ModerationAction.HIDE,
          reason: 'Provider service suspended',
        });

      expect(res.status).toBe(200);
      expect(mockC2bServices.get(testC2bService.id).isAvailable).toBe(false);
    });

    it('4.8 should moderate sponsor ad: HIDE sets status REJECTED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/moderation')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          targetType: ReportTargetType.SPONSOR_AD,
          targetId: testSponsorAd.id,
          action: ModerationAction.HIDE,
          reason: 'Sponsor ad misleading claim',
        });

      expect(res.status).toBe(200);
      expect(mockSponsorAds.get(testSponsorAd.id).status).toBe(SponsorAdStatus.REJECTED);
    });

    it('4.9 should return 404 if target entity for moderation is not found', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/moderation')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          targetType: ReportTargetType.SPONSOR_AD,
          targetId: uuidv4(),
          action: ModerationAction.HIDE,
          reason: 'Non-existent ad',
        });

      expect(res.status).toBe(404);
    });
  });

  // ============================================================================
  // 5. IMMUTABLE AUDIT LOGS
  // ============================================================================
  describe('5. Immutable Audit Logs (GET /api/v1/admin/audit-logs)', () => {
    it('5.1 should deny non-admin from querying audit logs (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${attendeeToken}`);

      expect(res.status).toBe(403);
    });

    it('5.2 should list audit logs with pagination for admin', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/audit-logs?page=1&limit=20')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toBeInstanceOf(Array);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    });

    it('5.3 should verify that audit logs sanitize sensitive data (no tokens or secrets)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      for (const item of items) {
        expect(item).not.toHaveProperty('password');
        expect(item).not.toHaveProperty('token');
        expect(item).not.toHaveProperty('secret');
      }
    });

    it('5.4 should retrieve audit log entry by ID', async () => {
      const logId = mockAuditLogs[0].id;
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/audit-logs/${logId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(logId);
    });

    it('5.5 should return 404 for non-existent audit log ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/audit-logs/${uuidv4()}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ============================================================================
  // 6. OPERATIONAL AGGREGATIONS & REVENUE REUSE
  // ============================================================================
  describe('6. Operational Reports (GET /api/v1/admin/reports/*)', () => {
    it('6.1 should deny non-admin from operational reports (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/reports/users')
        .set('Authorization', `Bearer ${attendeeToken}`);

      expect(res.status).toBe(403);
    });

    it('6.2 should return users operational report', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/reports/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalUsers).toBeGreaterThanOrEqual(3);
      expect(res.body.data.statusBreakdown).toBeDefined();
      expect(res.body.data.roleBreakdown).toBeDefined();
    });

    it('6.3 should return events operational report', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/reports/events')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalEvents).toBeGreaterThanOrEqual(1);
    });

    it('6.4 should return communities operational report', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/reports/communities')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalCommunities).toBeGreaterThanOrEqual(1);
    });

    it('6.5 should return marketplace operational report', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/reports/marketplace')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalVendorServices).toBeGreaterThanOrEqual(1);
    });

    it('6.6 should return authoritative revenue report (reusing RevenueService)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/reports/revenue')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalGrossRevenue).toBe(75000);
      expect(res.body.data.netRevenue).toBe(71000);
      expect(res.body.data.totalRefunds).toBe(4000);
      expect(res.body.data.currency).toBe('SAR');
    });
  });

  // ============================================================================
  // 7. CSV EXPORTS & SPREADSHEET FORMULA INJECTION DEFENSE
  // ============================================================================
  describe('7. CSV Exports & Formula Injection Neutralization', () => {
    it('7.1 should deny non-admin from exporting data (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/exports/users')
        .set('Authorization', `Bearer ${attendeeToken}`);

      expect(res.status).toBe(403);
    });

    it('7.2 should export users CSV and neutralize formula injection attacks', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/exports/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain(
        'attachment; filename="innovent-users-export.csv"',
      );

      // Crucial Security Verification: Formula Injection Defense
      // The targetUser had email: =HYPERLINK("malicious")@innovent.app
      // It must be neutralized with a leading single quote '=
      expect(res.text).toContain("'=HYPERLINK");
    });

    it('7.3 should export events CSV', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/exports/events')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('Global Tech Expo 2026');
    });

    it('7.4 should export transactions CSV', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/exports/transactions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('500');
    });

    it('7.5 should export audit logs CSV', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/exports/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
    });

    it('7.6 should export reports CSV', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/exports/reports')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
    });
  });
});
