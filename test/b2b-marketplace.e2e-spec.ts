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
import { AccountStatus, PricingModel, QuotationStatus, RfqStatus } from '@prisma/client';

describe('B2B Marketplace, Vendor Services, RFQ & Quotation Workflow E2E Suite (e2e)', () => {
  jest.setTimeout(45000);
  let app: INestApplication;
  let tokenService: TokenService;

  // Hermetic in-memory store
  type MockEntity = any;
  const mockUsers = new Map<string, MockEntity>();
  const mockRoles = new Map<string, MockEntity>([
    ['ADMIN', { id: uuidv4(), name: 'ADMIN', rolePermissions: [] }],
    ['SPONSOR', { id: uuidv4(), name: 'SPONSOR', rolePermissions: [] }],
    ['VENDOR', { id: uuidv4(), name: 'VENDOR', rolePermissions: [] }],
    ['ATTENDEE', { id: uuidv4(), name: 'ATTENDEE', rolePermissions: [] }],
  ]);
  const mockUserRoles = new Map<string, MockEntity>();
  const mockVendorProfiles = new Map<string, MockEntity>();
  const mockSponsorProfiles = new Map<string, MockEntity>();
  const mockVendorServices = new Map<string, MockEntity>();
  const mockRfqs = new Map<string, MockEntity>();
  const mockRfqItems = new Map<string, MockEntity>();
  const mockRfqClarifications = new Map<string, MockEntity>();
  const mockQuotations = new Map<string, MockEntity>();
  const mockQuotationItems = new Map<string, MockEntity>();
  const mockOutboxEvents: MockEntity[] = [];
  const mockAuditLogs: MockEntity[] = [];

  // Test accounts
  const vendorUser = {
    id: uuidv4(),
    email: 'vendor@innovent.app',
    phone: '+966501111111',
    status: AccountStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    passwordHash: 'hash_vendor',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const otherVendorUser = {
    id: uuidv4(),
    email: 'other_vendor@innovent.app',
    phone: '+966502222222',
    status: AccountStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    passwordHash: 'hash_other_vendor',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const inactiveVendorUser = {
    id: uuidv4(),
    email: 'inactive_vendor@innovent.app',
    phone: '+966503333333',
    status: AccountStatus.PENDING,
    emailVerifiedAt: new Date(),
    passwordHash: 'hash_inactive_vendor',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const sponsorUser = {
    id: uuidv4(),
    email: 'sponsor@innovent.app',
    phone: '+966504444444',
    status: AccountStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    passwordHash: 'hash_sponsor',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const otherSponsorUser = {
    id: uuidv4(),
    email: 'other_sponsor@innovent.app',
    phone: '+966505555555',
    status: AccountStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    passwordHash: 'hash_other_sponsor',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const attendeeUser = {
    id: uuidv4(),
    email: 'attendee@innovent.app',
    phone: '+966506666666',
    status: AccountStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    passwordHash: 'hash_attendee',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  let vendorToken: string;
  let otherVendorToken: string;
  let inactiveVendorToken: string;
  let sponsorToken: string;
  let otherSponsorToken: string;
  let attendeeToken: string;

  beforeAll(async () => {
    // Populate mock users
    [
      vendorUser,
      otherVendorUser,
      inactiveVendorUser,
      sponsorUser,
      otherSponsorUser,
      attendeeUser,
    ].forEach((u) => mockUsers.set(u.id, u));

    // Populate profiles
    mockVendorProfiles.set(vendorUser.id, {
      id: uuidv4(),
      userId: vendorUser.id,
      companyName: 'Apex Audio & Staging',
      serviceCategory: 'Audio & Visual',
      city: 'Riyadh',
      country: 'Saudi Arabia',
      website: 'https://apexstage.sa',
      description: 'Professional event staging, LED displays, and sound reinforcement',
      logoUrl: 'https://apexstage.sa/logo.png',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockVendorProfiles.set(otherVendorUser.id, {
      id: uuidv4(),
      userId: otherVendorUser.id,
      companyName: 'Spectra Lights',
      serviceCategory: 'Lighting',
      city: 'Jeddah',
      country: 'Saudi Arabia',
      website: 'https://spectralights.sa',
      description: 'Concert lighting and laser shows',
      logoUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockSponsorProfiles.set(sponsorUser.id, {
      id: uuidv4(),
      userId: sponsorUser.id,
      companyName: 'Aramco Ventures',
      industry: 'Energy & Tech',
      website: 'https://aramcoventures.example.com',
      city: 'Dhahran',
      country: 'Saudi Arabia',
      tier: 'PLATINUM',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const assignRole = (userId: string, roleName: string) => {
      const id = uuidv4();
      mockUserRoles.set(id, { id, userId, roleId: mockRoles.get(roleName)!.id, roleName });
    };

    assignRole(vendorUser.id, 'VENDOR');
    assignRole(otherVendorUser.id, 'VENDOR');
    assignRole(inactiveVendorUser.id, 'VENDOR');
    assignRole(sponsorUser.id, 'SPONSOR');
    assignRole(otherSponsorUser.id, 'SPONSOR');
    assignRole(attendeeUser.id, 'ATTENDEE');

    const mockPrisma = {
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue(true),
      $transaction: jest.fn().mockImplementation(async (cb) => cb(mockPrisma)),

      role: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.name) return mockRoles.get(where.name) || null;
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

            if (where.userRoles?.some?.role?.name) {
              const reqRole = where.userRoles.some.role.name;
              if (!roles.some((r) => r.role.name === reqRole)) continue;
            }

            return {
              ...u,
              userRoles: roles,
              vendorProfile: mockVendorProfiles.get(u.id) || null,
              sponsorProfile: mockSponsorProfiles.get(u.id) || null,
            };
          }
          return null;
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const u = mockUsers.get(where.id);
          if (!u) return null;
          const roles = Array.from(mockUserRoles.values())
            .filter((ur) => ur.userId === u.id)
            .map((ur) => ({ role: mockRoles.get(ur.roleName) }));
          return {
            ...u,
            userRoles: roles,
            vendorProfile: mockVendorProfiles.get(u.id) || null,
            sponsorProfile: mockSponsorProfiles.get(u.id) || null,
          };
        }),
        findMany: jest.fn().mockImplementation(({ where, skip = 0, take = 20 }) => {
          const matched: any[] = [];
          for (const u of mockUsers.values()) {
            if (where.status && u.status !== where.status) continue;
            if (where.deletedAt === null && u.deletedAt !== null) continue;
            const profile = mockVendorProfiles.get(u.id);
            if (!profile) continue;

            matched.push({
              id: u.id,
              vendorProfile: profile,
            });
          }
          return matched.slice(skip, skip + take);
        }),
        count: jest.fn().mockImplementation(({ where }) => {
          let c = 0;
          for (const u of mockUsers.values()) {
            if (where.status && u.status !== where.status) continue;
            if (where.deletedAt === null && u.deletedAt !== null) continue;
            if (mockVendorProfiles.has(u.id)) c++;
          }
          return c;
        }),
      },

      vendorService: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = uuidv4();
          const s = {
            id,
            vendorId: data.vendorId,
            name: data.name,
            description: data.description,
            category: data.category,
            pricingModel: data.pricingModel,
            price: data.price,
            currency: data.currency || 'SAR',
            deliveryDuration: data.deliveryDuration,
            serviceAreas: data.serviceAreas || [],
            tags: data.tags || [],
            minimumOrder: data.minimumOrder || 1,
            isActive: data.isActive !== undefined ? data.isActive : true,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
          };
          mockVendorServices.set(id, s);
          return s;
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          for (const s of mockVendorServices.values()) {
            if (where.id && s.id !== where.id) continue;
            if (where.vendorId && s.vendorId !== where.vendorId) continue;
            if (where.isActive !== undefined && s.isActive !== where.isActive) continue;
            if (where.deletedAt === null && s.deletedAt !== null) continue;

            const vendor = mockUsers.get(s.vendorId);
            return {
              ...s,
              vendor: {
                id: vendor.id,
                vendorProfile: mockVendorProfiles.get(vendor.id) || null,
              },
            };
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(({ where, skip = 0, take = 20 }) => {
          const list: any[] = [];
          for (const s of mockVendorServices.values()) {
            if (where.id?.in && !where.id.in.includes(s.id)) continue;
            if (where.vendorId && s.vendorId !== where.vendorId) continue;
            if (where.isActive !== undefined && s.isActive !== where.isActive) continue;
            if (where.deletedAt === null && s.deletedAt !== null) continue;

            const vendor = mockUsers.get(s.vendorId);
            list.push({
              ...s,
              vendor: {
                id: vendor.id,
                vendorProfile: mockVendorProfiles.get(vendor.id) || null,
              },
            });
          }
          return list.slice(skip, skip + take);
        }),
        count: jest.fn().mockImplementation(({ where }) => {
          let c = 0;
          for (const s of mockVendorServices.values()) {
            if (where.vendorId && s.vendorId !== where.vendorId) continue;
            if (where.isActive !== undefined && s.isActive !== where.isActive) continue;
            if (where.deletedAt === null && s.deletedAt !== null) continue;
            c++;
          }
          return c;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const s = mockVendorServices.get(where.id);
          if (!s) return null;
          const updated = {
            ...s,
            ...data,
            updatedAt: new Date(),
          };
          mockVendorServices.set(where.id, updated);
          return updated;
        }),
      },

      rfq: {
        create: jest.fn().mockImplementation(({ data, include }) => {
          const id = uuidv4();
          const items = (data.items?.create || []).map((i: any) => {
            const itemId = uuidv4();
            const itemObj = { id: itemId, rfqId: id, ...i, createdAt: new Date() };
            mockRfqItems.set(itemId, itemObj);
            return itemObj;
          });

          const r = {
            id,
            sponsorId: data.sponsorId,
            vendorId: data.vendorId,
            eventId: data.eventId || null,
            title: data.title,
            description: data.description,
            requirements: data.requirements || null,
            status: data.status,
            expiresAt: data.expiresAt,
            sentAt: data.sentAt || null,
            viewedAt: null,
            acceptedAt: null,
            rejectedAt: null,
            cancelledAt: null,
            cancellationReason: null,
            rejectionReason: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockRfqs.set(id, r);

          if (include?.items) {
            return { ...r, items, clarifications: [] };
          }
          return r;
        }),
        findUnique: jest.fn().mockImplementation(({ where, include }) => {
          const r = mockRfqs.get(where.id);
          if (!r) return null;
          const items = Array.from(mockRfqItems.values()).filter((i) => i.rfqId === r.id);
          const clarifications = Array.from(mockRfqClarifications.values()).filter(
            (c) => c.rfqId === r.id,
          );
          return {
            ...r,
            items: include?.items ? items : r.items,
            clarifications: include?.clarifications ? clarifications : [],
          };
        }),
        findMany: jest.fn().mockImplementation(({ where, skip = 0, take = 20 }) => {
          const list: any[] = [];
          for (const r of mockRfqs.values()) {
            if (where.OR) {
              const matchedOr = where.OR.some(
                (cond: any) =>
                  (cond.sponsorId && cond.sponsorId === r.sponsorId) ||
                  (cond.vendorId && cond.vendorId === r.vendorId),
              );
              if (!matchedOr) continue;
            }
            if (where.status && r.status !== where.status) continue;
            const itemCount = Array.from(mockRfqItems.values()).filter(
              (i) => i.rfqId === r.id,
            ).length;
            list.push({
              ...r,
              _count: { items: itemCount },
            });
          }
          return list.slice(skip, skip + take);
        }),
        count: jest.fn().mockImplementation(({ where }) => {
          let c = 0;
          for (const r of mockRfqs.values()) {
            if (where.OR) {
              const matchedOr = where.OR.some(
                (cond: any) =>
                  (cond.sponsorId && cond.sponsorId === r.sponsorId) ||
                  (cond.vendorId && cond.vendorId === r.vendorId),
              );
              if (!matchedOr) continue;
            }
            if (where.status && r.status !== where.status) continue;
            c++;
          }
          return c;
        }),
        update: jest.fn().mockImplementation(({ where, data, include }) => {
          const r = mockRfqs.get(where.id);
          if (!r) return null;
          const updated = {
            ...r,
            ...data,
            updatedAt: new Date(),
          };
          mockRfqs.set(where.id, updated);
          const items = Array.from(mockRfqItems.values()).filter((i) => i.rfqId === r.id);
          const clarifications = Array.from(mockRfqClarifications.values()).filter(
            (c) => c.rfqId === r.id,
          );
          if (include?.items) updated.items = items;
          if (include?.clarifications) updated.clarifications = clarifications;
          return updated;
        }),
        updateMany: jest.fn().mockImplementation(({ where, data }) => {
          let count = 0;
          for (const r of mockRfqs.values()) {
            if (where.id && r.id !== where.id) continue;
            if (where.status?.not && r.status === where.status.not) continue;
            Object.assign(r, data, { updatedAt: new Date() });
            count++;
          }
          return { count };
        }),
      },

      rfqClarification: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = uuidv4();
          const c = { id, ...data, createdAt: new Date() };
          mockRfqClarifications.set(id, c);
          return c;
        }),
      },

      quotation: {
        aggregate: jest.fn().mockImplementation(({ where }) => {
          let maxV = 0;
          for (const q of mockQuotations.values()) {
            if (q.rfqId === where.rfqId && q.version > maxV) {
              maxV = q.version;
            }
          }
          return { _max: { version: maxV > 0 ? maxV : null } };
        }),
        create: jest.fn().mockImplementation(({ data, include }) => {
          const id = uuidv4();
          const items = (data.items?.create || []).map((i: any) => {
            const itemId = uuidv4();
            const qi = { id: itemId, quotationId: id, ...i };
            mockQuotationItems.set(itemId, qi);
            return qi;
          });

          const q = {
            id,
            rfqId: data.rfqId,
            vendorId: data.vendorId,
            version: data.version,
            status: data.status,
            subtotal: data.subtotal,
            tax: data.tax,
            discount: data.discount,
            total: data.total,
            currency: data.currency,
            validUntil: data.validUntil,
            notes: data.notes || null,
            acceptedAt: null,
            rejectedAt: null,
            rejectionReason: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockQuotations.set(id, q);

          if (include?.items) {
            return { ...q, items };
          }
          return q;
        }),
        findUnique: jest.fn().mockImplementation(({ where, include }) => {
          const q = mockQuotations.get(where.id);
          if (!q) return null;
          const items = Array.from(mockQuotationItems.values()).filter(
            (i) => i.quotationId === q.id,
          );
          const rfq = mockRfqs.get(q.rfqId);
          return {
            ...q,
            items: include?.items ? items : [],
            rfq: include?.rfq ? rfq : undefined,
          };
        }),
        findMany: jest.fn().mockImplementation(({ where, skip = 0, take = 20 }) => {
          const list: any[] = [];
          for (const q of mockQuotations.values()) {
            if (where.rfqId && q.rfqId !== where.rfqId) continue;
            list.push(q);
          }
          list.sort((a, b) => b.version - a.version);
          return list.slice(skip, skip + take);
        }),
        count: jest.fn().mockImplementation(({ where }) => {
          let c = 0;
          for (const q of mockQuotations.values()) {
            if (where.rfqId && q.rfqId !== where.rfqId) continue;
            c++;
          }
          return c;
        }),
        update: jest.fn().mockImplementation(({ where, data, include }) => {
          const q = mockQuotations.get(where.id);
          if (!q) return null;
          const updated = {
            ...q,
            ...data,
            updatedAt: new Date(),
          };
          mockQuotations.set(where.id, updated);
          const items = Array.from(mockQuotationItems.values()).filter(
            (i) => i.quotationId === q.id,
          );
          if (include?.items) updated.items = items;
          return updated;
        }),
        updateMany: jest.fn().mockImplementation(({ where, data }) => {
          let count = 0;
          for (const q of mockQuotations.values()) {
            if (where.rfqId && q.rfqId !== where.rfqId) continue;
            if (where.id?.not && q.id === where.id.not) continue;
            if (where.status && q.status !== where.status) continue;
            Object.assign(q, data, { updatedAt: new Date() });
            count++;
          }
          return { count };
        }),
      },

      outboxEvent: {
        create: jest.fn().mockImplementation(({ data }) => {
          const obj = { id: uuidv4(), ...data, createdAt: new Date() };
          mockOutboxEvents.push(obj);
          return obj;
        }),
      },

      auditLog: {
        create: jest.fn().mockImplementation(({ data }) => {
          const obj = { id: uuidv4(), ...data, createdAt: new Date() };
          mockAuditLogs.push(obj);
          return obj;
        }),
      },

      refreshToken: {
        create: jest.fn().mockImplementation(({ data }) => {
          return { id: uuidv4(), ...data, createdAt: new Date() };
        }),
      },
    };

    const mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    const mockQueue = {
      addJob: jest.fn().mockResolvedValue(undefined),
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

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createGlobalValidationPipe());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();

    tokenService = app.get<TokenService>(TokenService);

    // Generate JWTs with permissions
    vendorToken = (
      await tokenService.generateTokens(
        vendorUser.id,
        vendorUser.email,
        ['VENDOR'],
        ['manage:vendor_service', 'manage:rfq', 'manage:quotation'],
      )
    ).accessToken;

    otherVendorToken = (
      await tokenService.generateTokens(
        otherVendorUser.id,
        otherVendorUser.email,
        ['VENDOR'],
        ['manage:vendor_service', 'manage:rfq', 'manage:quotation'],
      )
    ).accessToken;

    inactiveVendorToken = (
      await tokenService.generateTokens(
        inactiveVendorUser.id,
        inactiveVendorUser.email,
        ['VENDOR'],
        ['manage:vendor_service'],
      )
    ).accessToken;

    sponsorToken = (
      await tokenService.generateTokens(
        sponsorUser.id,
        sponsorUser.email,
        ['SPONSOR'],
        ['manage:rfq', 'manage:quotation'],
      )
    ).accessToken;

    otherSponsorToken = (
      await tokenService.generateTokens(
        otherSponsorUser.id,
        otherSponsorUser.email,
        ['SPONSOR'],
        ['manage:rfq', 'manage:quotation'],
      )
    ).accessToken;

    attendeeToken = (
      await tokenService.generateTokens(attendeeUser.id, attendeeUser.email, ['ATTENDEE'], [])
    ).accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  let createdServiceId: string;
  let createdRfqId: string;
  let quotationV1Id: string;
  let quotationV2Id: string;

  describe('1. Vendor Services Management (/api/v1/vendor/services)', () => {
    it('should allow active vendor to create a service offering', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/vendor/services')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          name: 'Main Stage P2.6 LED Display',
          description: 'High refresh rate indoor LED screen with processors',
          category: 'Audio & Visual',
          pricingModel: PricingModel.DAILY,
          price: 12500,
          currency: 'SAR',
          deliveryDuration: '1 day',
          serviceAreas: ['Riyadh', 'Jeddah'],
          tags: ['led', 'screen', 'av'],
          minimumOrder: 1,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.name).toBe('Main Stage P2.6 LED Display');
      expect(res.body.data.price).toBe(12500);
      createdServiceId = res.body.data.id;
    });

    it('should forbid attendee from creating service offering', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/vendor/services')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          name: 'Unauthorized Attendee Service',
          description: 'Attendee trying to create service',
          category: 'Audio',
          pricingModel: PricingModel.FIXED,
          price: 1000,
          deliveryDuration: '1 day',
        })
        .expect(403);
    });

    it('should forbid inactive vendor from creating service offering', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/vendor/services')
        .set('Authorization', `Bearer ${inactiveVendorToken}`)
        .send({
          name: 'Inactive Vendor Service',
          description: 'Pending vendor trying to create service',
          category: 'Audio',
          pricingModel: PricingModel.FIXED,
          price: 1000,
          deliveryDuration: '1 day',
        })
        .expect(403);
    });

    it('should list services for authenticated vendor', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/vendor/services')
        .set('Authorization', `Bearer ${vendorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.total).toBe(1);
    });

    it('should prevent other vendor from updating the service (IDOR protection)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/vendor/services/${createdServiceId}`)
        .set('Authorization', `Bearer ${otherVendorToken}`)
        .send({ price: 9000 })
        .expect(403);
    });

    it('should allow owner vendor to update service', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/vendor/services/${createdServiceId}`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ price: 14000, description: 'Updated specs' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.price).toBe(14000);
    });

    it('should deactivate and reactivate service', async () => {
      const deact = await request(app.getHttpServer())
        .post(`/api/v1/vendor/services/${createdServiceId}/deactivate`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .expect(200);
      expect(deact.body.data.isActive).toBe(false);

      const act = await request(app.getHttpServer())
        .post(`/api/v1/vendor/services/${createdServiceId}/activate`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .expect(200);
      expect(act.body.data.isActive).toBe(true);
    });
  });

  describe('2. Public B2B Marketplace Discovery (/api/v1/b2b/services & /api/v1/b2b/vendors)', () => {
    it('should discover active services publicly without token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/b2b/services?category=Audio+%26+Visual')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items[0].vendor.companyName).toBe('Apex Audio & Staging');
    });

    it('should get public service details by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/b2b/services/${createdServiceId}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdServiceId);
      expect(res.body.data.vendor.companyName).toBe('Apex Audio & Staging');
    });

    it('should discover active vendors directory', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/b2b/vendors').expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(2);
    });

    it('should get public vendor profile details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/b2b/vendors/${vendorUser.id}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.companyName).toBe('Apex Audio & Staging');
    });
  });

  describe('3. RFQ Creation, Negotiation & Workflow (/api/v1/b2b/rfqs)', () => {
    it('should reject RFQ with past expiration timestamp', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/b2b/rfqs')
        .set('Authorization', `Bearer ${sponsorToken}`)
        .send({
          vendorId: vendorUser.id,
          title: 'Summit Stage Setup',
          description: 'Need AV equipment',
          expiresAt: new Date(Date.now() - 3600000).toISOString(),
          items: [{ description: 'Main LED Screen', quantity: 1 }],
        })
        .expect(400);
    });

    it('should prevent sponsor from sending RFQ to themselves', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/b2b/rfqs')
        .set('Authorization', `Bearer ${sponsorToken}`)
        .send({
          vendorId: sponsorUser.id,
          title: 'Self RFQ',
          description: 'Self request',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          items: [{ description: 'Item 1', quantity: 1 }],
        })
        .expect(400);
    });

    it('should reject RFQ targeting inactive vendor', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/b2b/rfqs')
        .set('Authorization', `Bearer ${sponsorToken}`)
        .send({
          vendorId: inactiveVendorUser.id,
          title: 'Inactive Target',
          description: 'Trying to contact unverified vendor',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          items: [{ description: 'Item', quantity: 1 }],
        })
        .expect(400);
    });

    it('should allow sponsor to create and send RFQ to active vendor', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/b2b/rfqs')
        .set('Authorization', `Bearer ${sponsorToken}`)
        .send({
          vendorId: vendorUser.id,
          title: 'Saudi Tech Summit 2026 AV Setup',
          description: 'Full staging and display system for 3 conference halls',
          requirements: 'Installation required 24 hours prior to keynote',
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
          items: [
            {
              vendorServiceId: createdServiceId,
              description: 'Main Stage P2.6 LED Display',
              quantity: 2,
              unit: 'screen',
              targetPrice: 12000,
            },
          ],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe(RfqStatus.SENT);
      expect(res.body.data.itemCount).toBe(1);
      createdRfqId = res.body.data.id;
    });

    it('should auto-transition RFQ status to VIEWED when recipient vendor views it', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/b2b/rfqs/${createdRfqId}`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(RfqStatus.VIEWED);
      expect(res.body.data.viewedAt).toBeDefined();
    });

    it('should forbid third-party sponsor or vendor from viewing RFQ (IDOR protection)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/b2b/rfqs/${createdRfqId}`)
        .set('Authorization', `Bearer ${otherSponsorToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/v1/b2b/rfqs/${createdRfqId}`)
        .set('Authorization', `Bearer ${otherVendorToken}`)
        .expect(403);
    });

    it('should allow vendor to post clarification inquiry transitioning status to CLARIFICATION_REQUESTED', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/b2b/rfqs/${createdRfqId}/clarifications`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          message: 'Can you confirm the power availability on stage for the LED processors?',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(RfqStatus.CLARIFICATION_REQUESTED);
      expect(res.body.data.clarifications).toHaveLength(1);
      expect(res.body.data.clarifications[0].message).toContain('power availability');
    });

    it('should allow sponsor to respond to clarification inquiry', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/b2b/rfqs/${createdRfqId}/clarifications`)
        .set('Authorization', `Bearer ${sponsorToken}`)
        .send({
          message: 'Yes, 3-phase 32A power drops are allocated near each screen position.',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.clarifications).toHaveLength(2);
    });
  });

  describe('4. Quotation Submission, Versioning & Arithmetic (/api/v1/b2b/quotations)', () => {
    it('should reject quotation submission from non-recipient vendor', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/b2b/quotations')
        .set('Authorization', `Bearer ${otherVendorToken}`)
        .send({
          rfqId: createdRfqId,
          validUntil: new Date(Date.now() + 5 * 86400000).toISOString(),
          items: [{ description: 'Unapproved Quote', quantity: 1, unitPrice: 5000 }],
        })
        .expect(403);
    });

    it('should reject quotation with negative tax or discount', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/b2b/quotations')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          rfqId: createdRfqId,
          validUntil: new Date(Date.now() + 5 * 86400000).toISOString(),
          tax: -100,
          items: [{ description: 'Test Line', quantity: 1, unitPrice: 5000 }],
        })
        .expect(400);
    });

    it('should submit Quotation Version 1 with server-calculated totals', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/b2b/quotations')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          rfqId: createdRfqId,
          validUntil: new Date(Date.now() + 5 * 86400000).toISOString(),
          currency: 'SAR',
          tax: 3750, // 15% VAT on 25,000
          discount: 1000,
          notes: 'Quote includes rigging, 2 certified technicians, and backup processor.',
          items: [
            {
              description: 'Main Stage P2.6 LED Display (2 units)',
              quantity: 2,
              unitPrice: 12500,
              notes: 'Includes Novastar processors',
            },
          ],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.version).toBe(1);
      expect(res.body.data.status).toBe(QuotationStatus.PENDING);
      expect(res.body.data.subtotal).toBe(25000);
      expect(res.body.data.tax).toBe(3750);
      expect(res.body.data.discount).toBe(1000);
      expect(res.body.data.total).toBe(27750); // 25000 + 3750 - 1000
      quotationV1Id = res.body.data.id;

      // Verify RFQ status updated to QUOTED
      const rfqCheck = await request(app.getHttpServer())
        .get(`/api/v1/b2b/rfqs/${createdRfqId}`)
        .set('Authorization', `Bearer ${sponsorToken}`)
        .expect(200);
      expect(rfqCheck.body.data.status).toBe(RfqStatus.QUOTED);
    });

    it('should submit revised Quotation Version 2 and supersede Version 1', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/b2b/quotations')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          rfqId: createdRfqId,
          validUntil: new Date(Date.now() + 5 * 86400000).toISOString(),
          currency: 'SAR',
          tax: 3600,
          discount: 2000, // Increased discount to 2000 SAR
          notes: 'Revised quotation v2 with special conference discount',
          items: [
            {
              description: 'Main Stage P2.6 LED Display (2 units)',
              quantity: 2,
              unitPrice: 12000,
            },
          ],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.version).toBe(2);
      expect(res.body.data.subtotal).toBe(24000);
      expect(res.body.data.total).toBe(25600); // 24000 + 3600 - 2000
      quotationV2Id = res.body.data.id;

      // Verify v1 was marked SUPERSEDED
      const v1Check = await request(app.getHttpServer())
        .get(`/api/v1/b2b/quotations/${quotationV1Id}`)
        .set('Authorization', `Bearer ${sponsorToken}`)
        .expect(200);
      expect(v1Check.body.data.status).toBe(QuotationStatus.SUPERSEDED);
    });

    it('should list all quotation versions for RFQ', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/b2b/quotations?rfqId=${createdRfqId}`)
        .set('Authorization', `Bearer ${sponsorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.items[0].version).toBe(2);
      expect(res.body.data.items[1].version).toBe(1);
    });
  });

  describe('5. Quotation Acceptance & Concurrency Protection', () => {
    it('should reject acceptance of superseded Quotation v1', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/b2b/quotations/${quotationV1Id}/accept`)
        .set('Authorization', `Bearer ${sponsorToken}`)
        .expect(400);
    });

    it('should prevent non-sponsor from accepting Quotation v2', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/b2b/quotations/${quotationV2Id}/accept`)
        .set('Authorization', `Bearer ${otherSponsorToken}`)
        .expect(403);
    });

    it('should allow sponsor to accept Quotation v2 atomically', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/b2b/quotations/${quotationV2Id}/accept`)
        .set('Authorization', `Bearer ${sponsorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(QuotationStatus.ACCEPTED);
      expect(res.body.data.acceptedAt).toBeDefined();

      // Verify RFQ is now ACCEPTED
      const rfqRes = await request(app.getHttpServer())
        .get(`/api/v1/b2b/rfqs/${createdRfqId}`)
        .set('Authorization', `Bearer ${sponsorToken}`)
        .expect(200);
      expect(rfqRes.body.data.status).toBe(RfqStatus.ACCEPTED);
    });

    it('should block double-acceptance attempt with 400 (already ACCEPTED)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/b2b/quotations/${quotationV2Id}/accept`)
        .set('Authorization', `Bearer ${sponsorToken}`)
        .expect(400);
    });
  });

  describe('6. RFQ Cancellation & Outbox Audit Verification', () => {
    let cancelRfqId: string;

    it('should allow sponsor to cancel an active RFQ', async () => {
      // Create new RFQ for cancellation test
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/b2b/rfqs')
        .set('Authorization', `Bearer ${sponsorToken}`)
        .send({
          vendorId: vendorUser.id,
          title: 'To Be Cancelled RFQ',
          description: 'Event postponed indefinitely',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          items: [{ description: 'Lighting Rig', quantity: 1 }],
        })
        .expect(201);
      cancelRfqId = createRes.body.data.id;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/b2b/rfqs/${cancelRfqId}/cancel`)
        .set('Authorization', `Bearer ${sponsorToken}`)
        .send({ reason: 'Event requirements changed; budget re-allocated' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(RfqStatus.CANCELLED);
      expect(res.body.data.cancellationReason).toContain('budget re-allocated');
    });

    it('should reject operations on cancelled RFQ', async () => {
      // Quotation on cancelled RFQ should fail
      await request(app.getHttpServer())
        .post('/api/v1/b2b/quotations')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          rfqId: cancelRfqId,
          validUntil: new Date(Date.now() + 86400000).toISOString(),
          items: [{ description: 'Late Quote', quantity: 1, unitPrice: 1000 }],
        })
        .expect(400);
    });

    it('should verify Outbox events were recorded for the complete marketplace lifecycle', () => {
      const eventTypes = mockOutboxEvents.map((e) => e.eventType);
      expect(eventTypes).toContain('RFQ_SENT');
      expect(eventTypes).toContain('RFQ_VIEWED');
      expect(eventTypes).toContain('RFQ_CLARIFICATION_REQUESTED');
      expect(eventTypes).toContain('RFQ_QUOTED');
      expect(eventTypes).toContain('RFQ_ACCEPTED');
      expect(eventTypes).toContain('RFQ_CANCELLED');
    });

    it('should verify Audit logs were captured for services, RFQs, and quotations', () => {
      const actions = mockAuditLogs.map((l) => l.action);
      expect(actions).toContain('SERVICE_CREATED');
      expect(actions).toContain('SERVICE_UPDATED');
      expect(actions).toContain('RFQ_SENT');
      expect(actions).toContain('RFQ_VIEWED');
      expect(actions).toContain('RFQ_CLARIFICATION_REQUESTED');
      expect(actions).toContain('QUOTATION_CREATED');
      expect(actions).toContain('QUOTATION_ACCEPTED');
      expect(actions).toContain('RFQ_CANCELLED');
    });
  });
});
