import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHealthy(key = 'database'): Promise<HealthIndicatorResult> {
    const isConnected = await this.prisma.ping();
    const result = this.getStatus(key, isConnected);

    if (isConnected) {
      return result;
    }
    throw new HealthCheckError('PostgreSQL health check failed', result);
  }
}
