import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { createGlobalValidationPipe } from '../src/common/pipes/validation.pipe';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/infrastructure/cache/redis.service';

describe('Health & Global Pipeline (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Mock the external network connections for pure hermetic e2e execution
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn().mockResolvedValue(undefined),
        $disconnect: jest.fn().mockResolvedValue(undefined),
        ping: jest.fn().mockResolvedValue(true),
      })
      .overrideProvider(RedisService)
      .useValue({
        ping: jest.fn().mockResolvedValue(true),
        getClient: jest.fn().mockReturnValue(null),
      })
      .compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(createGlobalValidationPipe());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live should return 200 and include x-request-id', async () => {
    const response = await request(app.getHttpServer()).get('/health/live').expect(200);

    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.body).toHaveProperty('status', 'up');
    expect(response.body).toHaveProperty('timestamp');
  });

  it('GET /health/ready should return 200 with readiness details', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready').expect(200);

    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.body.status).toBe('ok');
    expect(response.body.info).toHaveProperty('database');
    expect(response.body.info).toHaveProperty('redis');
  });

  it('GET /api/v1/non-existent-route should return standardized 404 error envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/non-existent-route')
      .expect(404);

    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'NOT_FOUND',
        }),
        meta: expect.objectContaining({
          requestId: expect.any(String),
          timestamp: expect.any(String),
        }),
      }),
    );
  });
});
