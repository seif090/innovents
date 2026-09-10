import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma, OutboxStatus } from '@prisma/client';

export interface CreateOutboxEventParams {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Enqueues an outbox event within an optional Prisma transaction client
   */
  async enqueue(params: CreateOutboxEventParams, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx || this.prisma;
    try {
      await client.outboxEvent.create({
        data: {
          eventType: params.eventType,
          aggregateType: params.aggregateType,
          aggregateId: params.aggregateId,
          payload: params.payload as Prisma.InputJsonValue,
          status: OutboxStatus.PENDING,
        },
      });
      this.logger.debug(
        `Outbox event created: ${params.eventType} for ${params.aggregateType}:${params.aggregateId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to persist outbox event: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
