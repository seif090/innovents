import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { createGlobalValidationPipe } from '../src/common/pipes/validation.pipe';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/infrastructure/cache/redis.service';
import { QueueService } from '../src/infrastructure/queue/queue.service';
import { PasswordService } from '../src/modules/auth/services/password.service';
import { AccountStatus, OtpPurpose } from '@prisma/client';

describe('Auth & Identity End-to-End Suite (e2e)', () => {
  jest.setTimeout(30000);
  let app: INestApplication;

  // In-memory mock database state for hermetic execution
  const mockUsers = new Map<string, Record<string, unknown>>();
  const mockUserRoles = new Map<string, Record<string, unknown>>();
  const mockOtpChallenges = new Map<string, Record<string, unknown>>();
  const mockRefreshTokens = new Map<string, Record<string, unknown>>();
  const mockOutboxEvents: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const mockRoles = new Map<string, Record<string, unknown>>([
    ['ATTENDEE', { id: 'role-att-id', name: 'ATTENDEE', rolePermissions: [] }],
    ['SPONSOR', { id: 'role-spn-id', name: 'SPONSOR', rolePermissions: [] }],
    ['ADMIN', { id: 'role-adm-id', name: 'ADMIN', rolePermissions: [] }],
  ]);

  beforeAll(async () => {
    const mockPrisma = {
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue(true),
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(mockPrisma);
      }),
      role: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return mockRoles.get(where.name) || null;
        }),
      },
      user: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          for (const u of mockUsers.values()) {
            if (where.email && u.email !== where.email) continue;
            if (where.id && u.id !== where.id) continue;
            if (where.deletedAt === null && u.deletedAt !== null) continue;

            const roles = Array.from(mockUserRoles.values())
              .filter((ur) => ur.userId === u.id)
              .map((ur) => ({
                role: mockRoles.get(ur.roleName as string),
              }));
            return { ...u, userRoles: roles };
          }
          return null;
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          for (const u of mockUsers.values()) {
            if (where.email && u.email !== where.email) continue;
            if (where.id && u.id !== where.id) continue;

            const roles = Array.from(mockUserRoles.values())
              .filter((ur) => ur.userId === u.id)
              .map((ur) => ({
                role: mockRoles.get(ur.roleName as string),
              }));
            return { ...u, userRoles: roles };
          }
          return null;
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const user = {
            id: `user-${Date.now()}-${Math.random()}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            emailVerifiedAt: null,
            deletedAt: null,
            lastLoginAt: null,
          };
          mockUsers.set(user.id, user);
          return user;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const user = mockUsers.get(where.id);
          if (!user) throw new Error('User not found');
          Object.assign(user, data);
          return user;
        }),
      },
      userRole: {
        create: jest.fn().mockImplementation(({ data }) => {
          const ur = {
            id: `ur-${Date.now()}-${Math.random()}`,
            ...data,
            roleName:
              data.roleId === 'role-spn-id'
                ? 'SPONSOR'
                : data.roleId === 'role-adm-id'
                  ? 'ADMIN'
                  : 'ATTENDEE',
          };
          mockUserRoles.set(ur.id, ur);
          return ur;
        }),
      },
      otpChallenge: {
        create: jest.fn().mockImplementation(({ data }) => {
          const challenge = {
            id: `otp-${Date.now()}-${Math.random()}`,
            ...data,
            attempts: 0,
            consumedAt: null,
            createdAt: new Date(),
          };
          mockOtpChallenges.set(challenge.id, challenge);
          return challenge;
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          for (const c of Array.from(mockOtpChallenges.values()).reverse()) {
            if (
              c.identifier === where.identifier &&
              c.purpose === where.purpose &&
              c.consumedAt === null
            ) {
              return c;
            }
          }
          return null;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const c = mockOtpChallenges.get(where.id);
          if (c) Object.assign(c, data);
          return c;
        }),
        updateMany: jest.fn().mockImplementation(({ where, data }) => {
          let count = 0;
          for (const c of mockOtpChallenges.values()) {
            if (
              c.identifier === where.identifier &&
              c.purpose === where.purpose &&
              c.consumedAt === null
            ) {
              Object.assign(c, data);
              count++;
            }
          }
          return { count };
        }),
      },
      refreshToken: {
        create: jest.fn().mockImplementation(({ data }) => {
          const token = {
            id: `token-${Date.now()}-${Math.random()}`,
            ...data,
            revokedAt: null,
            createdAt: new Date(),
          };
          mockRefreshTokens.set(token.tokenHash, token);
          return token;
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const token = mockRefreshTokens.get(where.tokenHash);
          if (!token) return null;
          const user = mockUsers.get(token.userId as string);
          const roles = Array.from(mockUserRoles.values())
            .filter((ur) => ur.userId === token.userId)
            .map((ur) => ({
              role: mockRoles.get(ur.roleName as string),
            }));
          return {
            ...token,
            user: {
              ...user,
              userRoles: roles,
            },
          };
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          for (const t of mockRefreshTokens.values()) {
            if (t.id === where.id) {
              Object.assign(t, data);
              return t;
            }
          }
          return null;
        }),
        updateMany: jest.fn().mockImplementation(({ where, data }) => {
          let count = 0;
          for (const t of mockRefreshTokens.values()) {
            if (
              (where.familyId && t.familyId === where.familyId) ||
              (where.userId && t.userId === where.userId)
            ) {
              Object.assign(t, data);
              count++;
            }
          }
          return { count };
        }),
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
        addJob: jest.fn().mockResolvedValue(undefined),
        getQueue: jest.fn().mockReturnValue(undefined),
      })
      .overrideProvider(PasswordService)
      .useValue({
        hash: jest.fn().mockImplementation((pwd: string) => bcrypt.hash(pwd, 4)),
        compare: jest
          .fn()
          .mockImplementation((pwd: string, hash: string) => bcrypt.compare(pwd, hash)),
        validateStrength: jest.fn().mockReturnValue(true),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', {
      exclude: ['health', 'health/live', 'health/ready'],
    });
    app.useGlobalPipes(createGlobalValidationPipe());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const testEmail = 'e2e-attendee@innovent.app';
  const testPassword = 'Password123!';
  let capturedOtpCode = '';
  let accessToken = '';
  let refreshToken = '';
  let rotatedRefreshToken = '';

  it('Step 1: POST /api/v1/auth/register should create user and dispatch OTP code', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: testEmail,
        password: testPassword,
        phone: '+966500000001',
        role: 'ATTENDEE',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(testEmail);

    // Retrieve generated OTP directly from mock outbox event payload
    const emailEvent = mockOutboxEvents.find(
      (e) =>
        e.eventType === 'EMAIL_VERIFICATION_REQUESTED' &&
        (e.payload as Record<string, unknown>)?.to === testEmail,
    );
    expect(emailEvent).toBeDefined();
    capturedOtpCode = (emailEvent?.payload as Record<string, unknown>)?.code as string;
    expect(capturedOtpCode).toHaveLength(6);
  });

  it('Step 2: POST /api/v1/auth/login should fail before email verification', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      })
      .expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('verify your email');
  });

  it('Step 3: POST /api/v1/auth/otp/verify should verify email and activate Attendee', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({
        email: testEmail,
        code: capturedOtpCode,
        purpose: 'EMAIL_VERIFICATION',
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.success).toBe(true);
  });

  it('Step 4: POST /api/v1/auth/login should succeed and return access + refresh tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens.accessToken).toBeDefined();
    expect(res.body.data.tokens.refreshToken).toBeDefined();

    accessToken = res.body.data.tokens.accessToken;
    refreshToken = res.body.data.tokens.refreshToken;
  });

  it('Step 5: GET /api/v1/users/me should return user profile with valid Bearer token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(testEmail);
    expect(res.body.data.status).toBe(AccountStatus.ACTIVE);
    expect(res.body.data.roles).toContain('ATTENDEE');
  });

  it('Step 6: PATCH /api/v1/users/me should update user phone', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ phone: '+966500000099' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.phone).toBe('+966500000099');
  });

  it('Step 7: POST /api/v1/auth/refresh should rotate the refresh token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken,
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.refreshToken).not.toBe(refreshToken);

    rotatedRefreshToken = res.body.data.refreshToken;
  });

  it('Step 8: Replay of OLD refresh token should trigger reuse detection and revoke family', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken,
      })
      .expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('reuse detected');
  });

  it('Step 9: Rotated token from revoked family should now also be rejected', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken: rotatedRefreshToken,
      })
      .expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('reuse detected');
  });

  it('Step 10: Password reset flow should issue OTP, update password, and revoke sessions', async () => {
    // 10a: Request password reset
    const reqRes = await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/request')
      .send({ email: testEmail })
      .expect(200);

    expect(reqRes.body.success).toBe(true);

    // Grab reset OTP from outbox
    const resetOtp = Array.from(mockOtpChallenges.values())
      .reverse()
      .find((c) => c.identifier === testEmail && c.purpose === OtpPurpose.PASSWORD_RESET);
    expect(resetOtp).toBeDefined();

    // Find the matching code from outbox events
    const resetEvent = mockOutboxEvents
      .slice()
      .reverse()
      .find(
        (e) =>
          (e.payload as Record<string, unknown>)?.to === testEmail &&
          (e.payload as Record<string, unknown>)?.purpose === 'PASSWORD_RESET',
      );
    const resetCode = (resetEvent?.payload as Record<string, unknown>)?.code as string;
    expect(resetCode).toHaveLength(6);

    // 10b: Confirm password reset
    const newPassword = 'NewPassword456!';
    const confirmRes = await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({
        email: testEmail,
        code: resetCode,
        newPassword,
      })
      .expect(200);

    expect(confirmRes.body.success).toBe(true);

    // 10c: Old password should now fail
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      })
      .expect(401);

    // 10d: New password should succeed
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: newPassword,
      })
      .expect(200);

    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.data.tokens.accessToken).toBeDefined();
  });

  it('Step 11: POST /api/v1/auth/logout should revoke session', async () => {
    // Log in to get fresh tokens
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: 'NewPassword456!',
      })
      .expect(200);

    const activeRefreshToken = loginRes.body.data.tokens.refreshToken;

    // Logout
    const logoutRes = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: activeRefreshToken })
      .expect(200);

    expect(logoutRes.body.success).toBe(true);

    // Refresh attempt should now fail
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: activeRefreshToken })
      .expect(401);
  });

  it('Step 12: Business role (SPONSOR) remains PENDING upon OTP verify and cannot login', async () => {
    const sponsorEmail = 'sponsor-pending@innovent.app';

    // Register SPONSOR
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: sponsorEmail,
        password: 'SponsorPass123!',
        role: 'SPONSOR',
      })
      .expect(201);

    // Find OTP
    const sponsorEvent = mockOutboxEvents
      .slice()
      .reverse()
      .find((e) => (e.payload as Record<string, unknown>)?.to === sponsorEmail);
    const sponsorOtp = (sponsorEvent?.payload as Record<string, unknown>)?.code as string;

    // Verify OTP
    await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({
        email: sponsorEmail,
        code: sponsorOtp,
        purpose: 'EMAIL_VERIFICATION',
      })
      .expect(200);

    // Login must fail with 403 Forbidden because status is still PENDING review
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: sponsorEmail,
        password: 'SponsorPass123!',
      })
      .expect(403);

    expect(loginRes.body.success).toBe(false);
    expect(loginRes.body.error.message).toContain('pending administrative review');
  });
});
