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
import { AccountStatus, EventStatus, EventVisibility, RegistrationStatus } from '@prisma/client';

describe('Events, Agenda & Sessions End-to-End Suite (e2e)', () => {
  jest.setTimeout(45000);
  let app: INestApplication;
  let tokenService: TokenService;

  // In-memory data store for hermetic E2E execution
  type MockEntity = any;
  const mockUsers = new Map<string, MockEntity>();
  const mockRoles = new Map<string, MockEntity>([
    ['ATTENDEE', { id: uuidv4(), name: 'ATTENDEE', rolePermissions: [] }],
    ['ORGANIZER', { id: uuidv4(), name: 'ORGANIZER', rolePermissions: [] }],
    ['EVENT_OWNER', { id: uuidv4(), name: 'EVENT_OWNER', rolePermissions: [] }],
    ['ADMIN', { id: uuidv4(), name: 'ADMIN', rolePermissions: [] }],
  ]);
  const mockUserRoles = new Map<string, MockEntity>();
  const mockEvents = new Map<string, MockEntity>();
  const mockEventOrganizers = new Map<string, MockEntity>();
  const mockEventRegistrations = new Map<string, MockEntity>();
  const mockVenues = new Map<string, MockEntity>();
  const mockSpeakers = new Map<string, MockEntity>();
  const mockSessions = new Map<string, MockEntity>();
  const mockSessionSpeakers = new Map<string, MockEntity>();
  const mockUserSessionSchedules = new Map<string, MockEntity>();
  const mockUserSessionNotes = new Map<string, MockEntity>();
  const mockOutboxEvents: MockEntity[] = [];

  // User fixtures with valid UUIDs
  const ownerUser = {
    id: uuidv4(),
    email: 'owner@innovent.app',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
  };
  const coOrgUser = {
    id: uuidv4(),
    email: 'coorg@innovent.app',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
  };
  const unassignedOrgUser = {
    id: uuidv4(),
    email: 'unassigned@innovent.app',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
  };
  const suspendedOrgUser = {
    id: uuidv4(),
    email: 'suspended@innovent.app',
    status: AccountStatus.SUSPENDED,
    deletedAt: null,
  };
  const attendeeUser = {
    id: uuidv4(),
    email: 'attendee@innovent.app',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
  };
  const attendeeUser2 = {
    id: uuidv4(),
    email: 'attendee2@innovent.app',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
  };
  const adminUser = {
    id: uuidv4(),
    email: 'admin@innovent.app',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
  };

  let ownerToken: string;
  let coOrgToken: string;
  let unassignedOrgToken: string;
  let attendeeToken: string;
  let attendee2Token: string;
  let adminToken: string;

  beforeAll(async () => {
    // Populate mock users & roles
    [
      ownerUser,
      coOrgUser,
      unassignedOrgUser,
      suspendedOrgUser,
      attendeeUser,
      attendeeUser2,
      adminUser,
    ].forEach((u) => mockUsers.set(u.id, u));

    const assignRole = (userId: string, roleName: string) => {
      const id = uuidv4();
      mockUserRoles.set(id, { id, userId, roleId: mockRoles.get(roleName)!.id, roleName });
    };

    assignRole(ownerUser.id, 'EVENT_OWNER');
    assignRole(ownerUser.id, 'ORGANIZER');
    assignRole(coOrgUser.id, 'ORGANIZER');
    assignRole(unassignedOrgUser.id, 'ORGANIZER');
    assignRole(suspendedOrgUser.id, 'ORGANIZER');
    assignRole(attendeeUser.id, 'ATTENDEE');
    assignRole(attendeeUser2.id, 'ATTENDEE');
    assignRole(adminUser.id, 'ADMIN');

    const mockPrisma = {
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue(true),
      $queryRaw: jest.fn().mockRejectedValue(new Error('Use fallback in tests')),
      $transaction: jest.fn().mockImplementation(async (callback) => callback(mockPrisma)),

      role: {
        findUnique: jest.fn().mockImplementation(({ where }) => mockRoles.get(where.name) || null),
      },

      user: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          for (const u of mockUsers.values()) {
            if (where.email && u.email !== where.email) continue;
            if (where.id && u.id !== where.id) continue;
            if (where.deletedAt === null && u.deletedAt !== null) continue;

            const roles = Array.from(mockUserRoles.values())
              .filter((ur) => ur.userId === u.id)
              .map((ur) => ({ role: mockRoles.get(ur.roleName) }));
            return { ...u, userRoles: roles };
          }
          return null;
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          for (const u of mockUsers.values()) {
            if (where.id && u.id !== where.id) continue;
            const roles = Array.from(mockUserRoles.values())
              .filter((ur) => ur.userId === u.id)
              .map((ur) => ({ role: mockRoles.get(ur.roleName) }));
            return { ...u, userRoles: roles };
          }
          return null;
        }),
      },

      event: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = uuidv4();
          const event = {
            id,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            registrations: [],
          };
          mockEvents.set(id, event);
          return event;
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          for (const e of mockEvents.values()) {
            if (where.id && e.id !== where.id) continue;
            if (where.deletedAt === null && e.deletedAt !== null) continue;
            return { ...e };
          }
          return null;
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const e = mockEvents.get(where.id);
          return e ? { ...e } : null;
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          const res = [];
          for (const e of mockEvents.values()) {
            if (where.deletedAt === null && e.deletedAt !== null) continue;
            if (where.status && typeof where.status === 'object' && where.status.in) {
              if (!where.status.in.includes(e.status)) continue;
            } else if (where.status && e.status !== where.status) {
              continue;
            }
            if (where.visibility && e.visibility !== where.visibility) continue;

            const regs = Array.from(mockEventRegistrations.values()).filter(
              (r) => r.eventId === e.id && r.status === RegistrationStatus.REGISTERED,
            );
            res.push({ ...e, registrations: regs });
          }
          return res;
        }),
        count: jest.fn().mockImplementation(({ where }) => {
          let c = 0;
          for (const e of mockEvents.values()) {
            if (where.deletedAt === null && e.deletedAt !== null) continue;
            if (where.status && typeof where.status === 'object' && where.status.in) {
              if (!where.status.in.includes(e.status)) continue;
            } else if (where.status && e.status !== where.status) {
              continue;
            }
            if (where.visibility && e.visibility !== where.visibility) continue;
            c++;
          }
          return c;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const e = mockEvents.get(where.id);
          if (!e) throw new Error('Event not found');
          for (const key of Object.keys(data)) {
            if (data[key] !== undefined) {
              e[key] = data[key];
            }
          }
          e.updatedAt = new Date();
          return { ...e };
        }),
      },

      eventOrganizer: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const key = `${where.eventId_userId.eventId}_${where.eventId_userId.userId}`;
          return mockEventOrganizers.get(key) || null;
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          const res = [];
          for (const eo of mockEventOrganizers.values()) {
            if (eo.eventId === where.eventId) {
              res.push({
                ...eo,
                user: mockUsers.get(eo.userId),
              });
            }
          }
          return res;
        }),
        upsert: jest.fn().mockImplementation(({ where, create, update }) => {
          const key = `${where.eventId_userId.eventId}_${where.eventId_userId.userId}`;
          let eo = mockEventOrganizers.get(key);
          if (eo) {
            Object.assign(eo, update);
          } else {
            eo = {
              id: uuidv4(),
              ...create,
              assignedAt: new Date(),
            };
            mockEventOrganizers.set(key, eo);
          }
          return { ...eo };
        }),
        delete: jest.fn().mockImplementation(({ where }) => {
          for (const [k, eo] of mockEventOrganizers.entries()) {
            if (
              eo.id === where.id ||
              (where.eventId_userId &&
                eo.eventId === where.eventId_userId.eventId &&
                eo.userId === where.eventId_userId.userId)
            ) {
              mockEventOrganizers.delete(k);
              return eo;
            }
          }
          return null;
        }),
      },

      eventRegistration: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.eventId_userId) {
            const key = `${where.eventId_userId.eventId}_${where.eventId_userId.userId}`;
            return mockEventRegistrations.get(key) || null;
          }
          for (const r of mockEventRegistrations.values()) {
            if (r.id === where.id) return r;
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          const res = [];
          for (const r of mockEventRegistrations.values()) {
            if (r.eventId === where.eventId) {
              res.push({
                ...r,
                user: mockUsers.get(r.userId),
              });
            }
          }
          return res;
        }),
        count: jest.fn().mockImplementation(({ where }) => {
          let c = 0;
          for (const r of mockEventRegistrations.values()) {
            if (where.eventId && r.eventId !== where.eventId) continue;
            if (where.status && r.status !== where.status) continue;
            c++;
          }
          return c;
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const id = uuidv4();
          const key = `${data.eventId}_${data.userId}`;
          const reg = {
            id,
            ...data,
            registeredAt: new Date(),
            cancelledAt: null,
          };
          mockEventRegistrations.set(key, reg);
          return reg;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          for (const [, reg] of mockEventRegistrations.entries()) {
            if (reg.id === where.id) {
              Object.assign(reg, data);
              return { ...reg };
            }
          }
          throw new Error('Registration not found');
        }),
      },

      venue: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = uuidv4();
          const venue = {
            id,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockVenues.set(id, venue);
          return venue;
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          for (const v of mockVenues.values()) {
            if (where.id && v.id !== where.id) continue;
            if (where.eventId && v.eventId !== where.eventId) continue;
            return { ...v };
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          const res = [];
          for (const v of mockVenues.values()) {
            if (where.eventId && v.eventId !== where.eventId) continue;
            res.push({ ...v });
          }
          return res;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const v = mockVenues.get(where.id);
          if (!v) throw new Error('Venue not found');
          for (const key of Object.keys(data)) {
            if (data[key] !== undefined) v[key] = data[key];
          }
          v.updatedAt = new Date();
          return { ...v };
        }),
        delete: jest.fn().mockImplementation(({ where }) => {
          const v = mockVenues.get(where.id);
          mockVenues.delete(where.id);
          return v;
        }),
      },

      speaker: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = uuidv4();
          const speaker = {
            id,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockSpeakers.set(id, speaker);
          return speaker;
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          for (const s of mockSpeakers.values()) {
            if (where.id && s.id !== where.id) continue;
            if (where.eventId && s.eventId !== where.eventId) continue;
            return { ...s };
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          const res = [];
          for (const s of mockSpeakers.values()) {
            if (where.eventId && s.eventId !== where.eventId) continue;
            if (where.id && where.id.in && !where.id.in.includes(s.id)) continue;
            res.push({ ...s });
          }
          return res;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const s = mockSpeakers.get(where.id);
          if (!s) throw new Error('Speaker not found');
          for (const key of Object.keys(data)) {
            if (data[key] !== undefined) s[key] = data[key];
          }
          s.updatedAt = new Date();
          return { ...s };
        }),
        delete: jest.fn().mockImplementation(({ where }) => {
          const s = mockSpeakers.get(where.id);
          mockSpeakers.delete(where.id);
          return s;
        }),
      },

      session: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = uuidv4();
          const venue = data.venueId ? mockVenues.get(data.venueId) : null;
          const session = {
            id,
            ...data,
            venueId: data.venueId || null,
            venue,
            speakers: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
          };
          mockSessions.set(id, session);
          return session;
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          for (const s of mockSessions.values()) {
            if (where.id && typeof where.id === 'string' && s.id !== where.id) continue;
            if (where.id && typeof where.id === 'object' && where.id.not && s.id === where.id.not)
              continue;
            if (where.eventId && s.eventId !== where.eventId) continue;
            if (where.deletedAt === null && s.deletedAt !== null) continue;
            if (where.venueId && s.venueId !== where.venueId) continue;
            if (where.status && where.status.not && s.status === where.status.not) continue;

            // Overlap check: startsAt < proposedEndsAt && endsAt > proposedStartsAt
            if (where.AND && Array.isArray(where.AND)) {
              const startsAtCondition = where.AND.find(
                (c: Record<string, unknown>) =>
                  (c as { startsAt?: { lt?: Date } }).startsAt?.lt !== undefined,
              ) as { startsAt: { lt: Date } } | undefined;
              const endsAtCondition = where.AND.find(
                (c: Record<string, unknown>) =>
                  (c as { endsAt?: { gt?: Date } }).endsAt?.gt !== undefined,
              ) as { endsAt: { gt: Date } } | undefined;
              if (startsAtCondition && endsAtCondition) {
                const pEndsAt = startsAtCondition.startsAt.lt;
                const pStartsAt = endsAtCondition.endsAt.gt;
                if (!(s.startsAt < pEndsAt && s.endsAt > pStartsAt)) {
                  continue;
                }
              }
            }

            const venue = s.venueId ? mockVenues.get(s.venueId) || null : null;
            const event = mockEvents.get(s.eventId);
            return { ...s, venue, event };
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          const res = [];
          for (const s of mockSessions.values()) {
            if (where.eventId && s.eventId !== where.eventId) continue;
            if (where.deletedAt === null && s.deletedAt !== null) continue;
            if (where.id && where.id.in && !where.id.in.includes(s.id)) continue;
            if (where.venueId && s.venueId !== where.venueId) continue;

            // OR for date violation checks
            if (where.OR && Array.isArray(where.OR)) {
              const startCondition = where.OR.find(
                (c: Record<string, unknown>) =>
                  (c as { startsAt?: { lt?: Date } }).startsAt?.lt !== undefined,
              ) as { startsAt: { lt: Date } } | undefined;
              const endCondition = where.OR.find(
                (c: Record<string, unknown>) =>
                  (c as { endsAt?: { gt?: Date } }).endsAt?.gt !== undefined,
              ) as { endsAt: { gt: Date } } | undefined;
              const startLt = startCondition?.startsAt?.lt;
              const endGt = endCondition?.endsAt?.gt;
              const violates = (startLt && s.startsAt < startLt) || (endGt && s.endsAt > endGt);
              if (!violates) continue;
            }

            const venue = s.venueId ? mockVenues.get(s.venueId) || null : null;
            res.push({ ...s, venue, speakers: [] });
          }
          return res;
        }),
        count: jest.fn().mockImplementation(({ where }) => {
          let c = 0;
          for (const s of mockSessions.values()) {
            if (where.venueId && s.venueId !== where.venueId) continue;
            if (where.deletedAt === null && s.deletedAt !== null) continue;
            c++;
          }
          return c;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const s = mockSessions.get(where.id);
          if (!s) throw new Error('Session not found');
          for (const key of Object.keys(data)) {
            if (data[key] !== undefined) s[key] = data[key];
          }
          s.updatedAt = new Date();
          const venue = s.venueId ? mockVenues.get(s.venueId) || null : null;
          return { ...s, venue, speakers: [] };
        }),
      },

      sessionSpeaker: {
        count: jest.fn().mockImplementation(({ where }) => {
          let c = 0;
          for (const ss of mockSessionSpeakers.values()) {
            if (ss.speakerId === where.speakerId) {
              const session = mockSessions.get(ss.sessionId);
              if (where.session?.deletedAt === null && session?.deletedAt !== null) continue;
              c++;
            }
          }
          return c;
        }),
        deleteMany: jest.fn().mockImplementation(({ where }) => {
          for (const [k, ss] of mockSessionSpeakers.entries()) {
            if (ss.sessionId === where.sessionId) mockSessionSpeakers.delete(k);
          }
          return { count: 0 };
        }),
        createMany: jest.fn().mockImplementation(({ data }) => {
          data.forEach((item: Record<string, unknown>) => {
            const id = uuidv4();
            mockSessionSpeakers.set(id, { id, ...item });
          });
          return { count: data.length };
        }),
      },

      userSessionSchedule: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const key = `${where.userId_sessionId.userId}_${where.userId_sessionId.sessionId}`;
          return mockUserSessionSchedules.get(key) || null;
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          const res = [];
          for (const us of mockUserSessionSchedules.values()) {
            if (us.userId === where.userId) {
              const session = mockSessions.get(us.sessionId);
              if (where.session?.deletedAt === null && session?.deletedAt !== null) continue;
              const venue = session?.venueId ? mockVenues.get(session.venueId) || null : null;
              res.push({
                ...us,
                session: { ...session, venue, speakers: [] },
              });
            }
          }
          return res;
        }),
        upsert: jest.fn().mockImplementation(({ where, create }) => {
          const key = `${where.userId_sessionId.userId}_${where.userId_sessionId.sessionId}`;
          let item = mockUserSessionSchedules.get(key);
          if (!item) {
            item = {
              id: uuidv4(),
              ...create,
              createdAt: new Date(),
            };
            mockUserSessionSchedules.set(key, item);
          }
          return { ...item };
        }),
        delete: jest.fn().mockImplementation(({ where }) => {
          for (const [k, item] of mockUserSessionSchedules.entries()) {
            if (item.id === where.id) {
              mockUserSessionSchedules.delete(k);
              return item;
            }
          }
          return null;
        }),
      },

      userSessionNote: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const key = `${where.userId_sessionId.userId}_${where.userId_sessionId.sessionId}`;
          return mockUserSessionNotes.get(key) || null;
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          const res = [];
          for (const un of mockUserSessionNotes.values()) {
            if (un.userId === where.userId) {
              if (where.sessionId?.in && !where.sessionId.in.includes(un.sessionId)) continue;
              res.push({ ...un });
            }
          }
          return res;
        }),
        upsert: jest.fn().mockImplementation(({ where, create, update }) => {
          const key = `${where.userId_sessionId.userId}_${where.userId_sessionId.sessionId}`;
          let note = mockUserSessionNotes.get(key);
          if (note) {
            Object.assign(note, update, { updatedAt: new Date() });
          } else {
            note = {
              id: uuidv4(),
              ...create,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            mockUserSessionNotes.set(key, note);
          }
          return { ...note };
        }),
      },

      refreshToken: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: uuidv4(),
          ...data,
          createdAt: new Date(),
        })),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      outboxEvent: {
        create: jest.fn().mockImplementation(({ data }) => {
          const event = { id: `outbox-${Date.now()}`, ...data };
          mockOutboxEvents.push(event);
          return event;
        }),
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(RedisService)
      .useValue({
        ping: jest.fn().mockResolvedValue(true),
        getClient: jest.fn().mockReturnValue(null),
      })
      .overrideProvider(QueueService)
      .useValue({
        addJob: jest.fn().mockResolvedValue({ id: 'job-mock-id' }),
        getQueue: jest.fn().mockReturnValue(undefined),
      })
      .compile();

    tokenService = moduleFixture.get<TokenService>(TokenService);

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', {
      exclude: ['health', 'health/live', 'health/ready'],
    });
    app.useGlobalPipes(createGlobalValidationPipe());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();

    // Generate real access tokens using TokenService
    const tokens = await Promise.all([
      tokenService.generateTokens(ownerUser.id, ownerUser.email, ['EVENT_OWNER', 'ORGANIZER'], []),
      tokenService.generateTokens(coOrgUser.id, coOrgUser.email, ['ORGANIZER'], []),
      tokenService.generateTokens(unassignedOrgUser.id, unassignedOrgUser.email, ['ORGANIZER'], []),
      tokenService.generateTokens(attendeeUser.id, attendeeUser.email, ['ATTENDEE'], []),
      tokenService.generateTokens(attendeeUser2.id, attendeeUser2.email, ['ATTENDEE'], []),
      tokenService.generateTokens(adminUser.id, adminUser.email, ['ADMIN'], []),
    ]);

    ownerToken = tokens[0].accessToken;
    coOrgToken = tokens[1].accessToken;
    unassignedOrgToken = tokens[2].accessToken;
    attendeeToken = tokens[3].accessToken;
    attendee2Token = tokens[4].accessToken;
    adminToken = tokens[5].accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  let createdEventId: string;
  let createdVenueId: string;
  let createdSpeakerId: string;
  let createdSessionId: string;

  const validEventPayload = {
    name: 'Global AI Summit 2026',
    type: 'CONFERENCE',
    shortDescription: 'The premier AI conference of 2026',
    description:
      'Detailed description of the global AI summit covering generative models and robotics.',
    startsAt: '2026-11-10T09:00:00.000Z',
    endsAt: '2026-11-12T18:00:00.000Z',
    venueName: 'Riyadh International Exhibition Center',
    address: 'King Abdullah Road',
    city: 'Riyadh',
    country: 'Saudi Arabia',
    capacity: 1, // Restricted capacity to test concurrency & overflow limits
    coverImageUrl: 'https://example.com/cover.jpg',
    logoUrl: 'https://example.com/logo.jpg',
    mainVideoUrl: 'https://example.com/video.mp4',
    tags: ['AI', 'Robotics'],
    officialLanguages: ['en', 'ar'],
    visibility: EventVisibility.PUBLIC,
  };

  // Step 1: Create Event by ORGANIZER / EVENT_OWNER
  it('Step 1: POST /api/v1/events - EVENT_OWNER creates event in DRAFT status', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(validEventPayload)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.status).toBe(EventStatus.DRAFT);
    expect(res.body.data.ownerId).toBe(ownerUser.id);
    expect(res.body.data.capacity).toBe(1);

    createdEventId = res.body.data.id;
  });

  // Step 2: Non-organizer (ATTENDEE) gets 403 Forbidden
  it('Step 2: POST /api/v1/events - Non-organizer role (ATTENDEE) is rejected with 403 Forbidden', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${attendeeToken}`)
      .send(validEventPayload)
      .expect(403);

    expect(res.body.success).toBe(false);
  });

  // Step 3: Invalid dates validation (endsAt <= startsAt) returns 400
  it('Step 3: POST /api/v1/events - Invalid dates (endsAt <= startsAt) returns 400 Bad Request', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        ...validEventPayload,
        startsAt: '2026-11-15T00:00:00.000Z',
        endsAt: '2026-11-10T00:00:00.000Z',
      })
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  // Step 4: Anti-enumeration on DRAFT event (anonymous or attendee gets 404)
  it('Step 4: GET /api/v1/events/:id - Anonymous or non-manager gets 404 on DRAFT event', async () => {
    await request(app.getHttpServer()).get(`/api/v1/events/${createdEventId}`).expect(404);

    await request(app.getHttpServer())
      .get(`/api/v1/events/${createdEventId}`)
      .set('Authorization', `Bearer ${attendeeToken}`)
      .expect(404);
  });

  // Step 5: Event owner can view DRAFT event
  it('Step 5: GET /api/v1/events/:id - Event owner can view DRAFT event', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/events/${createdEventId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(createdEventId);
    expect(res.body.data.status).toBe(EventStatus.DRAFT);
  });

  // Step 6: Refinement 1: Owner cannot assign themselves as organizer
  it('Step 6: POST /api/v1/events/:id/organizers - Owner cannot assign themselves (400)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${createdEventId}/organizers`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: ownerUser.id })
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  // Step 7: Refinement 2: Target organizer must be ACTIVE (400 for SUSPENDED)
  it('Step 7: POST /api/v1/events/:id/organizers - Target must be ACTIVE (400 for suspended)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${createdEventId}/organizers`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: suspendedOrgUser.id })
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  // Step 8: Target organizer must hold ORGANIZER role (400 for attendee)
  it('Step 8: POST /api/v1/events/:id/organizers - Target must hold ORGANIZER role (400)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${createdEventId}/organizers`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: attendeeUser.id })
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  // Step 9: Successfully assign active co-organizer
  it('Step 9: POST /api/v1/events/:id/organizers - Successfully assigns active co-organizer', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${createdEventId}/organizers`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: coOrgUser.id })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBe(coOrgUser.id);
  });

  // Step 10: Assigned co-organizer can now view DRAFT event
  it('Step 10: GET /api/v1/events/:id - Assigned organizer can view DRAFT event', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/events/${createdEventId}`)
      .set('Authorization', `Bearer ${coOrgToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(createdEventId);
  });

  // Step 11: Create venue
  it('Step 11: POST /api/v1/events/:id/venues - Create venue for event', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${createdEventId}/venues`)
      .set('Authorization', `Bearer ${coOrgToken}`)
      .send({
        name: 'Main Auditorium',
        description: 'Primary keynote hall',
        capacity: 300,
        floor: 'Ground Floor',
        location: 'Building A',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Main Auditorium');
    createdVenueId = res.body.data.id;
  });

  // Step 12: Refinement 6: Capacity must be >= 1
  it('Step 12: POST /api/v1/events/:id/venues - Reject capacity < 1 (400)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/events/${createdEventId}/venues`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Small Room',
        capacity: 0,
      })
      .expect(400);
  });

  // Step 13: Create speaker
  it('Step 13: POST /api/v1/events/:id/speakers - Create speaker for event', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${createdEventId}/speakers`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fullName: 'Dr. Geoffrey Hinton',
        jobTitle: 'AI Pioneer',
        company: 'University of Toronto',
        bio: 'Nobel Laureate in Physics for work in neural networks.',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.fullName).toBe('Dr. Geoffrey Hinton');
    createdSpeakerId = res.body.data.id;
  });

  // Step 14: Create session within event dates & venue
  it('Step 14: POST /api/v1/events/:id/sessions - Create session within event window & venue', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${createdEventId}/sessions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: 'Keynote: The Dawn of Physical AI',
        description: 'Opening keynote session',
        startsAt: '2026-11-10T10:00:00.000Z',
        endsAt: '2026-11-10T11:30:00.000Z',
        venueId: createdVenueId,
        speakerIds: [createdSpeakerId],
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Keynote: The Dawn of Physical AI');
    createdSessionId = res.body.data.id;
  });

  // Step 15: Reject session outside event date window (400)
  it('Step 15: POST /api/v1/events/:id/sessions - Reject session outside event dates (400)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/events/${createdEventId}/sessions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: 'Premature Session',
        startsAt: '2026-11-08T10:00:00.000Z', // before event starts
        endsAt: '2026-11-08T11:30:00.000Z',
      })
      .expect(400);
  });

  // Step 16: Refinement 10: Reject overlapping session in same venue (409 Conflict)
  it('Step 16: POST /api/v1/events/:id/sessions - Overlapping session in same venue returns 409 Conflict', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${createdEventId}/sessions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: 'Conflicting Keynote',
        startsAt: '2026-11-10T10:30:00.000Z', // overlaps 10:00 - 11:30
        endsAt: '2026-11-10T12:00:00.000Z',
        venueId: createdVenueId,
      })
      .expect(409);

    expect(res.body.success).toBe(false);
  });

  // Step 17: Refinement 3: Reject deleting venue with active sessions (409 Conflict)
  it('Step 17: DELETE /api/v1/events/:id/venues/:id - Cannot delete venue with active sessions (409 Conflict)', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/events/${createdEventId}/venues/${createdVenueId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);

    expect(res.body.success).toBe(false);
  });

  // Step 18: Refinement 4: Reject deleting speaker assigned to active sessions (409 Conflict)
  it('Step 18: DELETE /api/v1/events/:id/speakers/:id - Cannot delete speaker assigned to sessions (409 Conflict)', async () => {
    // Manually register speaker assignment into mockSessionSpeakers to test block
    const assignmentId = uuidv4();
    mockSessionSpeakers.set(assignmentId, {
      id: assignmentId,
      sessionId: createdSessionId,
      speakerId: createdSpeakerId,
    });

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/events/${createdEventId}/speakers/${createdSpeakerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);

    expect(res.body.success).toBe(false);

    // Clean up test assignment
    mockSessionSpeakers.delete(assignmentId);
  });

  // Step 19: Refinement 5: Reject event date update if sessions fall outside (400)
  it('Step 19: PATCH /api/v1/events/:id - Reject event date modification that invalidates existing sessions (400)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/events/${createdEventId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        startsAt: '2026-11-11T00:00:00.000Z', // pushes start past session at Nov 10
      })
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  // Step 20: Publish event
  it('Step 20: POST /api/v1/events/:id/publish - Publish event', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${createdEventId}/publish`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(EventStatus.PUBLISHED);
  });

  // Step 21: Public discovery returns published event
  it('Step 21: GET /api/v1/events - Public list returns published event without auth', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/events').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toBeInstanceOf(Array);
    const found = res.body.data.items.find((e: { id: string }) => e.id === createdEventId);
    expect(found).toBeDefined();
  });

  // Step 22: Anonymous user can view published event
  it('Step 22: GET /api/v1/events/:id - Anonymous user can view published event', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/events/${createdEventId}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(createdEventId);
    expect(res.body.data.status).toBe(EventStatus.PUBLISHED);
  });

  // Step 23: Attendee successfully registers
  it('Step 23: POST /api/v1/events/:id/register - Attendee successfully registers', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${createdEventId}/register`)
      .set('Authorization', `Bearer ${attendeeToken}`)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBe(attendeeUser.id);
    expect(res.body.data.status).toBe(RegistrationStatus.REGISTERED);
  });

  // Step 24: Duplicate registration returns 409 Conflict
  it('Step 24: POST /api/v1/events/:id/register - Duplicate registration returns 409 Conflict', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${createdEventId}/register`)
      .set('Authorization', `Bearer ${attendeeToken}`)
      .expect(409);

    expect(res.body.success).toBe(false);
  });

  // Step 25: Attendee cancels registration
  it('Step 25: DELETE /api/v1/events/:id/register - Attendee cancels registration', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/events/${createdEventId}/register`)
      .set('Authorization', `Bearer ${attendeeToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  // Step 26: Refinement 7: Re-registration updates existing record cleanly
  it('Step 26: POST /api/v1/events/:id/register - Re-registration reactivates existing cancelled record', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${createdEventId}/register`)
      .set('Authorization', `Bearer ${attendeeToken}`)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(RegistrationStatus.REGISTERED);
    expect(res.body.data.cancelledAt).toBeNull();
  });

  // Step 27: Concurrency & Capacity overflow: Event capacity = 1, attendee 2 registration returns 409 Conflict
  it('Step 27: POST /api/v1/events/:id/register - Capacity reached returns 409 Conflict for second attendee', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${createdEventId}/register`)
      .set('Authorization', `Bearer ${attendee2Token}`)
      .expect(409);

    expect(res.body.success).toBe(false);
  });

  // Step 28: Attendee adds session to personal schedule
  it('Step 28: POST /api/v1/events/:eventId/sessions/:sessionId/schedule - Attendee adds session to personal schedule', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${createdEventId}/sessions/${createdSessionId}/schedule`)
      .set('Authorization', `Bearer ${attendeeToken}`)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.sessionId).toBe(createdSessionId);
  });

  // Step 29: Attendee saves personal note
  it('Step 29: PUT /api/v1/events/:eventId/sessions/:sessionId/note - Attendee saves personal note', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/v1/events/${createdEventId}/sessions/${createdSessionId}/note`)
      .set('Authorization', `Bearer ${attendeeToken}`)
      .send({ note: 'Ask Dr. Hinton about unlearning in backpropagation' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.note).toBe('Ask Dr. Hinton about unlearning in backpropagation');
  });

  // Step 30: Retrieve personal schedule with note
  it('Step 30: GET /api/v1/users/me/schedule - Attendee retrieves personal schedule containing note', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users/me/schedule')
      .set('Authorization', `Bearer ${attendeeToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    const item = res.body.data.find(
      (i: { sessionId: string; note?: string }) => i.sessionId === createdSessionId,
    );
    expect(item).toBeDefined();
    expect(item.note).toBe('Ask Dr. Hinton about unlearning in backpropagation');
  });

  // Step 31: Reorder sessions timeline
  it('Step 31: PATCH /api/v1/events/:eventId/sessions/reorder - Reorder sessions timeline', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/events/${createdEventId}/sessions/reorder`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ sessionIds: [createdSessionId] })
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  // Step 32: Unassigned organizer cannot update event (403 IDOR rejection)
  it('Step 32: PATCH /api/v1/events/:id - Unassigned organizer is rejected with 403 Forbidden', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/events/${createdEventId}`)
      .set('Authorization', `Bearer ${unassignedOrgToken}`)
      .send({ name: 'Hacked Event Name' })
      .expect(403);

    expect(res.body.success).toBe(false);
  });

  // Step 33: Admin override can update event
  it('Step 33: PATCH /api/v1/events/:id - Admin universal override can update event', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/events/${createdEventId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Admin Enhanced Global AI Summit 2026' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Admin Enhanced Global AI Summit 2026');
  });

  // Step 34: Cancel event
  it('Step 34: POST /api/v1/events/:id/cancel - Event cancellation sets status to CANCELLED', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${createdEventId}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(EventStatus.CANCELLED);
  });

  // Step 35: Soft-delete event
  it('Step 35: DELETE /api/v1/events/:id - Soft-delete event', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/events/${createdEventId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
  });
});
