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
  DevicePlatform,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from '@prisma/client';

describe('Notifications & User Communication Platform End-to-End Suite (e2e)', () => {
  jest.setTimeout(45000);
  let app: INestApplication;
  let tokenService: TokenService;

  // Hermetic in-memory store
  type MockEntity = any;
  const mockUsers = new Map<string, MockEntity>();
  const mockRoles = new Map<string, MockEntity>([
    ['ATTENDEE', { id: uuidv4(), name: 'ATTENDEE', rolePermissions: [] }],
    ['ADMIN', { id: uuidv4(), name: 'ADMIN', rolePermissions: [] }],
  ]);
  const mockUserRoles = new Map<string, MockEntity>();
  const mockNotifications = new Map<string, MockEntity>();
  const mockPreferences = new Map<string, MockEntity>();
  const mockDevices = new Map<string, MockEntity>();

  // Test users
  const user1 = {
    id: uuidv4(),
    email: 'user1@innovent.app',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
  };
  const user2 = {
    id: uuidv4(),
    email: 'user2@innovent.app',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
  };

  let token1: string;
  let token2: string;

  beforeAll(async () => {
    [user1, user2].forEach((u) => mockUsers.set(u.id, u));

    const assignRole = (userId: string, roleName: string) => {
      const id = uuidv4();
      mockUserRoles.set(id, { id, userId, roleId: mockRoles.get(roleName)!.id, roleName });
    };

    assignRole(user1.id, 'ATTENDEE');
    assignRole(user2.id, 'ATTENDEE');

    const mockPrisma = {
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue(true),

      user: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id) return mockUsers.get(where.id) || null;
          if (where.email)
            return Array.from(mockUsers.values()).find((u) => u.email === where.email) || null;
          return null;
        }),
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
      role: {
        findMany: jest.fn().mockImplementation(() => Array.from(mockRoles.values())),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
      },

      userDevice: {
        upsert: jest.fn().mockImplementation(({ where, update, create }) => {
          let device = Array.from(mockDevices.values()).find(
            (d) => d.tokenHash === where.tokenHash,
          );
          if (device) {
            Object.assign(device, update, { updatedAt: new Date() });
          } else {
            device = {
              id: uuidv4(),
              ...create,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            mockDevices.set(device.id, device);
          }
          return device;
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return mockDevices.get(where.id) || null;
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          return Array.from(mockDevices.values()).filter((d) => {
            if (where.userId && d.userId !== where.userId) return false;
            if (where.isActive !== undefined && d.isActive !== where.isActive) return false;
            return true;
          });
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const device = mockDevices.get(where.id);
          if (!device) return null;
          Object.assign(device, data, { updatedAt: new Date() });
          return device;
        }),
      },

      notificationPreference: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const target = where.userId_type_channel;
          if (!target) return null;
          return (
            Array.from(mockPreferences.values()).find(
              (p) =>
                p.userId === target.userId &&
                p.type === target.type &&
                p.channel === target.channel,
            ) || null
          );
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          return Array.from(mockPreferences.values()).filter((p) => p.userId === where.userId);
        }),
        upsert: jest.fn().mockImplementation(({ where, update, create }) => {
          const target = where.userId_type_channel;
          let pref = Array.from(mockPreferences.values()).find(
            (p) =>
              p.userId === target.userId && p.type === target.type && p.channel === target.channel,
          );
          if (pref) {
            Object.assign(pref, update, { updatedAt: new Date() });
          } else {
            pref = {
              id: uuidv4(),
              ...create,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            mockPreferences.set(pref.id, pref);
          }
          return pref;
        }),
      },

      notification: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return mockNotifications.get(where.id) || null;
        }),
        findMany: jest.fn().mockImplementation(({ where, skip, take }) => {
          const filtered = Array.from(mockNotifications.values()).filter((n) => {
            if (where.userId && n.userId !== where.userId) return false;
            if (where.status?.not && n.status === where.status.not) return false;
            if (where.type && n.type !== where.type) return false;
            if (where.channel && n.channel !== where.channel) return false;
            if (where.status && typeof where.status === 'string' && n.status !== where.status)
              return false;
            if (where.readAt?.not !== undefined && n.readAt === null) return false;
            if (where.readAt === null && n.readAt !== null) return false;
            return true;
          });
          const start = skip || 0;
          const end = take ? start + take : undefined;
          return filtered.slice(start, end);
        }),
        count: jest.fn().mockImplementation(({ where }) => {
          return Array.from(mockNotifications.values()).filter((n) => {
            if (where.userId && n.userId !== where.userId) return false;
            if (where.status?.not && n.status === where.status.not) return false;
            if (where.readAt === null && n.readAt !== null) return false;
            return true;
          }).length;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const notif = mockNotifications.get(where.id);
          if (!notif) return null;
          Object.assign(notif, data, { updatedAt: new Date() });
          return notif;
        }),
        updateMany: jest.fn().mockImplementation(({ where, data }) => {
          let count = 0;
          for (const notif of mockNotifications.values()) {
            if (where.userId && notif.userId !== where.userId) continue;
            if (where.readAt === null && notif.readAt !== null) continue;
            if (where.status?.not && notif.status === where.status.not) continue;
            Object.assign(notif, data, { updatedAt: new Date() });
            count++;
          }
          return { count };
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

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createGlobalValidationPipe());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();

    tokenService = moduleFixture.get<TokenService>(TokenService);

    const pair1 = await tokenService.generateTokens(user1.id, user1.email, ['ATTENDEE'], []);
    token1 = pair1.accessToken;

    const pair2 = await tokenService.generateTokens(user2.id, user2.email, ['ATTENDEE'], []);
    token2 = pair2.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Device Registration API (/api/v1/notifications/devices)', () => {
    let registeredDeviceId: string;

    it('POST /devices: should register device token and return masked token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/notifications/devices')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          platform: DevicePlatform.ANDROID,
          token: 'fcm_test_device_token_abcdef1234567890',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.platform).toBe(DevicePlatform.ANDROID);
      expect(res.body.data.maskedToken).toContain('***');
      expect(res.body.data.maskedToken).not.toBe('fcm_test_device_token_abcdef1234567890');
      registeredDeviceId = res.body.data.id;
    });

    it('GET /devices: should return active devices for user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/devices')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe(registeredDeviceId);
    });

    it('DELETE /devices/:id: should prevent IDOR when User 2 attempts to revoke User 1 device', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/notifications/devices/${registeredDeviceId}`)
        .set('Authorization', `Bearer ${token2}`)
        .expect(403);
    });

    it('DELETE /devices/:id: should revoke device when authorized owner calls', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/notifications/devices/${registeredDeviceId}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(204);

      const device = mockDevices.get(registeredDeviceId);
      expect(device.isActive).toBe(false);
    });
  });

  describe('Notification Preferences API (/api/v1/notifications/preferences)', () => {
    it('GET /preferences: should return all effective preferences with isConfigurable flag', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const secPref = res.body.data.find(
        (p: any) => p.type === NotificationType.SECURITY_PASSWORD_RESET,
      );
      expect(secPref).toBeDefined();
      expect(secPref.isConfigurable).toBe(false);
      expect(secPref.isEnabled).toBe(true);
    });

    it('PUT /preferences: should update preference and enforce security override', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          preferences: [
            {
              type: NotificationType.COMMUNITY_POST_MENTION,
              channel: NotificationChannel.PUSH,
              isEnabled: false,
            },
            {
              type: NotificationType.SECURITY_PASSWORD_RESET,
              channel: NotificationChannel.EMAIL,
              isEnabled: false, // Security override must protect this
            },
          ],
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      const mentionPref = res.body.data.find(
        (p: any) =>
          p.type === NotificationType.COMMUNITY_POST_MENTION &&
          p.channel === NotificationChannel.PUSH,
      );
      expect(mentionPref.isEnabled).toBe(false);

      const secPref = res.body.data.find(
        (p: any) =>
          p.type === NotificationType.SECURITY_PASSWORD_RESET &&
          p.channel === NotificationChannel.EMAIL,
      );
      expect(secPref.isEnabled).toBe(true); // Remained enabled!
    });
  });

  describe('Notification Center REST API (/api/v1/notifications)', () => {
    const notif1Id = uuidv4();
    const notif2Id = uuidv4();
    const notifUser2Id = uuidv4();

    beforeAll(() => {
      mockNotifications.set(notif1Id, {
        id: notif1Id,
        userId: user1.id,
        type: NotificationType.SESSION_REMINDER,
        channel: NotificationChannel.IN_APP,
        title: 'Keynote Starts Soon',
        body: 'Your keynote starts in 15 minutes',
        data: { sessionId: uuidv4() },
        status: NotificationStatus.DELIVERED,
        readAt: null,
        deliveredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockNotifications.set(notif2Id, {
        id: notif2Id,
        userId: user1.id,
        type: NotificationType.COMMUNITY_POST_MENTION,
        channel: NotificationChannel.IN_APP,
        title: 'New Mention',
        body: 'Someone mentioned you in a post',
        data: { postId: uuidv4() },
        status: NotificationStatus.DELIVERED,
        readAt: null,
        deliveredAt: new Date(),
        createdAt: new Date(Date.now() - 1000),
        updatedAt: new Date(),
      });

      mockNotifications.set(notifUser2Id, {
        id: notifUser2Id,
        userId: user2.id,
        type: NotificationType.COMMUNITY_POST_MENTION,
        channel: NotificationChannel.IN_APP,
        title: 'User 2 Mention',
        body: 'Private notification for User 2',
        data: null,
        status: NotificationStatus.DELIVERED,
        readAt: null,
        deliveredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('GET /notifications: should list user notifications with pagination', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications?page=1&pageSize=10')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data.length).toBe(2);
      expect(res.body.data.total).toBe(2);
    });

    it('GET /notifications/unread-count: should return correct unread count', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.unreadCount).toBe(2);
    });

    it('PATCH /notifications/:id/read: should mark single notification as read', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${notif1Id}/read`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.readAt).toBeDefined();
    });

    it('PATCH /notifications/:id/read: should prevent IDOR when User 2 accesses User 1 notification', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${notif2Id}/read`)
        .set('Authorization', `Bearer ${token2}`)
        .expect(403);
    });

    it('PATCH /notifications/read-all: should mark all unread notifications as read', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      const countRes = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(countRes.body.data.unreadCount).toBe(0);
    });

    it('DELETE /notifications/:id: should prevent IDOR when User 1 deletes User 2 notification', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/notifications/${notifUser2Id}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(403);
    });

    it('DELETE /notifications/:id: should cancel notification when authorized owner calls', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/notifications/${notif1Id}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(204);

      const notif = mockNotifications.get(notif1Id);
      expect(notif.status).toBe(NotificationStatus.CANCELLED);
    });
  });
});
