/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/infrastructure/cache/redis.service';
import { QueueService } from '../src/infrastructure/queue/queue.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { NotificationGateway } from '../src/modules/notifications/gateways/notification.gateway';
import { AccountStatus } from '@prisma/client';

describe('Notifications Realtime WebSocket E2E Suite (e2e)', () => {
  jest.setTimeout(30000);
  let app: INestApplication;
  let tokenService: TokenService;
  let gateway: NotificationGateway;
  let socketUrl: string;

  const mockUsers = new Map<string, any>();
  const mockRoles = new Map<string, any>([
    ['ATTENDEE', { id: uuidv4(), name: 'ATTENDEE', rolePermissions: [] }],
  ]);
  const mockUserRoles = new Map<string, any>();

  const activeUser1 = {
    id: uuidv4(),
    email: 'ws_user1@innovent.app',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
  };
  const activeUser2 = {
    id: uuidv4(),
    email: 'ws_user2@innovent.app',
    status: AccountStatus.ACTIVE,
    deletedAt: null,
  };
  const suspendedUser = {
    id: uuidv4(),
    email: 'ws_suspended@innovent.app',
    status: AccountStatus.SUSPENDED,
    deletedAt: null,
  };

  let token1: string;
  let token2: string;
  let suspendedToken: string;

  beforeAll(async () => {
    [activeUser1, activeUser2, suspendedUser].forEach((u) => mockUsers.set(u.id, u));

    const assignRole = (userId: string, roleName: string) => {
      const id = uuidv4();
      mockUserRoles.set(id, { id, userId, roleId: mockRoles.get(roleName)!.id, roleName });
    };

    assignRole(activeUser1.id, 'ATTENDEE');
    assignRole(activeUser2.id, 'ATTENDEE');
    assignRole(suspendedUser.id, 'ATTENDEE');

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
            .map((ur) => ({ ...ur, role: mockRoles.get(ur.roleName) }));
        }),
      },
      role: {
        findMany: jest.fn().mockImplementation(() => Array.from(mockRoles.values())),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const mockRedis = {
      getClient: jest.fn().mockReturnValue({
        set: jest.fn().mockResolvedValue('OK'),
        get: jest.fn().mockResolvedValue(null),
        del: jest.fn().mockResolvedValue(1),
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
    await app.listen(0); // Listen on random available port

    tokenService = moduleFixture.get<TokenService>(TokenService);
    gateway = moduleFixture.get<NotificationGateway>(NotificationGateway);

    const server: any = app.getHttpServer();
    const address = server.address();
    const port = typeof address === 'string' ? 3000 : address.port;
    socketUrl = `http://127.0.0.1:${port}/notifications`;

    const p1 = await tokenService.generateTokens(
      activeUser1.id,
      activeUser1.email,
      ['ATTENDEE'],
      [],
    );
    token1 = p1.accessToken;

    const p2 = await tokenService.generateTokens(
      activeUser2.id,
      activeUser2.email,
      ['ATTENDEE'],
      [],
    );
    token2 = p2.accessToken;

    const pSuspended = await tokenService.generateTokens(
      suspendedUser.id,
      suspendedUser.email,
      ['ATTENDEE'],
      [],
    );
    suspendedToken = pSuspended.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. should successfully connect an authenticated client with valid JWT handshake', (done) => {
    const client: Socket = io(socketUrl, {
      auth: { token: token1 },
      transports: ['websocket'],
    });

    client.on('connect', () => {
      expect(client.connected).toBe(true);
      client.disconnect();
      done();
    });

    client.on('connect_error', (err) => {
      done(err);
    });
  });

  it('2. should deliver real-time notification to user private room', (done) => {
    const client: Socket = io(socketUrl, {
      auth: { token: token1 },
      transports: ['websocket'],
    });

    const testPayload = {
      id: uuidv4(),
      title: 'Realtime Session Reminder',
      body: 'Starts in 15 minutes',
      type: 'SESSION_REMINDER',
    };

    client.on('connect', () => {
      // Allow socket to complete handshake and join room
      setTimeout(() => {
        gateway.sendToUser(activeUser1.id, 'notification.created', testPayload);
      }, 100);
    });

    client.on('notification.created', (data) => {
      expect(data).toEqual(testPayload);
      client.disconnect();
      done();
    });

    client.on('connect_error', (err) => {
      done(err);
    });
  });

  it('3. should enforce strict cross-user isolation: User 2 must NOT receive User 1 notification', (done) => {
    const client1: Socket = io(socketUrl, {
      auth: { token: token1 },
      transports: ['websocket'],
    });

    const client2: Socket = io(socketUrl, {
      auth: { token: token2 },
      transports: ['websocket'],
    });

    const user1Payload = {
      id: uuidv4(),
      title: 'Private Notification for User 1',
    };

    let client2ReceivedEvent = false;

    client2.on('notification.created', () => {
      client2ReceivedEvent = true;
    });

    let connectedCount = 0;
    const onBothConnected = () => {
      connectedCount++;
      if (connectedCount === 2) {
        setTimeout(() => {
          gateway.sendToUser(activeUser1.id, 'notification.created', user1Payload);

          // Wait 300ms to ensure client 2 does NOT receive it
          setTimeout(() => {
            expect(client2ReceivedEvent).toBe(false);
            client1.disconnect();
            client2.disconnect();
            done();
          }, 300);
        }, 100);
      }
    };

    client1.on('connect', onBothConnected);
    client2.on('connect', onBothConnected);
  });

  it('4. should reject connection with invalid or forged JWT', (done) => {
    const client: Socket = io(socketUrl, {
      auth: { token: 'invalid.jwt.token.signature' },
      transports: ['websocket'],
    });

    client.on('connect', () => {
      // If connected, it should immediately be disconnected by the server
      client.on('disconnect', () => {
        done();
      });
    });

    client.on('connect_error', () => {
      done();
    });

    setTimeout(() => {
      if (!client.connected) {
        done();
      }
    }, 500);
  });

  it('5. should reject connection for suspended or deactivated accounts', (done) => {
    const client: Socket = io(socketUrl, {
      auth: { token: suspendedToken },
      transports: ['websocket'],
    });

    client.on('connect', () => {
      client.on('disconnect', () => {
        done();
      });
    });

    client.on('connect_error', () => {
      done();
    });

    setTimeout(() => {
      if (!client.connected) {
        done();
      }
    }, 500);
  });

  it('6. should handle disconnected clients gracefully without server failure', () => {
    const disconnectedUserId = uuidv4();
    const result = gateway.sendToUser(disconnectedUserId, 'notification.created', {
      title: 'Message to offline user',
    });

    expect(result).toBe(true);
  });
});
