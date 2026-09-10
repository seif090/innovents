import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './indicators/prisma-health.indicator';
import { RedisHealthIndicator } from './indicators/redis-health.indicator';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: HealthCheckService;
  let prismaIndicator: PrismaHealthIndicator;
  let redisIndicator: RedisHealthIndicator;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: {
            check: jest.fn().mockImplementation((indicators) => {
              return Promise.all(indicators.map((fn: () => unknown) => fn())).then(() => ({
                status: 'ok',
                info: { database: { status: 'up' }, redis: { status: 'up' } },
                error: {},
                details: { database: { status: 'up' }, redis: { status: 'up' } },
              }));
            }),
          },
        },
        {
          provide: PrismaHealthIndicator,
          useValue: {
            isHealthy: jest.fn().mockResolvedValue({ database: { status: 'up' } }),
          },
        },
        {
          provide: RedisHealthIndicator,
          useValue: {
            isHealthy: jest.fn().mockResolvedValue({ redis: { status: 'up' } }),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthService = module.get<HealthCheckService>(HealthCheckService);
    prismaIndicator = module.get<PrismaHealthIndicator>(PrismaHealthIndicator);
    redisIndicator = module.get<RedisHealthIndicator>(RedisHealthIndicator);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('live', () => {
    it('should return up status and valid timestamp', () => {
      const result = controller.live();
      expect(result.status).toBe('up');
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).not.toBeNaN();
    });
  });

  describe('check', () => {
    it('should execute both prisma and redis indicators', async () => {
      const result = await controller.check();
      expect(result.status).toBe('ok');
      expect(healthService.check).toHaveBeenCalled();
      expect(prismaIndicator.isHealthy).toHaveBeenCalledWith('database');
      expect(redisIndicator.isHealthy).toHaveBeenCalledWith('redis');
    });
  });

  describe('ready', () => {
    it('should verify readiness across database and redis', async () => {
      const result = await controller.ready();
      expect(result.status).toBe('ok');
      expect(healthService.check).toHaveBeenCalled();
    });
  });
});
