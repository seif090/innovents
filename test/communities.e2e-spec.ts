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
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityType,
  CommunityVisibility,
  EventStatus,
  EventType,
  EventVisibility,
} from '@prisma/client';

describe('Communities, Meetups & Social Interaction End-to-End Suite (e2e)', () => {
  jest.setTimeout(45000);
  let app: INestApplication;
  let tokenService: TokenService;

  // Hermetic in-memory store
  type MockEntity = any;
  const mockUsers = new Map<string, MockEntity>();
  const mockRoles = new Map<string, MockEntity>([
    ['ATTENDEE', { id: uuidv4(), name: 'ATTENDEE', rolePermissions: [] }],
    ['SPONSOR', { id: uuidv4(), name: 'SPONSOR', rolePermissions: [] }],
    ['ADMIN', { id: uuidv4(), name: 'ADMIN', rolePermissions: [] }],
  ]);
  const mockUserRoles = new Map<string, MockEntity>();
  const mockEvents = new Map<string, MockEntity>();
  const mockCommunities = new Map<string, MockEntity>();
  const mockCommunityMembers = new Map<string, MockEntity>();
  const mockCommunityPosts = new Map<string, MockEntity>();
  const mockCommunityPostReplies = new Map<string, MockEntity>();
  const mockCommunityPostLikes = new Map<string, MockEntity>();
  const mockCommunityReplyLikes = new Map<string, MockEntity>();
  const mockCommunityMentions = new Map<string, MockEntity>();
  const mockCommunityMeetups = new Map<string, MockEntity>();
  const mockCommunityMeetupParticipants = new Map<string, MockEntity>();
  const mockCommunityChatMessages = new Map<string, MockEntity>();
  const mockOutboxEvents: MockEntity[] = [];
  const mockAuditLogs: MockEntity[] = [];

  // Users
  const creatorUser = {
    id: uuidv4(),
    email: 'creator@innovent.app',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
  };
  const memberUser = {
    id: uuidv4(),
    email: 'member@innovent.app',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
  };
  const member2User = {
    id: uuidv4(),
    email: 'member2@innovent.app',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
  };
  const outsiderUser = {
    id: uuidv4(),
    email: 'outsider@innovent.app',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
  };
  const sponsorUser = {
    id: uuidv4(),
    email: 'sponsor@innovent.app',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
  };
  const adminUser = {
    id: uuidv4(),
    email: 'admin@innovent.app',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
  };

  let creatorToken: string;
  let memberToken: string;
  let member2Token: string;
  let outsiderToken: string;
  let sponsorToken: string;
  let adminToken: string;

  // Sample Parent Event
  const parentEventId = uuidv4();
  const parentEvent = {
    id: parentEventId,
    ownerId: adminUser.id,
    name: 'INOVENT Tech World 2026',
    type: EventType.CONFERENCE,
    shortDescription: 'Flagship Event',
    description: 'Flagship tech event of the year',
    startsAt: new Date(Date.now() + 86400000), // tomorrow
    endsAt: new Date(Date.now() + 86400000 * 3), // +3 days
    venueName: 'Main Arena',
    address: 'King Fahd Rd',
    city: 'Riyadh',
    country: 'Saudi Arabia',
    capacity: 1000,
    coverImageUrl: 'https://cdn.innovent.app/cover.jpg',
    logoUrl: 'https://cdn.innovent.app/logo.jpg',
    mainVideoUrl: 'https://cdn.innovent.app/video.mp4',
    tags: ['AI', 'Tech'],
    officialLanguages: ['AR', 'EN'],
    visibility: EventVisibility.PUBLIC,
    status: EventStatus.PUBLISHED,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    // Populate mock users & roles
    [creatorUser, memberUser, member2User, outsiderUser, sponsorUser, adminUser].forEach((u) =>
      mockUsers.set(u.id, u),
    );

    const assignRole = (userId: string, roleName: string) => {
      const id = uuidv4();
      mockUserRoles.set(id, { id, userId, roleId: mockRoles.get(roleName)!.id, roleName });
    };

    assignRole(creatorUser.id, 'ATTENDEE');
    assignRole(memberUser.id, 'ATTENDEE');
    assignRole(member2User.id, 'ATTENDEE');
    assignRole(outsiderUser.id, 'ATTENDEE');
    assignRole(sponsorUser.id, 'SPONSOR');
    assignRole(adminUser.id, 'ADMIN');

    // Populate parent event
    mockEvents.set(parentEventId, parentEvent);

    const mockPrisma = {
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue(true),

      $queryRaw: jest.fn().mockImplementation(async (sqlObj: any) => {
        const query = (sqlObj?.strings || []).join(' ');
        if (query.includes('FROM communities') && query.includes('FOR UPDATE')) {
          const commId = sqlObj.values[0];
          const comm = mockCommunities.get(commId);
          if (!comm || comm.deletedAt !== null) return [];
          return [
            {
              id: comm.id,
              status: comm.status,
              visibility: comm.visibility,
              member_capacity: comm.memberCapacity,
              member_count: comm.memberCount,
            },
          ];
        }
        if (query.includes('FROM community_meetups') && query.includes('FOR UPDATE')) {
          const meetupId = sqlObj.values[0];
          const m = mockCommunityMeetups.get(meetupId);
          if (!m || m.deletedAt !== null) return [];
          return [
            {
              id: m.id,
              community_id: m.communityId,
              event_id: m.eventId,
              created_by_id: m.createdById,
              title: m.title,
              description: m.description,
              starts_at: m.startsAt,
              ends_at: m.endsAt,
              location: m.location,
              map_url: m.mapUrl,
              participant_limit: m.participantLimit,
              participant_count: m.participantCount,
              is_pinned: m.isPinned,
              status: m.status,
              deleted_at: m.deletedAt,
              created_at: m.createdAt,
              updated_at: m.updatedAt,
            },
          ];
        }
        return [];
      }),

      $transaction: jest.fn().mockImplementation(async (callback: any) => callback(mockPrisma)),

      role: {
        findUnique: jest.fn().mockImplementation(({ where }) => mockRoles.get(where.name) || null),
      },

      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
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
          const u = mockUsers.get(where.id);
          return u ? { id: u.id, email: u.email } : null;
        }),
      },

      event: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const ev = mockEvents.get(where.id);
          if (!ev || (where.deletedAt === null && ev.deletedAt !== null)) return null;
          return ev;
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => mockEvents.get(where.id) || null),
      },

      community: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = uuidv4();
          const entity = {
            id,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
          };
          mockCommunities.set(id, entity);
          return entity;
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const comm = mockCommunities.get(where.id);
          if (!comm) return null;
          if (where.deletedAt === null && comm.deletedAt !== null) return null;
          return comm;
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          const list = Array.from(mockCommunities.values()).filter((c) => {
            if (where.deletedAt === null && c.deletedAt !== null) return false;
            if (where.eventId && c.eventId !== where.eventId) return false;
            if (where.status && c.status !== where.status) return false;
            return true;
          });
          return list.map((c) => ({
            ...c,
            creator: mockUsers.get(c.createdById),
            members: [],
          }));
        }),
        count: jest.fn().mockImplementation(() => mockCommunities.size),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const comm = mockCommunities.get(where.id);
          if (!comm) return null;
          if (data.memberCount?.increment) {
            comm.memberCount += data.memberCount.increment;
          } else if (data.memberCount?.decrement) {
            comm.memberCount = Math.max(0, comm.memberCount - data.memberCount.decrement);
          }
          Object.assign(comm, { ...data, memberCount: comm.memberCount, updatedAt: new Date() });
          return comm;
        }),
      },

      communityMember: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = uuidv4();
          const entity = {
            id,
            ...data,
            joinedAt: new Date(),
            leftAt: null,
            bannedAt: null,
            bannedBy: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockCommunityMembers.set(`${data.communityId}_${data.userId}`, entity);
          mockCommunityMembers.set(id, entity);
          return entity;
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.communityId_userId) {
            const key = `${where.communityId_userId.communityId}_${where.communityId_userId.userId}`;
            return mockCommunityMembers.get(key) || null;
          }
          if (where.id) {
            return mockCommunityMembers.get(where.id) || null;
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          return Array.from(mockCommunityMembers.values())
            .filter((m) => m.communityId === where.communityId)
            .map((m) => ({ ...m, user: mockUsers.get(m.userId) }));
        }),
        count: jest.fn().mockImplementation(() => mockCommunityMembers.size),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const member = mockCommunityMembers.get(where.id);
          if (!member) return null;
          Object.assign(member, { ...data, updatedAt: new Date() });
          return member;
        }),
      },

      communityPost: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = uuidv4();
          const entity = {
            id,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
          };
          mockCommunityPosts.set(id, entity);
          return entity;
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const p = mockCommunityPosts.get(where.id);
          if (!p) return null;
          if (where.communityId && p.communityId !== where.communityId) return null;
          if (where.deletedAt === null && p.deletedAt !== null) return null;
          return {
            ...p,
            author: mockUsers.get(p.authorId),
            likes: [],
          };
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          return Array.from(mockCommunityPosts.values())
            .filter((p) => {
              if (where.communityId && p.communityId !== where.communityId) return false;
              if (where.deletedAt === null && p.deletedAt !== null) return false;
              if (where.status && p.status !== where.status) return false;
              if (where.isPinned !== undefined && p.isPinned !== where.isPinned) return false;
              return true;
            })
            .map((p) => ({ ...p, author: mockUsers.get(p.authorId), likes: [] }));
        }),
        count: jest.fn().mockImplementation(() => mockCommunityPosts.size),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const p = mockCommunityPosts.get(where.id);
          if (!p) return null;
          if (data.replyCount?.increment) p.replyCount += data.replyCount.increment;
          if (data.replyCount?.decrement)
            p.replyCount = Math.max(0, p.replyCount - data.replyCount.decrement);
          if (data.likeCount?.increment) p.likeCount += data.likeCount.increment;
          if (data.likeCount?.decrement)
            p.likeCount = Math.max(0, p.likeCount - data.likeCount.decrement);
          Object.assign(p, {
            ...data,
            replyCount: p.replyCount,
            likeCount: p.likeCount,
            updatedAt: new Date(),
          });
          return { ...p, author: mockUsers.get(p.authorId) };
        }),
      },

      communityPostReply: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = uuidv4();
          const entity = {
            id,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
          };
          mockCommunityPostReplies.set(id, entity);
          return entity;
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const r = mockCommunityPostReplies.get(where.id);
          if (!r) return null;
          if (where.postId && r.postId !== where.postId) return null;
          if (where.deletedAt === null && r.deletedAt !== null) return null;
          return r;
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          return Array.from(mockCommunityPostReplies.values())
            .filter((r) => r.postId === where.postId && r.deletedAt === null)
            .map((r) => ({ ...r, author: mockUsers.get(r.authorId), likes: [] }));
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const r = mockCommunityPostReplies.get(where.id);
          if (!r) return null;
          if (data.likeCount?.increment) r.likeCount += data.likeCount.increment;
          if (data.likeCount?.decrement)
            r.likeCount = Math.max(0, r.likeCount - data.likeCount.decrement);
          Object.assign(r, { ...data, likeCount: r.likeCount, updatedAt: new Date() });
          return r;
        }),
      },

      communityPostLike: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = uuidv4();
          const entity = { id, ...data, createdAt: new Date() };
          mockCommunityPostLikes.set(`${data.postId}_${data.userId}`, entity);
          return entity;
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const key = `${where.postId_userId.postId}_${where.postId_userId.userId}`;
          return mockCommunityPostLikes.get(key) || null;
        }),
        delete: jest.fn().mockImplementation(({ where }) => {
          for (const [k, v] of mockCommunityPostLikes.entries()) {
            if (v.id === where.id) {
              mockCommunityPostLikes.delete(k);
              return v;
            }
          }
          return null;
        }),
      },

      communityReplyLike: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = uuidv4();
          const entity = { id, ...data, createdAt: new Date() };
          mockCommunityReplyLikes.set(`${data.replyId}_${data.userId}`, entity);
          return entity;
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const key = `${where.replyId_userId.replyId}_${where.replyId_userId.userId}`;
          return mockCommunityReplyLikes.get(key) || null;
        }),
        delete: jest.fn().mockImplementation(({ where }) => {
          for (const [k, v] of mockCommunityReplyLikes.entries()) {
            if (v.id === where.id) {
              mockCommunityReplyLikes.delete(k);
              return v;
            }
          }
          return null;
        }),
      },

      communityMention: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = uuidv4();
          const entity = { id, ...data, createdAt: new Date() };
          mockCommunityMentions.set(id, entity);
          return entity;
        }),
      },

      communityMeetup: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = uuidv4();
          const entity = {
            id,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
          };
          mockCommunityMeetups.set(id, entity);
          return entity;
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const m = mockCommunityMeetups.get(where.id);
          if (!m) return null;
          if (where.communityId && m.communityId !== where.communityId) return null;
          if (where.deletedAt === null && m.deletedAt !== null) return null;
          return {
            ...m,
            creator: mockUsers.get(m.createdById),
            participants: [],
          };
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          return Array.from(mockCommunityMeetups.values())
            .filter((m) => m.communityId === where.communityId && m.deletedAt === null)
            .map((m) => ({
              ...m,
              creator: mockUsers.get(m.createdById),
              participants: [],
            }));
        }),
        count: jest.fn().mockImplementation(() => mockCommunityMeetups.size),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const m = mockCommunityMeetups.get(where.id);
          if (!m) return null;
          if (data.participantCount?.increment) {
            m.participantCount += data.participantCount.increment;
          } else if (data.participantCount?.decrement) {
            m.participantCount = Math.max(0, m.participantCount - data.participantCount.decrement);
          }
          Object.assign(m, {
            ...data,
            participantCount: m.participantCount,
            updatedAt: new Date(),
          });
          return { ...m, creator: mockUsers.get(m.createdById) };
        }),
      },

      communityMeetupParticipant: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = uuidv4();
          const entity = { id, ...data, joinedAt: new Date() };
          mockCommunityMeetupParticipants.set(`${data.meetupId}_${data.userId}`, entity);
          mockCommunityMeetupParticipants.set(id, entity);
          return entity;
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const key = `${where.meetupId_userId.meetupId}_${where.meetupId_userId.userId}`;
          return mockCommunityMeetupParticipants.get(key) || null;
        }),
        delete: jest.fn().mockImplementation(({ where }) => {
          const part = mockCommunityMeetupParticipants.get(where.id);
          if (part) {
            mockCommunityMeetupParticipants.delete(where.id);
            mockCommunityMeetupParticipants.delete(`${part.meetupId}_${part.userId}`);
          }
          return part;
        }),
      },

      communityChatMessage: {
        create: jest.fn().mockImplementation(({ data }) => {
          const id = uuidv4();
          const entity = {
            id,
            ...data,
            createdAt: new Date(),
            sender: mockUsers.get(data.senderId),
          };
          mockCommunityChatMessages.set(id, entity);
          return entity;
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          return Array.from(mockCommunityChatMessages.values())
            .filter((m) => m.communityId === where.communityId)
            .map((m) => ({ ...m, sender: mockUsers.get(m.senderId) }));
        }),
      },

      outboxEvent: {
        create: jest.fn().mockImplementation(({ data }) => {
          const entity = { id: uuidv4(), ...data, createdAt: new Date() };
          mockOutboxEvents.push(entity);
          return entity;
        }),
      },

      auditLog: {
        create: jest.fn().mockImplementation(({ data }) => {
          const entity = { id: uuidv4(), ...data, createdAt: new Date() };
          mockAuditLogs.push(entity);
          return entity;
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
      addJob: jest.fn().mockResolvedValue(undefined),
      addSessionReminder: jest.fn().mockResolvedValue(undefined),
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
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();

    tokenService = app.get<TokenService>(TokenService);

    // Generate real access tokens using TokenService
    const tokens = await Promise.all([
      tokenService.generateTokens(creatorUser.id, creatorUser.email, ['ATTENDEE'], []),
      tokenService.generateTokens(memberUser.id, memberUser.email, ['ATTENDEE'], []),
      tokenService.generateTokens(member2User.id, member2User.email, ['ATTENDEE'], []),
      tokenService.generateTokens(outsiderUser.id, outsiderUser.email, ['ATTENDEE'], []),
      tokenService.generateTokens(sponsorUser.id, sponsorUser.email, ['SPONSOR'], []),
      tokenService.generateTokens(adminUser.id, adminUser.email, ['ADMIN'], []),
    ]);

    creatorToken = tokens[0].accessToken;
    memberToken = tokens[1].accessToken;
    member2Token = tokens[2].accessToken;
    outsiderToken = tokens[3].accessToken;
    sponsorToken = tokens[4].accessToken;
    adminToken = tokens[5].accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // State shared across E2E tests
  let freeCommunityId: string;
  let privateCommunityId: string;
  let samplePostId: string;
  let sampleMeetupId: string;

  // ----------------------------------------------------------------------------
  // SECTION 1: Community Lifecycle & Validation
  // ----------------------------------------------------------------------------
  describe('Community Lifecycle & Access Control', () => {
    it('POST /api/v1/communities - should create a FREE community (capped at 20)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/communities')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          eventId: parentEventId,
          name: 'AI & Robotics Hub',
          bio: 'Frontier AI and hardware jam',
          description: 'A place for developers to collaborate on embodied AI.',
          category: 'Robotics',
          type: CommunityType.FREE,
          visibility: CommunityVisibility.PUBLIC,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.memberCapacity).toBe(20);
      expect(res.body.data.isSponsored).toBe(false);
      expect(res.body.data.isPinned).toBe(false);
      expect(res.body.data.currentUserRole).toBe(CommunityMemberRole.OWNER);

      freeCommunityId = res.body.data.id;
    });

    it('POST /api/v1/communities - should reject SPONSORED community creation by standard user (403)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/communities')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          eventId: parentEventId,
          name: 'Fake Sponsored Hub',
          bio: 'Not a real sponsor',
          description: 'Attempting to create sponsored without permission.',
          category: 'Finance',
          type: CommunityType.SPONSORED,
        })
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('POST /api/v1/communities - should allow SPONSOR to create SPONSORED community with custom capacity', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/communities')
        .set('Authorization', `Bearer ${sponsorToken}`)
        .send({
          eventId: parentEventId,
          name: 'Google Cloud VIP Community',
          bio: 'Official sponsored lounge',
          description: 'Sponsored community with higher capacity and dedicated events.',
          category: 'Cloud',
          type: CommunityType.SPONSORED,
          memberCapacity: 500,
        })
        .expect(201);

      expect(res.body.data.isSponsored).toBe(true);
      expect(res.body.data.isPinned).toBe(true);
      expect(res.body.data.memberCapacity).toBe(500);
    });

    it('POST /api/v1/communities - should validate name and bio length boundaries', async () => {
      // Name > 80 chars
      await request(app.getHttpServer())
        .post('/api/v1/communities')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          eventId: parentEventId,
          name: 'a'.repeat(81),
          bio: 'Valid bio',
          description: 'Valid description here',
          category: 'General',
        })
        .expect(400);

      // Bio > 150 chars
      await request(app.getHttpServer())
        .post('/api/v1/communities')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          eventId: parentEventId,
          name: 'Valid Name',
          bio: 'b'.repeat(151),
          description: 'Valid description here',
          category: 'General',
        })
        .expect(400);
    });

    it('GET /api/v1/communities - public discovery with query filtering', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/communities?eventId=${parentEventId}&category=Robotics`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.data[0].category).toBe('Robotics');
    });

    it('GET /api/v1/communities/:id - should return public community details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/communities/${freeCommunityId}`)
        .expect(200);

      expect(res.body.data.id).toBe(freeCommunityId);
      expect(res.body.data.name).toBe('AI & Robotics Hub');
    });

    it('Anti-enumeration: PRIVATE community returns 404 to unauthenticated or outsider', async () => {
      // Create a private community as creator
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/communities')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          eventId: parentEventId,
          name: 'Secret Founders Club',
          bio: 'Invite-only founders lounge',
          description: 'High-level discussions for confirmed founders only.',
          category: 'Business',
          visibility: CommunityVisibility.PRIVATE,
        })
        .expect(201);

      privateCommunityId = createRes.body.data.id;

      // 1. Unauthenticated request -> 404
      await request(app.getHttpServer())
        .get(`/api/v1/communities/${privateCommunityId}`)
        .expect(404);

      // 2. Outsider user request -> 404 (strictly NOT 403)
      await request(app.getHttpServer())
        .get(`/api/v1/communities/${privateCommunityId}`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(404);

      // 3. Creator can view -> 200
      await request(app.getHttpServer())
        .get(`/api/v1/communities/${privateCommunityId}`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      // 4. Admin can view -> 200
      await request(app.getHttpServer())
        .get(`/api/v1/communities/${privateCommunityId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('PATCH /api/v1/communities/:id - non-owner receives 403, owner can update', async () => {
      // Non-owner
      await request(app.getHttpServer())
        .patch(`/api/v1/communities/${freeCommunityId}`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ name: 'Hacked Name' })
        .expect(403);

      // Owner expands capacity on FREE community beyond 20 -> 403
      await request(app.getHttpServer())
        .patch(`/api/v1/communities/${freeCommunityId}`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ memberCapacity: 50 })
        .expect(403);

      // Owner updates bio
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/communities/${freeCommunityId}`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ bio: 'Updated bio for Robotics Hub' })
        .expect(200);

      expect(res.body.data.bio).toBe('Updated bio for Robotics Hub');
    });
  });

  // ----------------------------------------------------------------------------
  // SECTION 2: Membership Lifecycle & Concurrency Locking
  // ----------------------------------------------------------------------------
  describe('Community Membership & Concurrency Controls', () => {
    it('POST /api/v1/communities/:id/members/join - normal attendee joins', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/members/join`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe(CommunityMemberRole.MEMBER);
      expect(res.body.data.status).toBe(CommunityMemberStatus.ACTIVE);
    });

    it('POST /api/v1/communities/:id/members/join - already active member receives 409 Conflict', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/members/join`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(409);
    });

    it('POST /api/v1/communities/:id/members/leave - member leaves community', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/members/leave`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('POST /api/v1/communities/:id/members/join - user who LEFT can re-join (reactivates record)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/members/join`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.data.status).toBe(CommunityMemberStatus.ACTIVE);
    });

    it('POST /api/v1/communities/:id/members/leave - OWNER leaving is rejected with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/members/leave`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(400);
    });

    it('Capacity constraint: rejects join when community reaches capacity (409 Conflict)', async () => {
      // Simulate community at capacity
      const comm = mockCommunities.get(freeCommunityId);
      comm.memberCount = 20;
      comm.memberCapacity = 20;

      await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/members/join`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(409);

      // Restore memberCount
      comm.memberCount = 2;
    });

    it('PATCH /api/v1/communities/:id/members/:userId/role - Owner assigns SPEAKER and MODERATOR roles', async () => {
      // 1. Non-owner receives 403
      await request(app.getHttpServer())
        .patch(`/api/v1/communities/${freeCommunityId}/members/${memberUser.id}/role`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ role: CommunityMemberRole.SPEAKER })
        .expect(403);

      // 2. Owner promotes member to SPEAKER
      const resSpeaker = await request(app.getHttpServer())
        .patch(`/api/v1/communities/${freeCommunityId}/members/${memberUser.id}/role`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ role: CommunityMemberRole.SPEAKER })
        .expect(200);

      expect(resSpeaker.body.data.role).toBe(CommunityMemberRole.SPEAKER);

      // 3. Promote member to MODERATOR
      const resMod = await request(app.getHttpServer())
        .patch(`/api/v1/communities/${freeCommunityId}/members/${memberUser.id}/role`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ role: CommunityMemberRole.MODERATOR })
        .expect(200);

      expect(resMod.body.data.role).toBe(CommunityMemberRole.MODERATOR);
    });

    it('POST /api/v1/communities/:id/members/:userId/ban - Moderation ban and unban', async () => {
      // Member 2 joins
      await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/members/join`)
        .set('Authorization', `Bearer ${member2Token}`)
        .expect(200);

      // Moderator (memberUser) attempts to ban OWNER -> 403 Forbidden
      await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/members/${creatorUser.id}/ban`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);

      // Moderator bans regular member (member2User) -> 200 OK
      const banRes = await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/members/${member2User.id}/ban`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(banRes.body.success).toBe(true);

      // Banned member attempting to join -> 409 Conflict
      await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/members/join`)
        .set('Authorization', `Bearer ${member2Token}`)
        .expect(409);

      // Unban member2User -> 200 OK
      const unbanRes = await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/members/${member2User.id}/unban`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(unbanRes.body.success).toBe(true);
    });
  });

  // ----------------------------------------------------------------------------
  // SECTION 3: Community Posts, Threaded Replies, Likes & Mentions
  // ----------------------------------------------------------------------------
  describe('Posts, Replies, Likes & Social Engagement', () => {
    it('POST /api/v1/communities/:id/posts - active member creates post', async () => {
      // Non-member receives 403
      await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/posts`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ content: 'I am not a member yet!' })
        .expect(403);

      // Active member creates post with mention
      const res = await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/posts`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          content:
            'Excited about the humanoid robotics demo at 3 PM today! What are your thoughts?',
          mentionedUserIds: [creatorUser.id],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.content).toContain('humanoid robotics');
      expect(res.body.data.isPinned).toBe(false);

      samplePostId = res.body.data.id;
    });

    it('POST /api/v1/communities/:id/posts/:postId/pin - moderator pins post', async () => {
      // Non-moderator receives 403
      await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/posts/${samplePostId}/pin`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(403);

      // Moderator pins post
      const res = await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/posts/${samplePostId}/pin`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.data.isPinned).toBe(true);
    });

    it('POST /api/v1/communities/:id/posts/:postId/replies - create threaded reply', async () => {
      // Top level reply
      const replyRes = await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/posts/${samplePostId}/replies`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          content: 'Agreed! The motor torque specifications are groundbreaking.',
        })
        .expect(201);

      expect(replyRes.body.data.id).toBeDefined();
      const parentReplyId = replyRes.body.data.id;

      // Nested threaded reply
      const childRes = await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/posts/${samplePostId}/replies`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          content: 'And the battery density doubled compared to previous generation.',
          parentReplyId,
        })
        .expect(201);

      expect(childRes.body.data.parentReplyId).toBe(parentReplyId);

      // Verify threaded hierarchy in GET
      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/communities/${freeCommunityId}/posts/${samplePostId}/replies`)
        .expect(200);

      expect(listRes.body.data.length).toBe(1);
      expect(listRes.body.data[0].childReplies.length).toBe(1);
      expect(listRes.body.data[0].childReplies[0].content).toContain('battery density');
    });

    it('POST /api/v1/communities/:id/posts/:postId/like - toggle post like', async () => {
      // Like
      const likeRes = await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/posts/${samplePostId}/like`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(likeRes.body.data.liked).toBe(true);
      expect(likeRes.body.data.likeCount).toBe(1);

      // Unlike
      const unlikeRes = await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/posts/${samplePostId}/like`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(unlikeRes.body.data.liked).toBe(false);
      expect(unlikeRes.body.data.likeCount).toBe(0);
    });
  });

  // ----------------------------------------------------------------------------
  // SECTION 4: Mini Events / Meetups (الحدث داخل التجمع)
  // ----------------------------------------------------------------------------
  describe('Community Meetups (Mini Events)', () => {
    it('POST /api/v1/communities/:id/meetups - active member creates meetup', async () => {
      const meetupStartsAt = new Date(parentEvent.startsAt.getTime() + 3600000).toISOString();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/meetups`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: 'Robotics Founders Coffee Gathering',
          description: 'Casual networking and hardware teardown session at Hall B.',
          startsAt: meetupStartsAt,
          location: 'Hall B - Coffee Corner',
          participantLimit: 5,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.isPinned).toBe(true); // Auto-pinned in community
      expect(res.body.data.participantCount).toBe(1); // Creator auto-participates

      sampleMeetupId = res.body.data.id;
    });

    it('POST /api/v1/communities/:id/meetups - rejects meetup with startsAt outside event window (400)', async () => {
      const farFutureDate = new Date(Date.now() + 86400000 * 30).toISOString();

      await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/meetups`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: 'Far Future Gathering',
          description: 'Meetup too far after the event',
          startsAt: farFutureDate,
          location: 'Anywhere',
        })
        .expect(400);
    });

    it('POST /api/v1/communities/:id/meetups/:meetupId/join - member joins meetup', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/meetups/${sampleMeetupId}/join`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(res.body.data.participantCount).toBe(2);
    });

    it('POST /api/v1/communities/:id/meetups/:meetupId/join - duplicate join returns 409 Conflict', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/meetups/${sampleMeetupId}/join`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(409);
    });

    it('Capacity constraint: rejects meetup join when participantLimit reached (409 Conflict)', async () => {
      const meetup = mockCommunityMeetups.get(sampleMeetupId);
      meetup.participantCount = 5;
      meetup.participantLimit = 5;

      // member2 joins community first
      await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/members/join`)
        .set('Authorization', `Bearer ${member2Token}`)
        .expect(200);

      // Attempt to join full meetup
      await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/meetups/${sampleMeetupId}/join`)
        .set('Authorization', `Bearer ${member2Token}`)
        .expect(409);

      // Restore participantCount
      meetup.participantCount = 2;
    });

    it('POST /api/v1/communities/:id/meetups/:meetupId/leave - participant leaves meetup', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/meetups/${sampleMeetupId}/leave`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('POST /api/v1/communities/:id/meetups/:meetupId/cancel - creator cancels meetup', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/meetups/${sampleMeetupId}/cancel`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ----------------------------------------------------------------------------
  // SECTION 5: Community Chat
  // ----------------------------------------------------------------------------
  describe('Community Real-time Chat Integration', () => {
    it('POST /api/v1/communities/:id/chat/messages - active member sends message', async () => {
      // Non-member receives 403
      await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/chat/messages`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ content: 'I should not be able to chat' })
        .expect(403);

      // Member sends message
      const res = await request(app.getHttpServer())
        .post(`/api/v1/communities/${freeCommunityId}/chat/messages`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ content: 'Hello everyone in the AI Hub! Welcome!' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.content).toBe('Hello everyone in the AI Hub! Welcome!');
      expect(res.body.data.sender.role).toBe(CommunityMemberRole.OWNER);
    });

    it('GET /api/v1/communities/:id/chat/messages - fetches recent message history', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/communities/${freeCommunityId}/chat/messages`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].content).toContain('Hello everyone');
    });
  });

  // ----------------------------------------------------------------------------
  // SECTION 6: Community Archival & Deletion
  // ----------------------------------------------------------------------------
  describe('Community Deletion / Archival', () => {
    it('DELETE /api/v1/communities/:id - owner archives community', async () => {
      // Non-owner receives 403
      await request(app.getHttpServer())
        .delete(`/api/v1/communities/${freeCommunityId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);

      // Owner archives community
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/communities/${freeCommunityId}`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });
});
