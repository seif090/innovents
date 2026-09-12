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
import {
  AccountStatus,
  C2bBookingStatus,
  C2bServiceCategory,
  DiscountType,
  EventStatus,
  EventVisibility,
  SponsorAdPlacement,
  SponsorAdStatus,
  Prisma,
} from '@prisma/client';

describe('Sprint 8: C2B Marketplace, Coupons & Sponsor Ads E2E Suite (e2e)', () => {
  jest.setTimeout(45000);
  let app: INestApplication;
  let tokenService: TokenService;

  // Hermetic in-memory store
  type MockEntity = any;
  const mockUsers = new Map<string, MockEntity>();
  const mockRoles = new Map<string, MockEntity>([
    ['ADMIN', { id: uuidv4(), name: 'ADMIN', rolePermissions: [] }],
    ['SPONSOR', { id: uuidv4(), name: 'SPONSOR', rolePermissions: [] }],
    ['PROVIDER', { id: uuidv4(), name: 'PROVIDER', rolePermissions: [] }],
    ['ATTENDEE', { id: uuidv4(), name: 'ATTENDEE', rolePermissions: [] }],
  ]);
  const mockUserRoles = new Map<string, MockEntity>();
  const mockProviderProfiles = new Map<string, MockEntity>();
  const mockSponsorProfiles = new Map<string, MockEntity>();
  const mockEvents = new Map<string, MockEntity>();
  const mockC2bServices = new Map<string, MockEntity>();
  const mockC2bBookings = new Map<string, MockEntity>();
  const mockCoupons = new Map<string, MockEntity>();
  const mockCouponRedemptions = new Map<string, MockEntity>();
  const mockSponsorAds = new Map<string, MockEntity>();
  const mockOutboxEvents: MockEntity[] = [];
  const mockAuditLogs: MockEntity[] = [];

  // Users
  const providerA = {
    id: uuidv4(),
    email: 'providerA@innovent.app',
    status: AccountStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const providerB = {
    id: uuidv4(),
    email: 'providerB@innovent.app',
    status: AccountStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const inactiveProvider = {
    id: uuidv4(),
    email: 'inactive_prov@innovent.app',
    status: AccountStatus.SUSPENDED,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const sponsorA = {
    id: uuidv4(),
    email: 'sponsorA@innovent.app',
    status: AccountStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const sponsorB = {
    id: uuidv4(),
    email: 'sponsorB@innovent.app',
    status: AccountStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const inactiveSponsor = {
    id: uuidv4(),
    email: 'inactive_spons@innovent.app',
    status: AccountStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const adminUser = {
    id: uuidv4(),
    email: 'admin@innovent.app',
    status: AccountStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const attendeeA = {
    id: uuidv4(),
    email: 'attendeeA@innovent.app',
    status: AccountStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const attendeeB = {
    id: uuidv4(),
    email: 'attendeeB@innovent.app',
    status: AccountStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  // 10 concurrent attendees
  const concurrentAttendees: MockEntity[] = [];
  for (let i = 0; i < 10; i++) {
    concurrentAttendees.push({
      id: uuidv4(),
      email: `concurrent_attendee_${i}@innovent.app`,
      status: AccountStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });
  }

  // Events
  const activeEvent = {
    id: uuidv4(),
    name: 'Global Tech Expo 2026',
    status: EventStatus.PUBLISHED,
    visibility: EventVisibility.PUBLIC,
    startsAt: new Date(Date.now() - 86400000),
    endsAt: new Date(Date.now() + 86400000 * 5),
    deletedAt: null,
  };

  const endedEvent = {
    id: uuidv4(),
    name: 'Past Winter Summit 2025',
    status: EventStatus.PUBLISHED,
    visibility: EventVisibility.PUBLIC,
    startsAt: new Date(Date.now() - 86400000 * 10),
    endsAt: new Date(Date.now() - 86400000),
    deletedAt: null,
  };

  // Tokens
  let tokenProviderA: string;
  let tokenProviderB: string;
  let tokenInactiveProvider: string;
  let tokenSponsorA: string;
  let tokenSponsorB: string;
  let tokenInactiveSponsor: string;
  let tokenAdmin: string;
  let tokenAttendeeA: string;
  let tokenAttendeeB: string;
  const tokensConcurrentAttendees: string[] = [];

  beforeAll(async () => {
    // Populate user store
    [
      providerA,
      providerB,
      inactiveProvider,
      sponsorA,
      sponsorB,
      inactiveSponsor,
      adminUser,
      attendeeA,
      attendeeB,
      ...concurrentAttendees,
    ].forEach((u) => mockUsers.set(u.id, u));

    // Profiles
    mockProviderProfiles.set(providerA.id, {
      id: uuidv4(),
      userId: providerA.id,
      businessName: 'Apex Hospitality & Travel',
      providerType: 'ACCOMMODATION',
      city: 'Riyadh',
      country: 'Saudi Arabia',
    });

    mockProviderProfiles.set(providerB.id, {
      id: uuidv4(),
      userId: providerB.id,
      businessName: 'Najd Transportation Fleet',
      providerType: 'TRANSPORTATION',
      city: 'Riyadh',
      country: 'Saudi Arabia',
    });

    mockSponsorProfiles.set(sponsorA.id, {
      id: uuidv4(),
      userId: sponsorA.id,
      companyName: 'CloudScale AI Corp',
      tier: 'PLATINUM',
    });

    mockSponsorProfiles.set(sponsorB.id, {
      id: uuidv4(),
      userId: sponsorB.id,
      companyName: 'NextGen Telecom',
      tier: 'GOLD',
    });

    mockEvents.set(activeEvent.id, activeEvent);
    mockEvents.set(endedEvent.id, endedEvent);

    const assignRole = (userId: string, roleName: string) => {
      const id = uuidv4();
      mockUserRoles.set(id, { id, userId, roleId: mockRoles.get(roleName)!.id, roleName });
    };

    assignRole(providerA.id, 'PROVIDER');
    assignRole(providerB.id, 'PROVIDER');
    assignRole(inactiveProvider.id, 'PROVIDER');
    assignRole(sponsorA.id, 'SPONSOR');
    assignRole(sponsorB.id, 'SPONSOR');
    assignRole(inactiveSponsor.id, 'SPONSOR');
    assignRole(adminUser.id, 'ADMIN');
    assignRole(attendeeA.id, 'ATTENDEE');
    assignRole(attendeeB.id, 'ATTENDEE');
    concurrentAttendees.forEach((a) => assignRole(a.id, 'ATTENDEE'));

    const mockPrisma = {
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue(true),
      $transaction: jest.fn().mockImplementation(async (cb) => cb(mockPrisma)),

      $executeRaw: jest.fn().mockImplementation(async (strings: any, ...values: any[]) => {
        const queryText = Array.isArray(strings) ? strings.join('') : String(strings);
        if (
          queryText.includes('UPDATE c2b_services') &&
          queryText.includes('booking_count = booking_count + 1')
        ) {
          const serviceId = values[0];
          const service = mockC2bServices.get(serviceId);
          if (!service) return 0;
          if (service.maxBookings !== null && service.bookingCount >= service.maxBookings) {
            return 0; // capacity reached
          }
          service.bookingCount += 1;
          return 1;
        }

        if (
          queryText.includes('UPDATE c2b_services') &&
          queryText.includes('booking_count = GREATEST(0, booking_count - 1)')
        ) {
          const serviceId = values[0];
          const service = mockC2bServices.get(serviceId);
          if (service) {
            service.bookingCount = Math.max(0, service.bookingCount - 1);
          }
          return 1;
        }

        if (
          queryText.includes('UPDATE coupons') &&
          queryText.includes('redemption_count = redemption_count + 1')
        ) {
          const couponId = values[0];
          const coupon = mockCoupons.get(couponId);
          if (!coupon) return 0;
          if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions) {
            return 0; // limit reached
          }
          coupon.redemptionCount += 1;
          return 1;
        }

        return 1;
      }),

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

      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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
              providerProfile: mockProviderProfiles.get(u.id) || null,
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
            providerProfile: mockProviderProfiles.get(u.id) || null,
            sponsorProfile: mockSponsorProfiles.get(u.id) || null,
          };
        }),
      },

      event: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const ev = mockEvents.get(where.id);
          if (!ev || (where.deletedAt === null && ev.deletedAt !== null)) return null;
          return ev;
        }),
      },

      c2bService: {
        create: jest.fn().mockImplementation(({ data }) => {
          const s = {
            id: uuidv4(),
            ...data,
            bookingCount: data.bookingCount || 0,
            price: data.price ? new Prisma.Decimal(data.price) : null,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            event: mockEvents.get(data.eventId),
            provider: {
              ...mockUsers.get(data.providerId),
              providerProfile: mockProviderProfiles.get(data.providerId),
            },
          };
          mockC2bServices.set(s.id, s);
          return s;
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const now = new Date();
          for (const s of mockC2bServices.values()) {
            if (where.id && s.id !== where.id) continue;
            if (where.providerId && s.providerId !== where.providerId) continue;
            if (where.deletedAt === null && s.deletedAt !== null) continue;
            if (where.isAvailable !== undefined && s.isAvailable !== where.isAvailable) continue;
            if (where.expiresAt?.gt && s.expiresAt <= now) continue;

            const ev = mockEvents.get(s.eventId);
            if (where.event?.endsAt?.gt && (!ev || ev.endsAt <= now)) continue;
            if (where.event?.deletedAt === null && (!ev || ev.deletedAt !== null)) continue;

            const prov = mockUsers.get(s.providerId);
            if (where.provider?.status && (!prov || prov.status !== where.provider.status))
              continue;

            return {
              ...s,
              event: ev,
              provider: {
                ...prov,
                providerProfile: mockProviderProfiles.get(s.providerId),
              },
            };
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(({ where, skip = 0, take = 20 }) => {
          const now = new Date();
          const list: any[] = [];
          for (const s of mockC2bServices.values()) {
            if (where.providerId && s.providerId !== where.providerId) continue;
            if (where.deletedAt === null && s.deletedAt !== null) continue;
            if (where.isAvailable !== undefined && s.isAvailable !== where.isAvailable) continue;
            if (where.expiresAt?.gt && s.expiresAt <= now) continue;
            if (where.category && s.category !== where.category) continue;
            if (where.eventId && s.eventId !== where.eventId) continue;

            const ev = mockEvents.get(s.eventId);
            if (where.event?.endsAt?.gt && (!ev || ev.endsAt <= now)) continue;

            const prov = mockUsers.get(s.providerId);
            if (where.provider?.status && (!prov || prov.status !== where.provider.status))
              continue;

            list.push({
              ...s,
              event: ev,
              provider: {
                ...prov,
                providerProfile: mockProviderProfiles.get(s.providerId),
              },
            });
          }
          return list.slice(skip, skip + take);
        }),
        count: jest.fn().mockImplementation(({ where }) => {
          const now = new Date();
          let c = 0;
          for (const s of mockC2bServices.values()) {
            if (where.providerId && s.providerId !== where.providerId) continue;
            if (where.deletedAt === null && s.deletedAt !== null) continue;
            if (where.isAvailable !== undefined && s.isAvailable !== where.isAvailable) continue;
            if (where.expiresAt?.gt && s.expiresAt <= now) continue;
            if (where.category && s.category !== where.category) continue;
            if (where.eventId && s.eventId !== where.eventId) continue;

            const ev = mockEvents.get(s.eventId);
            if (where.event?.endsAt?.gt && (!ev || ev.endsAt <= now)) continue;

            const prov = mockUsers.get(s.providerId);
            if (where.provider?.status && (!prov || prov.status !== where.provider.status))
              continue;

            c++;
          }
          return c;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const s = mockC2bServices.get(where.id);
          if (!s) return null;
          Object.assign(s, data, { updatedAt: new Date() });
          return {
            ...s,
            event: mockEvents.get(s.eventId),
            provider: {
              ...mockUsers.get(s.providerId),
              providerProfile: mockProviderProfiles.get(s.providerId),
            },
          };
        }),
      },

      c2bBooking: {
        create: jest.fn().mockImplementation(({ data }) => {
          const b = {
            id: uuidv4(),
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            service: mockC2bServices.get(data.serviceId),
            provider: {
              ...mockUsers.get(data.providerId),
              providerProfile: mockProviderProfiles.get(data.providerId),
            },
            attendee: mockUsers.get(data.attendeeId),
          };
          mockC2bBookings.set(b.id, b);
          return b;
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          for (const b of mockC2bBookings.values()) {
            if (where.id && b.id !== where.id) continue;
            return {
              ...b,
              service: mockC2bServices.get(b.serviceId),
              provider: {
                ...mockUsers.get(b.providerId),
                providerProfile: mockProviderProfiles.get(b.providerId),
              },
              attendee: mockUsers.get(b.attendeeId),
            };
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(({ where, skip = 0, take = 20 }) => {
          const list: any[] = [];
          for (const b of mockC2bBookings.values()) {
            if (where.attendeeId && b.attendeeId !== where.attendeeId) continue;
            if (where.providerId && b.providerId !== where.providerId) continue;
            list.push({
              ...b,
              service: mockC2bServices.get(b.serviceId),
              provider: {
                ...mockUsers.get(b.providerId),
                providerProfile: mockProviderProfiles.get(b.providerId),
              },
              attendee: mockUsers.get(b.attendeeId),
            });
          }
          return list.slice(skip, skip + take);
        }),
        count: jest.fn().mockImplementation(({ where }) => {
          let c = 0;
          for (const b of mockC2bBookings.values()) {
            if (where.attendeeId && b.attendeeId !== where.attendeeId) continue;
            if (where.providerId && b.providerId !== where.providerId) continue;
            c++;
          }
          return c;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const b = mockC2bBookings.get(where.id);
          if (!b) return null;
          Object.assign(b, data, { updatedAt: new Date() });
          return {
            ...b,
            service: mockC2bServices.get(b.serviceId),
            provider: {
              ...mockUsers.get(b.providerId),
              providerProfile: mockProviderProfiles.get(b.providerId),
            },
            attendee: mockUsers.get(b.attendeeId),
          };
        }),
      },

      coupon: {
        create: jest.fn().mockImplementation(({ data }) => {
          const c = {
            id: uuidv4(),
            ...data,
            redemptionCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            event: mockEvents.get(data.eventId),
            provider: mockUsers.get(data.providerId),
          };
          mockCoupons.set(c.id, c);
          return c;
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.normalizedCode) {
            for (const c of mockCoupons.values()) {
              if (c.normalizedCode === where.normalizedCode && c.deletedAt === null) return c;
            }
          }
          return null;
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          for (const c of mockCoupons.values()) {
            if (where.id && c.id !== where.id) continue;
            if (where.providerId && c.providerId !== where.providerId) continue;
            if (where.normalizedCode && c.normalizedCode !== where.normalizedCode) continue;
            if (where.deletedAt === null && c.deletedAt !== null) continue;
            return {
              ...c,
              event: mockEvents.get(c.eventId),
              provider: mockUsers.get(c.providerId),
            };
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          return Array.from(mockCoupons.values()).filter((c) => {
            if (where.providerId && c.providerId !== where.providerId) return false;
            if (where.deletedAt === null && c.deletedAt !== null) return false;
            return true;
          });
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const c = mockCoupons.get(where.id);
          if (!c) return null;
          Object.assign(c, data, { updatedAt: new Date() });
          return c;
        }),
      },

      couponRedemption: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.idempotencyKey) {
            for (const r of mockCouponRedemptions.values()) {
              if (r.idempotencyKey === where.idempotencyKey) {
                return { ...r, coupon: mockCoupons.get(r.couponId) };
              }
            }
          }
          if (where.couponId_attendeeId) {
            const key = `${where.couponId_attendeeId.couponId}_${where.couponId_attendeeId.attendeeId}`;
            const r = mockCouponRedemptions.get(key);
            if (r) return { ...r, coupon: mockCoupons.get(r.couponId) };
          }
          return null;
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const r = {
            id: uuidv4(),
            ...data,
            redeemedAt: new Date(),
            coupon: mockCoupons.get(data.couponId),
          };
          const key = `${data.couponId}_${data.attendeeId}`;
          mockCouponRedemptions.set(key, r);
          mockCouponRedemptions.set(r.id, r);
          return r;
        }),
      },

      sponsorAd: {
        create: jest.fn().mockImplementation(({ data }) => {
          const a = {
            id: uuidv4(),
            ...data,
            status: data.status || SponsorAdStatus.DRAFT,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            sponsor: {
              ...mockUsers.get(data.sponsorId),
              sponsorProfile: mockSponsorProfiles.get(data.sponsorId),
            },
            event: data.eventId ? mockEvents.get(data.eventId) : null,
          };
          mockSponsorAds.set(a.id, a);
          return a;
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const now = new Date();
          for (const a of mockSponsorAds.values()) {
            if (where.id && a.id !== where.id) continue;
            if (where.sponsorId && a.sponsorId !== where.sponsorId) continue;
            if (where.deletedAt === null && a.deletedAt !== null) continue;
            if (where.status?.in && !where.status.in.includes(a.status)) continue;
            if (where.status && typeof where.status === 'string' && a.status !== where.status)
              continue;
            if (where.startsAt?.lte && a.startsAt > now) continue;
            if (where.endsAt?.gt && a.endsAt <= now) continue;

            const sp = mockUsers.get(a.sponsorId);
            if (where.sponsor?.status && (!sp || sp.status !== where.sponsor.status)) continue;

            return {
              ...a,
              sponsor: {
                ...sp,
                sponsorProfile: mockSponsorProfiles.get(a.sponsorId),
              },
            };
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(({ where, skip = 0, take = 20 }) => {
          const now = new Date();
          const list: any[] = [];
          for (const a of mockSponsorAds.values()) {
            if (where.sponsorId && a.sponsorId !== where.sponsorId) continue;
            if (where.status?.in && !where.status.in.includes(a.status)) continue;
            if (where.status && typeof where.status === 'string' && a.status !== where.status)
              continue;
            if (where.startsAt?.lte && a.startsAt > now) continue;
            if (where.endsAt?.gt && a.endsAt <= now) continue;
            if (where.deletedAt === null && a.deletedAt !== null) continue;

            // Check event validity if scoped
            if (a.eventId) {
              const ev = mockEvents.get(a.eventId);
              if (where.OR && (!ev || ev.endsAt <= now || ev.deletedAt !== null)) continue;
            }

            const sp = mockUsers.get(a.sponsorId);
            if (where.sponsor?.status && (!sp || sp.status !== where.sponsor.status)) continue;

            list.push({
              ...a,
              sponsor: {
                ...sp,
                sponsorProfile: mockSponsorProfiles.get(a.sponsorId),
              },
            });
          }
          return list.slice(skip, skip + take);
        }),
        count: jest.fn().mockImplementation(({ where }) => {
          const now = new Date();
          let c = 0;
          for (const a of mockSponsorAds.values()) {
            if (where.sponsorId && a.sponsorId !== where.sponsorId) continue;
            if (where.status?.in && !where.status.in.includes(a.status)) continue;
            if (where.status && typeof where.status === 'string' && a.status !== where.status)
              continue;
            if (where.startsAt?.lte && a.startsAt > now) continue;
            if (where.endsAt?.gt && a.endsAt <= now) continue;
            if (where.deletedAt === null && a.deletedAt !== null) continue;

            if (a.eventId) {
              const ev = mockEvents.get(a.eventId);
              if (where.OR && (!ev || ev.endsAt <= now || ev.deletedAt !== null)) continue;
            }

            const sp = mockUsers.get(a.sponsorId);
            if (where.sponsor?.status && (!sp || sp.status !== where.sponsor.status)) continue;

            c++;
          }
          return c;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const a = mockSponsorAds.get(where.id);
          if (!a) return null;
          Object.assign(a, data, { updatedAt: new Date() });
          return {
            ...a,
            sponsor: {
              ...mockUsers.get(a.sponsorId),
              sponsorProfile: mockSponsorProfiles.get(a.sponsorId),
            },
          };
        }),
      },

      outboxEvent: {
        create: jest.fn().mockImplementation(({ data }) => {
          mockOutboxEvents.push(data);
          return { id: uuidv4(), ...data };
        }),
      },

      auditLog: {
        create: jest.fn().mockImplementation(({ data }) => {
          mockAuditLogs.push(data);
          return { id: uuidv4(), ...data };
        }),
      },
    };

    const mockRedis = {
      getClient: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
        ping: jest.fn().mockResolvedValue('PONG'),
        quit: jest.fn().mockResolvedValue('OK'),
      }),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const mockQueue = {
      addJob: jest.fn().mockResolvedValue(undefined),
      getQueue: jest.fn().mockReturnValue({ add: jest.fn().mockResolvedValue(undefined) }),
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

    tokenService = moduleFixture.get<TokenService>(TokenService);

    tokenProviderA = (
      await tokenService.generateTokens(
        providerA.id,
        providerA.email,
        ['PROVIDER'],
        ['manage:c2b_service', 'manage:c2b_booking', 'manage:coupon'],
      )
    ).accessToken;

    tokenProviderB = (
      await tokenService.generateTokens(
        providerB.id,
        providerB.email,
        ['PROVIDER'],
        ['manage:c2b_service', 'manage:c2b_booking', 'manage:coupon'],
      )
    ).accessToken;

    tokenInactiveProvider = (
      await tokenService.generateTokens(
        inactiveProvider.id,
        inactiveProvider.email,
        ['PROVIDER'],
        ['manage:c2b_service', 'manage:c2b_booking', 'manage:coupon'],
      )
    ).accessToken;

    tokenSponsorA = (
      await tokenService.generateTokens(
        sponsorA.id,
        sponsorA.email,
        ['SPONSOR'],
        ['manage:sponsor_ad'],
      )
    ).accessToken;

    tokenSponsorB = (
      await tokenService.generateTokens(
        sponsorB.id,
        sponsorB.email,
        ['SPONSOR'],
        ['manage:sponsor_ad'],
      )
    ).accessToken;

    tokenInactiveSponsor = (
      await tokenService.generateTokens(
        inactiveSponsor.id,
        inactiveSponsor.email,
        ['SPONSOR'],
        ['manage:sponsor_ad'],
      )
    ).accessToken;

    tokenAdmin = (
      await tokenService.generateTokens(
        adminUser.id,
        adminUser.email,
        ['ADMIN'],
        ['manage:all', 'review:sponsor_ad'],
      )
    ).accessToken;

    tokenAttendeeA = (
      await tokenService.generateTokens(
        attendeeA.id,
        attendeeA.email,
        ['ATTENDEE'],
        ['create:c2b_booking', 'redeem:coupon'],
      )
    ).accessToken;

    tokenAttendeeB = (
      await tokenService.generateTokens(
        attendeeB.id,
        attendeeB.email,
        ['ATTENDEE'],
        ['create:c2b_booking', 'redeem:coupon'],
      )
    ).accessToken;

    for (const a of concurrentAttendees) {
      const t = (
        await tokenService.generateTokens(
          a.id,
          a.email,
          ['ATTENDEE'],
          ['create:c2b_booking', 'redeem:coupon'],
        )
      ).accessToken;
      tokensConcurrentAttendees.push(t);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  // =========================================================================
  // FLOW 1: Active Provider creates C2B service -> Attendee discovers & books
  // =========================================================================
  describe('Flow 1: C2B Service Lifecycle & Attendee Booking', () => {
    let createdServiceId: string;
    let createdBookingId: string;

    it('should allow active Provider to create C2B service scoped to event', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/provider/services')
        .set('Authorization', `Bearer ${tokenProviderA}`)
        .send({
          eventId: activeEvent.id,
          name: 'VIP Executive Chauffeur & Airport Transfer',
          category: C2bServiceCategory.TRANSPORTATION,
          shortDescription: 'Luxury Mercedes S-Class transfer for summit delegates',
          detailedDescription:
            'Includes bottled water, high-speed Wi-Fi and meet-and-greet at airport.',
          price: 350.0,
          currency: 'SAR',
          expiresAt: new Date(Date.now() + 86400000 * 3).toISOString(),
          contactMethod: 'IN_APP',
          maxBookings: 20,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.name).toEqual('VIP Executive Chauffeur & Airport Transfer');
      createdServiceId = res.body.data.id;
    });

    it('should allow public / attendee to discover the service', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/c2b/services?eventId=${activeEvent.id}&category=${C2bServiceCategory.TRANSPORTATION}`,
        )
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      const item = res.body.data.items.find((i: any) => i.id === createdServiceId);
      expect(item).toBeDefined();
      expect(item.provider.businessName).toEqual('Apex Hospitality & Travel');
    });

    it('should allow attendee to create a booking request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/c2b/bookings')
        .set('Authorization', `Bearer ${tokenAttendeeA}`)
        .send({
          serviceId: createdServiceId,
          notes: 'Flight SV123 arriving at 4:30 PM',
          contactMethod: 'WHATSAPP',
          contactValue: '+966501234567',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toEqual(C2bBookingStatus.PENDING);
      createdBookingId = res.body.data.id;
    });

    it('should allow provider to see and confirm booking request', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/provider/bookings/${createdBookingId}/status`)
        .set('Authorization', `Bearer ${tokenProviderA}`)
        .send({
          status: C2bBookingStatus.CONFIRMED,
          providerNotes: 'Driver assigned: Mohammed (+966555555555)',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toEqual(C2bBookingStatus.CONFIRMED);
    });

    it('should allow attendee to view their confirmed booking', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/c2b/bookings/${createdBookingId}`)
        .set('Authorization', `Bearer ${tokenAttendeeA}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toEqual(C2bBookingStatus.CONFIRMED);
      expect(res.body.data.providerNotes).toContain('Mohammed');
    });
  });

  // =========================================================================
  // FLOW 2: Concurrency on Booking Capacity (maxBookings = 2)
  // =========================================================================
  describe('Flow 2: Concurrency Defense on Service Capacity (maxBookings = 2)', () => {
    let limitedServiceId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/provider/services')
        .set('Authorization', `Bearer ${tokenProviderA}`)
        .send({
          eventId: activeEvent.id,
          name: 'Exclusive VIP Luxury Chalet (Strict Limit 2)',
          category: C2bServiceCategory.ACCOMMODATION,
          shortDescription: 'Only 2 available',
          detailedDescription: 'Strict capacity',
          expiresAt: new Date(Date.now() + 86400000 * 3).toISOString(),
          contactMethod: 'IN_APP',
          maxBookings: 2,
        })
        .expect(201);

      limitedServiceId = res.body.data.id;
    });

    it('should allow at most 2 successful bookings out of 10 concurrent requests', async () => {
      const promises = tokensConcurrentAttendees.map((t) =>
        request(app.getHttpServer())
          .post('/api/v1/c2b/bookings')
          .set('Authorization', `Bearer ${t}`)
          .send({
            serviceId: limitedServiceId,
            notes: 'Concurrent booking attempt',
          }),
      );

      const results = await Promise.all(promises);
      const successCount = results.filter((r) => r.status === 201).length;
      const rejectedCount = results.filter((r) => r.status === 409).length;

      expect(successCount).toBe(2);
      expect(rejectedCount).toBe(8);

      const s = mockC2bServices.get(limitedServiceId);
      expect(s.bookingCount).toBe(2);
    });
  });

  // =========================================================================
  // FLOW 3 & 4: Coupon Management, Validation, Anti-Replay & Concurrency
  // =========================================================================
  describe('Flow 3 & 4: Coupons, Validation, Anti-Double-Redeem & Concurrency', () => {
    const couponCode = 'GLOBAL25';

    it('should allow provider to create coupon with normalized code', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/provider/coupons')
        .set('Authorization', `Bearer ${tokenProviderA}`)
        .send({
          eventId: activeEvent.id,
          code: '  global25  ',
          discountType: DiscountType.PERCENTAGE,
          discountValue: 25.0,
          maxRedemptions: 3,
          expiresAt: new Date(Date.now() + 86400000 * 3).toISOString(),
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.normalizedCode).toEqual('GLOBAL25');
    });

    it('should validate coupon code successfully', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/c2b/coupons/validate')
        .send({
          code: 'global25',
          eventId: activeEvent.id,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.valid).toBe(true);
      expect(res.body.data.estimatedDiscount).toEqual(25);
    });

    it('should allow Attendee A to redeem coupon once', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/c2b/coupons/redeem')
        .set('Authorization', `Bearer ${tokenAttendeeA}`)
        .send({
          code: couponCode,
          eventId: activeEvent.id,
          idempotencyKey: 'idemp-attendee-A',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.discountAmount).toEqual(25);
    });

    it('should reject duplicate redemption by Attendee A (Anti-Replay / Double Redeem Defense)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/c2b/coupons/redeem')
        .set('Authorization', `Bearer ${tokenAttendeeA}`)
        .send({
          code: couponCode,
          eventId: activeEvent.id,
        })
        .expect(400); // Validation fails because already redeemed

      expect(res.body.success).toBe(false);
    });

    it('should enforce maxRedemptions = 3 concurrently across distinct attendees', async () => {
      // Coupon GLOBAL25 has maxRedemptions = 3. 1 was used by Attendee A, 2 remain.
      const promises = tokensConcurrentAttendees.slice(0, 5).map((t) =>
        request(app.getHttpServer())
          .post('/api/v1/c2b/coupons/redeem')
          .set('Authorization', `Bearer ${t}`)
          .send({
            code: couponCode,
            eventId: activeEvent.id,
          }),
      );

      const results = await Promise.all(promises);
      const successCount = results.filter((r) => r.status === 200).length;
      const conflictCount = results.filter((r) => r.status === 409 || r.status === 400).length;

      expect(successCount).toBe(2); // 1 + 2 = 3 total max
      expect(conflictCount).toBe(3);
    });
  });

  // =========================================================================
  // FLOW 5: Sponsor Ad Lifecycle, Admin Moderation & Public Expiry
  // =========================================================================
  describe('Flow 5: Sponsor Ads Lifecycle & Expiration Filtering', () => {
    let createdAdId: string;

    it('should allow active Sponsor to create ad in DRAFT state', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/sponsor/ads')
        .set('Authorization', `Bearer ${tokenSponsorA}`)
        .send({
          eventId: activeEvent.id,
          title: 'CloudScale Enterprise GPU Cluster',
          description: 'Deploy on-premise generative AI in seconds.',
          imageUrl: 'https://storage.innovent.app/ads/gpu.jpg',
          destinationUrl: 'https://cloudscale.example.com/expo',
          placement: SponsorAdPlacement.MARKETPLACE,
          startsAt: new Date(Date.now() - 3600000).toISOString(),
          endsAt: new Date(Date.now() + 86400000 * 2).toISOString(),
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toEqual(SponsorAdStatus.DRAFT);
      createdAdId = res.body.data.id;
    });

    it('should not be visible in public ads while in DRAFT', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/c2b/ads/${createdAdId}`)
        .expect(404);

      expect(res.body.success).toBe(false);
    });

    it('should allow sponsor to submit ad for moderation review', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/sponsor/ads/${createdAdId}/submit`)
        .set('Authorization', `Bearer ${tokenSponsorA}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toEqual(SponsorAdStatus.PENDING_REVIEW);
    });

    it('should allow Admin to approve submitted ad', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/ads/${createdAdId}/approve`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect([SponsorAdStatus.APPROVED, SponsorAdStatus.PUBLISHED]).toContain(res.body.data.status);
    });

    it('should now be discoverable in public ads', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/c2b/ads/${createdAdId}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toEqual(createdAdId);
      expect(res.body.data.sponsor.companyName).toEqual('CloudScale AI Corp');
    });

    it('should disappear from public ads immediately when endsAt passes (Query-Level Expiry)', async () => {
      // Simulate passage of time by setting endsAt to past
      const ad = mockSponsorAds.get(createdAdId);
      ad.endsAt = new Date(Date.now() - 5000);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/c2b/ads/${createdAdId}`)
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // FLOW 6: Security, IDOR & Authorization Defense Matrix
  // =========================================================================
  describe('Flow 6: Security, IDOR & Authorization Matrix', () => {
    let serviceAId: string;
    let adAId: string;
    let bookingAId: string;

    beforeAll(async () => {
      const s = await request(app.getHttpServer())
        .post('/api/v1/provider/services')
        .set('Authorization', `Bearer ${tokenProviderA}`)
        .send({
          eventId: activeEvent.id,
          name: 'Provider A Secret Package',
          category: C2bServiceCategory.OTHER,
          shortDescription: 'Desc',
          detailedDescription: 'Terms',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          contactMethod: 'IN_APP',
        });
      serviceAId = s.body.data.id;

      const a = await request(app.getHttpServer())
        .post('/api/v1/sponsor/ads')
        .set('Authorization', `Bearer ${tokenSponsorA}`)
        .send({
          title: 'Sponsor A Exclusive Ad',
          description: 'Desc',
          imageUrl: 'https://example.com/ad.jpg',
          destinationUrl: 'https://example.com',
          startsAt: new Date(Date.now() - 1000).toISOString(),
          endsAt: new Date(Date.now() + 86400000).toISOString(),
        });
      adAId = a.body.data.id;

      const b = await request(app.getHttpServer())
        .post('/api/v1/c2b/bookings')
        .set('Authorization', `Bearer ${tokenAttendeeA}`)
        .send({
          serviceId: serviceAId,
          notes: 'Attendee A booking',
          contactMethod: 'IN_APP',
        });
      bookingAId = b.body.data.id;
    });

    it('Provider B cannot update Provider A service (IDOR)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/provider/services/${serviceAId}`)
        .set('Authorization', `Bearer ${tokenProviderB}`)
        .send({ name: 'Hacked Service' })
        .expect(403);
    });

    it('Provider B cannot delete Provider A service (IDOR)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/provider/services/${serviceAId}`)
        .set('Authorization', `Bearer ${tokenProviderB}`)
        .expect(403);
    });

    it('Attendee B cannot cancel Attendee A booking (IDOR)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/c2b/bookings/${bookingAId}/cancel`)
        .set('Authorization', `Bearer ${tokenAttendeeB}`)
        .expect(403);
    });

    it('Sponsor B cannot modify Sponsor A ad (IDOR)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/sponsor/ads/${adAId}`)
        .set('Authorization', `Bearer ${tokenSponsorB}`)
        .send({ title: 'Hacked Ad' })
        .expect(403);
    });

    it('Sponsor cannot approve ads (Role Boundary)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/admin/ads/${adAId}/approve`)
        .set('Authorization', `Bearer ${tokenSponsorA}`)
        .expect(403);
    });

    it('Provider cannot approve ads (Role Boundary)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/admin/ads/${adAId}/approve`)
        .set('Authorization', `Bearer ${tokenProviderA}`)
        .expect(403);
    });

    it('Suspended Provider cannot create services (Status Gating)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/provider/services')
        .set('Authorization', `Bearer ${tokenInactiveProvider}`)
        .send({
          eventId: activeEvent.id,
          name: 'Suspended Service',
          category: C2bServiceCategory.OTHER,
          shortDescription: 'Desc',
          detailedDescription: 'Terms',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          contactMethod: 'IN_APP',
        })
        .expect(403);
    });

    it('Pending Sponsor cannot create ads (Status Gating)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/sponsor/ads')
        .set('Authorization', `Bearer ${tokenInactiveSponsor}`)
        .send({
          title: 'Pending Ad',
          description: 'Desc',
          imageUrl: 'https://example.com/ad.jpg',
          destinationUrl: 'https://example.com',
          startsAt: new Date(Date.now() + 1000).toISOString(),
          endsAt: new Date(Date.now() + 86400000).toISOString(),
        })
        .expect(403);
    });
  });

  // =========================================================================
  // FLOW 7: Event Ended Expiration Query Invariant
  // =========================================================================
  describe('Flow 7: Ended Event Query-Level Invariant', () => {
    let endedEventServiceId: string;

    beforeAll(() => {
      // Create service directly attached to endedEvent in memory
      const s = {
        id: uuidv4(),
        providerId: providerA.id,
        eventId: endedEvent.id,
        name: 'Historic Past Service',
        category: C2bServiceCategory.OTHER,
        shortDescription: 'Event has ended',
        detailedDescription: 'Detailed terms',
        images: [],
        price: null,
        discountPercentage: null,
        currency: 'SAR',
        expiresAt: new Date(Date.now() + 86400000 * 2),
        contactMethod: 'IN_APP',
        isAvailable: true,
        bookingCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        event: endedEvent,
        provider: providerA,
      };
      mockC2bServices.set(s.id, s);
      endedEventServiceId = s.id;
    });

    it('should not return services from ended events in public discovery', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/c2b/services?eventId=${endedEvent.id}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBe(0);
    });

    it('should return 404 for individual service details when event has ended', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/c2b/services/${endedEventServiceId}`)
        .expect(404);
    });
  });
});
