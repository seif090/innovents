import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);
    const password = this.configService.get<string | undefined>('redis.password');

    const options: RedisOptions = {
      host,
      port,
      password: password || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => {
        if (times > 3) {
          return null; // Stop retrying after 3 initial attempts
        }
        return Math.min(times * 100, 1000);
      },
    };

    this.client = new Redis(options);

    this.client.on('connect', () => {
      this.isConnected = true;
      this.logger.log('✅ Connected to Redis successfully');
    });

    this.client.on('ready', () => {
      this.isConnected = true;
    });

    this.client.on('error', (err) => {
      this.isConnected = false;
      this.logger.warn(`⚠️ Redis error: ${err.message}`);
    });

    this.client.on('close', () => {
      this.isConnected = false;
    });

    // Attempt initial connect asynchronously
    this.client.connect().catch((err) => {
      this.logger.warn(
        `⚠️ Failed to connect to Redis on startup: ${err.message}. Health checks will report Redis as down.`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        this.logger.log('🔌 Redis connection closed gracefully');
      } catch {
        this.client.disconnect();
      }
    }
  }

  getClient(): Redis | null {
    return this.client;
  }

  async ping(): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      return false;
    }
    try {
      const res = await this.client.ping();
      return res === 'PONG';
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client || !this.isConnected) return null;
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client || !this.isConnected) return;
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client || !this.isConnected) return;
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client || !this.isConnected) return false;
    const count = await this.client.exists(key);
    return count > 0;
  }
}
