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
import { PAYMENT_PROVIDER } from '../src/infrastructure/payments/payment.interface';
import {
  AccountStatus,
  CommunitySponsorshipStatus,
  PaymentPurpose,
  PaymentStatus,
  Prisma,
  SubscriptionBillingInterval,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';

describe('Sprint 9: Stripe Payments, Sponsored Communities & Subscriptions E2E Suite (e2e)', () => {
  jest.setTimeout(45000);
  let app: INestApplication;
  let tokenService: TokenService;

  // In-memory Hermetic Store
  type MockEntity = any;
  const mockUsers = new Map<string, MockEntity>();
  const mockRoles = new Map<string, MockEntity>([
    ['ADMIN', { id: uuidv4(), name: 'ADMIN', rolePermissions: [] }],
    ['SPONSOR', { id: uuidv4(), name: 'SPONSOR', rolePermissions: [] }],
    ['VENDOR', { id: uuidv4(), name: 'VENDOR', rolePermissions: [] }],
    ['ATTENDEE', { id: uuidv4(), name: 'ATTENDEE', rolePermissions: [] }],
  ]);
  const mockUserRoles = new Map<string, MockEntity>();
  const mockSponsorProfiles = new Map<string, MockEntity>();
  const mockVendorProfiles = new Map<string, MockEntity>();
  const mockCommunities = new Map<string, MockEntity>();
  const mockSponsorshipPlans = new Map<string, MockEntity>();
  const mockSponsorships = new Map<string, MockEntity>();
  const mockSubscriptionPlanConfigs = new Map<string, MockEntity>();
  const mockSubscriptions = new Map<string, MockEntity>();
  const mockPayments = new Map<string, MockEntity>();
  const mockWebhookEvents = new Map<string, MockEntity>();
  const mockOutboxEvents: MockEntity[] = [];
  const mockAuditLogs: MockEntity[] = [];

  // Users
  const sponsorUser = {
    id: uuidv4(),
    email: 'sponsor_corp@innovent.app',
    status: AccountStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const vendorUser = {
    id: uuidv4(),
    email: 'vendor_pro@innovent.app',
    status: AccountStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const attendeeUser = {
    id: uuidv4(),
    email: 'attendee@innovent.app',
    status: AccountStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const adminUser = {
    id: uuidv4(),
    email: 'admin_exec@innovent.app',
    status: AccountStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  // Profiles
  const sponsorProfile = {
    id: uuidv4(),
    userId: sponsorUser.id,
    companyName: 'AeroTech Global',
    contactEmail: 'sponsor_corp@innovent.app',
    stripeCustomerId: 'cus_aerotech_1',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const vendorProfile = {
    id: uuidv4(),
    userId: vendorUser.id,
    companyName: 'Apex Catering Co',
    contactEmail: 'vendor_pro@innovent.app',
    stripeCustomerId: 'cus_apex_1',
    serviceCategory: 'Catering',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  // Communities
  const openCommunity = {
    id: uuidv4(),
    name: 'Future Mobility Tech Group',
    isSponsored: false,
    isPinned: false,
    memberCapacity: 20,
    memberCount: 5,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Sponsorship Plan
  const defaultSponsorshipPlan = {
    id: uuidv4(),
    code: 'DEFAULT',
    name: 'Standard Community Sponsorship',
    price: new Prisma.Decimal(500),
    currency: 'SAR',
    memberCapacity: 500,
    durationDays: 30,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Subscription Plan Configs
  const sponsorMonthlyConfig = {
    id: uuidv4(),
    plan: SubscriptionPlan.SPONSOR_MONTHLY,
    name: 'Sponsor Monthly Plan',
    targetRole: 'SPONSOR',
    stripePriceId: 'price_sponsor_monthly_live',
    price: new Prisma.Decimal(1500),
    currency: 'SAR',
    interval: SubscriptionBillingInterval.MONTH,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Auth tokens
  let sponsorToken: string;
  let vendorToken: string;
  let attendeeToken: string;
  let adminToken: string;

  // Mock Payment Provider
  const mockPaymentProvider = {
    createOrGetCustomer: jest.fn().mockImplementation(async (params) => ({
      id: `cus_mock_${uuidv4().substring(0, 8)}`,
      email: params.email,
      name: params.name,
    })),
    createCheckoutSession: jest.fn().mockImplementation(async (_params) => {
      const sessionId = `cs_mock_${uuidv4()}`;
      return {
        sessionId,
        checkoutUrl: `https://checkout.stripe.com/${sessionId}`,
      };
    }),
    verifyWebhookSignature: jest.fn().mockImplementation(async (rawBody, signature) => {
      if (signature === 'invalid_signature') {
        throw new Error('Invalid cryptographic webhook signature');
      }
      return JSON.parse(rawBody.toString('utf8'));
    }),
    retrieveCheckoutSession: jest.fn().mockImplementation(async (id) => {
      if (id.includes('paid')) {
        return { id, paymentStatus: 'paid', status: 'complete', paymentIntentId: 'pi_reconciled' };
      }
      return { id, paymentStatus: 'unpaid', status: 'expired' };
    }),
    cancelSubscription: jest.fn().mockImplementation(async (subId, immediately) => ({
      id: subId,
      status: immediately ? 'canceled' : 'active',
      cancelAtPeriodEnd: !immediately,
    })),
    refundPayment: jest.fn().mockImplementation(async (_intentId, amount, reason) => ({
      id: `re_mock_${uuidv4()}`,
      status: 'succeeded',
      amount,
      reason,
    })),
  };

  beforeAll(async () => {
    // Populate in-memory stores
    mockUsers.set(sponsorUser.id, sponsorUser);
    mockUsers.set(vendorUser.id, vendorUser);
    mockUsers.set(attendeeUser.id, attendeeUser);
    mockUsers.set(adminUser.id, adminUser);

    mockSponsorProfiles.set(sponsorProfile.id, sponsorProfile);
    mockVendorProfiles.set(vendorProfile.id, vendorProfile);
    mockCommunities.set(openCommunity.id, openCommunity);
    mockSponsorshipPlans.set(defaultSponsorshipPlan.id, defaultSponsorshipPlan);
    mockSubscriptionPlanConfigs.set(sponsorMonthlyConfig.plan, sponsorMonthlyConfig);

    const assignRole = (userId: string, roleName: string) => {
      const id = uuidv4();
      mockUserRoles.set(id, { id, userId, roleId: mockRoles.get(roleName)!.id, roleName });
    };

    assignRole(sponsorUser.id, 'SPONSOR');
    assignRole(vendorUser.id, 'VENDOR');
    assignRole(attendeeUser.id, 'ATTENDEE');
    assignRole(adminUser.id, 'ADMIN');

    const mockPrisma = {
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue(true),
      $transaction: jest.fn().mockImplementation(async (cb) => {
        if (typeof cb === 'function') return cb(mockPrisma);
        return cb;
      }),

      user: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.id) {
            const u = mockUsers.get(where.id);
            if (!u || (where.deletedAt === null && u.deletedAt !== null)) return null;
            return {
              ...u,
              userRoles: Array.from(mockUserRoles.values())
                .filter((ur) => ur.userId === u.id)
                .map((ur) => ({ role: { name: ur.roleName } })),
              sponsorProfile:
                Array.from(mockSponsorProfiles.values()).find((sp) => sp.userId === u.id) || null,
              vendorProfile:
                Array.from(mockVendorProfiles.values()).find((vp) => vp.userId === u.id) || null,
            };
          }
          return null;
        }),
      },

      role: {
        findUnique: jest.fn().mockImplementation(({ where }) => mockRoles.get(where.name) || null),
      },

      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },

      userRole: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          return Array.from(mockUserRoles.values())
            .filter((ur) => ur.userId === where.userId)
            .map((ur) => ({ role: { name: ur.roleName } }));
        }),
      },

      sponsorProfile: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.userId) {
            return (
              Array.from(mockSponsorProfiles.values()).find((sp) => sp.userId === where.userId) ||
              null
            );
          }
          return null;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const sp = mockSponsorProfiles.get(where.id);
          if (sp) Object.assign(sp, data);
          return sp;
        }),
      },

      vendorProfile: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.userId) {
            return (
              Array.from(mockVendorProfiles.values()).find((vp) => vp.userId === where.userId) ||
              null
            );
          }
          return null;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const vp = mockVendorProfiles.get(where.id);
          if (vp) Object.assign(vp, data);
          return vp;
        }),
      },

      community: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const c = mockCommunities.get(where.id);
          if (!c || (where.deletedAt === null && c.deletedAt !== null)) return null;
          return c;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const c = mockCommunities.get(where.id);
          if (c) Object.assign(c, data);
          return c;
        }),
      },

      communitySponsorshipPlan: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.id) return mockSponsorshipPlans.get(where.id) || null;
          if (where.isActive) {
            return Array.from(mockSponsorshipPlans.values()).find((p) => p.isActive) || null;
          }
          return null;
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return mockSponsorshipPlans.get(where.id) || null;
        }),
      },

      communitySponsorship: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          return (
            Array.from(mockSponsorships.values()).find((s) => {
              if (where.communityId && s.communityId !== where.communityId) return false;
              if (where.status && s.status !== where.status) return false;
              if (where.endsAt?.gt && !(s.endsAt > where.endsAt.gt)) return false;
              if (where.id?.not && s.id === where.id.not) return false;
              return true;
            }) || null
          );
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          return Array.from(mockSponsorships.values()).filter((s) => {
            if (where.status && s.status !== where.status) return false;
            if (where.endsAt?.lte && !(s.endsAt <= where.endsAt.lte)) return false;
            return true;
          });
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const s = { id: uuidv4(), ...data, createdAt: new Date(), updatedAt: new Date() };
          mockSponsorships.set(s.id, s);
          return s;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const s = mockSponsorships.get(where.id);
          if (s) Object.assign(s, data);
          return s;
        }),
      },

      subscriptionPlanConfig: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return mockSubscriptionPlanConfigs.get(where.plan) || null;
        }),
      },

      subscription: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const sub =
            Array.from(mockSubscriptions.values()).find((s) => {
              if (where.userId && s.userId !== where.userId) return false;
              if (where.plan && s.plan !== where.plan) return false;
              if (where.status?.in && !where.status.in.includes(s.status)) return false;
              if (
                where.cancelAtPeriodEnd !== undefined &&
                s.cancelAtPeriodEnd !== where.cancelAtPeriodEnd
              ) {
                return false;
              }
              return true;
            }) || null;
          if (sub) {
            return {
              ...sub,
              planConfig: mockSubscriptionPlanConfigs.get(sub.plan) || {
                name: sub.plan,
                price: sub.amount,
                interval: sub.interval,
              },
            };
          }
          return null;
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          let sub: any = null;
          if (where.id) sub = mockSubscriptions.get(where.id) || null;
          if (where.stripeSubscriptionId) {
            sub =
              Array.from(mockSubscriptions.values()).find(
                (s) => s.stripeSubscriptionId === where.stripeSubscriptionId,
              ) || null;
          }
          if (sub) {
            return {
              ...sub,
              planConfig: mockSubscriptionPlanConfigs.get(sub.plan) || {
                name: sub.plan,
                price: sub.amount,
                interval: sub.interval,
              },
            };
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(() =>
          Array.from(mockSubscriptions.values()).map((sub) => ({
            ...sub,
            planConfig: mockSubscriptionPlanConfigs.get(sub.plan) || {
              name: sub.plan,
              price: sub.amount,
              interval: sub.interval,
            },
          })),
        ),
        count: jest.fn().mockImplementation(() => mockSubscriptions.size),
        upsert: jest.fn().mockImplementation(({ where, update, create }) => {
          let sub = Array.from(mockSubscriptions.values()).find(
            (s) => s.stripeSubscriptionId === where.stripeSubscriptionId,
          );
          if (sub) {
            Object.assign(sub, update);
          } else {
            sub = { id: uuidv4(), ...create, createdAt: new Date(), updatedAt: new Date() };
            mockSubscriptions.set(sub.id, sub);
          }
          return {
            ...sub,
            planConfig: mockSubscriptionPlanConfigs.get(sub.plan) || {
              name: sub.plan,
              price: sub.amount,
              interval: sub.interval,
            },
          };
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const sub = mockSubscriptions.get(where.id);
          if (sub) Object.assign(sub, data);
          return sub
            ? {
                ...sub,
                planConfig: mockSubscriptionPlanConfigs.get(sub.plan) || {
                  name: sub.plan,
                  price: sub.amount,
                  interval: sub.interval,
                },
              }
            : null;
        }),
      },

      payment: {
        create: jest.fn().mockImplementation(({ data }) => {
          const p = { id: uuidv4(), ...data, createdAt: new Date(), updatedAt: new Date() };
          mockPayments.set(p.id, p);
          return p;
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const p = mockPayments.get(where.id);
          if (!p) {
            return (
              Array.from(mockPayments.values()).find(
                (item) =>
                  (where.stripePaymentIntentId &&
                    item.stripePaymentIntentId === where.stripePaymentIntentId) ||
                  (where.stripeCheckoutSessionId &&
                    item.stripeCheckoutSessionId === where.stripeCheckoutSessionId),
              ) || null
            );
          }
          return {
            ...p,
            communitySponsorship:
              Array.from(mockSponsorships.values()).find((s) => s.paymentId === p.id) || null,
            subscription: p.subscriptionId ? mockSubscriptions.get(p.subscriptionId) || null : null,
            sponsorProfile: p.sponsorProfileId
              ? mockSponsorProfiles.get(p.sponsorProfileId) || null
              : null,
            vendorProfile: p.vendorProfileId
              ? mockVendorProfiles.get(p.vendorProfileId) || null
              : null,
          };
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          return (
            Array.from(mockPayments.values()).find((p) => {
              if (
                where.stripeCheckoutSessionId &&
                p.stripeCheckoutSessionId !== where.stripeCheckoutSessionId
              ) {
                return false;
              }
              return true;
            }) || null
          );
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          let list = Array.from(mockPayments.values());
          if (where?.status?.in) list = list.filter((p) => where.status.in.includes(p.status));
          if (where?.currency) list = list.filter((p) => p.currency === where.currency);
          return list;
        }),
        count: jest.fn().mockImplementation(() => mockPayments.size),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const p = mockPayments.get(where.id);
          if (p) Object.assign(p, data);
          return p;
        }),
      },

      stripeWebhookEvent: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const key = `${where.provider_providerEventId?.provider}_${where.provider_providerEventId?.providerEventId}`;
          return mockWebhookEvents.get(key) || null;
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const key = `${data.provider}_${data.providerEventId}`;
          const record = { id: uuidv4(), ...data, createdAt: new Date(), updatedAt: new Date() };
          mockWebhookEvents.set(key, record);
          return record;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          let target = null;
          for (const val of mockWebhookEvents.values()) {
            if (val.id === where.id) {
              Object.assign(val, data);
              target = val;
              break;
            }
          }
          return target;
        }),
      },

      outboxEvent: {
        create: jest.fn().mockImplementation(({ data }) => {
          mockOutboxEvents.push(data);
          return data;
        }),
      },

      auditLog: {
        create: jest.fn().mockImplementation(({ data }) => {
          mockAuditLogs.push(data);
          return data;
        }),
      },
    };

    const mockRedis = {
      ping: jest.fn().mockResolvedValue('PONG'),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    const mockQueue = {
      addJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
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
      .overrideProvider(PAYMENT_PROVIDER)
      .useValue(mockPaymentProvider)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createGlobalValidationPipe());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();

    tokenService = app.get<TokenService>(TokenService);

    // Issue tokens
    sponsorToken = (
      await tokenService.generateTokens(
        sponsorUser.id,
        sponsorUser.email,
        ['SPONSOR'],
        [
          'create:community_sponsorship',
          'create:subscription',
          'read_own:payment',
          'read_own:subscription',
        ],
      )
    ).accessToken;

    vendorToken = (
      await tokenService.generateTokens(
        vendorUser.id,
        vendorUser.email,
        ['VENDOR'],
        ['create:subscription', 'read_own:payment', 'read_own:subscription'],
      )
    ).accessToken;

    attendeeToken = (
      await tokenService.generateTokens(
        attendeeUser.id,
        attendeeUser.email,
        ['ATTENDEE'],
        ['read_own:payment'],
      )
    ).accessToken;

    adminToken = (
      await tokenService.generateTokens(
        adminUser.id,
        adminUser.email,
        ['ADMIN'],
        ['manage:all', 'manage:payment', 'refund:payment', 'read:revenue', 'manage:subscription'],
      )
    ).accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // =========================================================================
  // SCENARIO 1: Community Sponsorship Checkout Initiation
  // =========================================================================
  let createdPaymentId: string;
  let createdSessionId: string;

  it('1. Sponsor initiates community sponsorship checkout (server-configured price, zero client amount trust)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/payments/checkout/community-sponsorship')
      .set('Authorization', `Bearer ${sponsorToken}`)
      .send({
        communityId: openCommunity.id,
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.checkoutUrl).toBeDefined();
    expect(res.body.data.sessionId).toBeDefined();
    expect(res.body.data.paymentId).toBeDefined();

    createdPaymentId = res.body.data.paymentId;
    createdSessionId = res.body.data.sessionId;

    const payment = mockPayments.get(createdPaymentId);
    expect(payment).toBeDefined();
    expect(payment.status).toBe(PaymentStatus.PENDING);
    expect(payment.amount.toNumber()).toBe(500); // Authoritative server plan price
    expect(payment.currency).toBe('SAR');
    expect(payment.purpose).toBe(PaymentPurpose.COMMUNITY_SPONSORSHIP);
  });

  // =========================================================================
  // SCENARIO 2: Anti-Double Sponsorship Conflict
  // =========================================================================
  it('2. Anti-double sponsorship: rejects new sponsorship checkout while active sponsorship exists', async () => {
    // Temporarily insert an active sponsorship
    const existing = {
      id: uuidv4(),
      communityId: openCommunity.id,
      status: CommunitySponsorshipStatus.ACTIVE,
      endsAt: new Date(Date.now() + 86400000 * 20),
    };
    mockSponsorships.set(existing.id, existing);

    try {
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/checkout/community-sponsorship')
        .set('Authorization', `Bearer ${sponsorToken}`)
        .send({ communityId: openCommunity.id })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('already has an active');
    } finally {
      // Clean up temporary active sponsorship for subsequent tests
      mockSponsorships.delete(existing.id);
    }
  });

  // =========================================================================
  // SCENARIO 3: Webhook checkout.session.completed activates Community Sponsorship
  // =========================================================================
  it('3. Webhook checkout.session.completed marks payment SUCCEEDED and activates community benefits', async () => {
    const webhookPayload = {
      id: `evt_session_${uuidv4()}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: createdSessionId,
          mode: 'payment',
          payment_intent: 'pi_test_succeeded_1',
          metadata: {
            paymentId: createdPaymentId,
            paymentPurpose: PaymentPurpose.COMMUNITY_SPONSORSHIP,
            communityId: openCommunity.id,
            planId: defaultSponsorshipPlan.id,
            sponsorProfileId: sponsorProfile.id,
            userId: sponsorUser.id,
          },
        },
      },
    };

    const res = await request(app.getHttpServer())
      .post('/api/v1/payments/stripe/webhook')
      .set('stripe-signature', 'valid_signature')
      .send(webhookPayload)
      .expect(200);

    expect(res.body.data.received).toBe(true);

    // Verify DB states
    const payment = mockPayments.get(createdPaymentId);
    expect(payment.status).toBe(PaymentStatus.SUCCEEDED);

    const community = mockCommunities.get(openCommunity.id);
    expect(community.isSponsored).toBe(true);
    expect(community.isPinned).toBe(true);
    expect(community.memberCapacity).toBe(500);

    // Verify sponsorship record
    const sponsorship = Array.from(mockSponsorships.values()).find(
      (s) => s.paymentId === createdPaymentId,
    );
    expect(sponsorship).toBeDefined();
    expect(sponsorship.status).toBe(CommunitySponsorshipStatus.ACTIVE);

    // Verify outbox notification events
    const activatedEvent = mockOutboxEvents.find(
      (e) => e.eventType === 'COMMUNITY_SPONSORSHIP_ACTIVATED' && e.aggregateId === sponsorship.id,
    );
    expect(activatedEvent).toBeDefined();
  });

  // =========================================================================
  // SCENARIO 4: Webhook Replay Deduplication (Idempotency)
  // =========================================================================
  it('4. Webhook replay idempotency: duplicate event ID is safely deduplicated without mutation', async () => {
    const duplicateEventId = 'evt_duplicate_idempotency_1';
    const payload = {
      id: duplicateEventId,
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_ignored', mode: 'payment' } },
    };

    // First delivery
    await request(app.getHttpServer())
      .post('/api/v1/payments/stripe/webhook')
      .set('stripe-signature', 'valid_signature')
      .send(payload)
      .expect(200);

    // Second delivery (replay)
    const replayRes = await request(app.getHttpServer())
      .post('/api/v1/payments/stripe/webhook')
      .set('stripe-signature', 'valid_signature')
      .send(payload)
      .expect(200);

    expect(replayRes.body.data.deduplicated).toBe(true);
  });

  // =========================================================================
  // SCENARIO 5: Webhook Cryptographic Verification Rejection
  // =========================================================================
  it('5. Webhook rejects payloads with invalid stripe cryptographic signature', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/payments/stripe/webhook')
      .set('stripe-signature', 'invalid_signature')
      .send({ id: 'evt_tampered', type: 'payment_intent.succeeded' })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Invalid Stripe webhook signature');
  });

  // =========================================================================
  // SCENARIO 6: Subscription Checkout Creation & Role Enforcement
  // =========================================================================
  it('6. Sponsor subscribes to SPONSOR_MONTHLY via Stripe Checkout session', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/subscriptions/checkout')
      .set('Authorization', `Bearer ${sponsorToken}`)
      .send({
        plan: SubscriptionPlan.SPONSOR_MONTHLY,
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.sessionId).toBeDefined();
    expect(res.body.data.checkoutUrl).toBeDefined();
  });

  it('6b. Role enforcement: Attendee cannot purchase SPONSOR_MONTHLY subscription', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/subscriptions/checkout')
      .set('Authorization', `Bearer ${attendeeToken}`)
      .send({
        plan: SubscriptionPlan.SPONSOR_MONTHLY,
      })
      .expect(403);

    expect(res.body.success).toBe(false);
  });

  it('6c. Vendor subscribes to VENDOR_MONTHLY via Stripe Checkout', async () => {
    mockSubscriptionPlanConfigs.set(SubscriptionPlan.VENDOR_MONTHLY, {
      id: uuidv4(),
      plan: SubscriptionPlan.VENDOR_MONTHLY,
      name: 'Vendor Monthly Plan',
      targetRole: 'VENDOR',
      stripePriceId: 'price_vendor_monthly_live',
      price: new Prisma.Decimal(800),
      currency: 'SAR',
      interval: SubscriptionBillingInterval.MONTH,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/subscriptions/checkout')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({
        plan: SubscriptionPlan.VENDOR_MONTHLY,
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.sessionId).toBeDefined();
  });

  // =========================================================================
  // SCENARIO 7: Subscription Lifecycle Webhooks
  // =========================================================================
  let testStripeSubId: string;

  it('7. Webhook checkout.session.completed (subscription mode) activates business subscription', async () => {
    testStripeSubId = `sub_stripe_${uuidv4()}`;
    const payload = {
      id: `evt_sub_active_${uuidv4()}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: `cs_sub_${uuidv4()}`,
          mode: 'subscription',
          subscription: testStripeSubId,
          customer: sponsorProfile.stripeCustomerId,
          metadata: {
            userId: sponsorUser.id,
            profileId: sponsorProfile.id,
            plan: SubscriptionPlan.SPONSOR_MONTHLY,
            purpose: 'SUBSCRIPTION',
          },
        },
      },
    };

    await request(app.getHttpServer())
      .post('/api/v1/payments/stripe/webhook')
      .set('stripe-signature', 'valid_signature')
      .send(payload)
      .expect(200);

    const sub = Array.from(mockSubscriptions.values()).find(
      (s) => s.stripeSubscriptionId === testStripeSubId,
    );
    expect(sub).toBeDefined();
    expect(sub.status).toBe(SubscriptionStatus.ACTIVE);
    expect(sub.amount.toNumber()).toBe(1500);

    const subActivatedOutbox = mockOutboxEvents.find(
      (e) => e.eventType === 'SUBSCRIPTION_ACTIVATED' && e.aggregateId === sub.id,
    );
    expect(subActivatedOutbox).toBeDefined();
  });

  it('7b. Webhook invoice.payment_failed transitions subscription to PAST_DUE', async () => {
    const payload = {
      id: `evt_sub_failed_${uuidv4()}`,
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: `in_${uuidv4()}`,
          subscription: testStripeSubId,
        },
      },
    };

    await request(app.getHttpServer())
      .post('/api/v1/payments/stripe/webhook')
      .set('stripe-signature', 'valid_signature')
      .send(payload)
      .expect(200);

    const sub = Array.from(mockSubscriptions.values()).find(
      (s) => s.stripeSubscriptionId === testStripeSubId,
    );
    expect(sub.status).toBe(SubscriptionStatus.PAST_DUE);
  });

  // =========================================================================
  // SCENARIO 8: User Subscription Cancellation
  // =========================================================================
  it('8. User cancels subscription', async () => {
    const sub = Array.from(mockSubscriptions.values()).find(
      (s) => s.stripeSubscriptionId === testStripeSubId,
    );

    const res = await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${sub.id}/cancel`)
      .set('Authorization', `Bearer ${sponsorToken}`)
      .send({ immediately: true })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(SubscriptionStatus.CANCELLED);
  });

  // =========================================================================
  // SCENARIO 9: IDOR Defense on Payment Records
  // =========================================================================
  it('9. IDOR protection: Stranger cannot view another users payment', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/payments/${createdPaymentId}`)
      .set('Authorization', `Bearer ${attendeeToken}`)
      .expect(403);

    expect(res.body.success).toBe(false);
  });

  it('9b. Owner and Admin can access payment details', async () => {
    // Owner
    const ownerRes = await request(app.getHttpServer())
      .get(`/api/v1/payments/${createdPaymentId}`)
      .set('Authorization', `Bearer ${sponsorToken}`)
      .expect(200);
    expect(ownerRes.body.data.id).toBe(createdPaymentId);

    // Admin
    const adminRes = await request(app.getHttpServer())
      .get(`/api/v1/payments/${createdPaymentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(adminRes.body.data.id).toBe(createdPaymentId);
  });

  // =========================================================================
  // SCENARIO 10: Admin Revenue & Refund Processing
  // =========================================================================
  it('10. Admin retrieves financial revenue metrics with exact breakdowns', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/revenue')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.totalGrossRevenue).toBeGreaterThan(0);
    expect(res.body.data.breakdownByPurpose).toBeDefined();
  });

  it('10b. Admin refunds payment and reverts community sponsorship benefits', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/payments/${createdPaymentId}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Admin approved refund' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(PaymentStatus.REFUNDED);

    // Verify community benefits reverted to 20 capacity and not sponsored
    const community = mockCommunities.get(openCommunity.id);
    expect(community.isSponsored).toBe(false);
    expect(community.isPinned).toBe(false);
    expect(community.memberCapacity).toBe(20);
  });

  // =========================================================================
  // SCENARIO 11: Payment Reconciliation
  // =========================================================================
  it('11. Admin runs payment reconciliation to resolve stale pending payments', async () => {
    // Create stale pending payment
    const stalePayment = {
      id: uuidv4(),
      userId: sponsorUser.id,
      amount: new Prisma.Decimal(500),
      currency: 'SAR',
      status: PaymentStatus.PENDING,
      purpose: PaymentPurpose.COMMUNITY_SPONSORSHIP,
      stripeCheckoutSessionId: 'cs_stale_paid_session',
      createdAt: new Date(Date.now() - 30 * 60 * 1000), // 30 mins ago
      updatedAt: new Date(Date.now() - 30 * 60 * 1000),
    };
    mockPayments.set(stalePayment.id, stalePayment);

    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/payments/reconcile')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ olderThanMinutes: 15, dryRun: false })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.reconciledSucceededCount).toBeGreaterThanOrEqual(1);

    const reconciled = mockPayments.get(stalePayment.id);
    expect(reconciled.status).toBe(PaymentStatus.SUCCEEDED);
  });
});
