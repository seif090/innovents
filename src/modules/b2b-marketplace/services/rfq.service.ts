import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { QueueService } from '../../../infrastructure/queue/queue.service';
import { QUEUE_NAMES } from '../../../infrastructure/queue/queue.constants';
import {
  AccountStatus,
  Prisma,
  Rfq,
  RfqClarification,
  RfqItem,
  RfqStatus,
  QuotationStatus,
} from '@prisma/client';
import { CreateRfqDto } from '../dto/create-rfq.dto';
import { RfqQueryDto } from '../dto/rfq-query.dto';
import { CreateRfqClarificationDto } from '../dto/rfq-clarification.dto';
import { CancelRfqDto, RejectRfqDto } from '../dto/rfq-action.dto';
import { RfqDetailsResponseDto, RfqListItemDto, PaginatedRfqsDto } from '../dto/rfq-response.dto';

@Injectable()
export class RfqService {
  private readonly logger = new Logger(RfqService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    @Optional() private readonly queueService?: QueueService,
  ) {}

  /**
   * Asserts that a user is active, not deleted, and optionally has a required role
   */
  private async assertActiveUser(userId: string, requiredRole?: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user) {
      throw new NotFoundException('User account not found');
    }

    if (user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException(
        `Account is ${user.status}. Only active accounts can perform this action.`,
      );
    }

    if (requiredRole) {
      const hasRole = user.userRoles.some((ur) => ur.role.name === requiredRole);
      if (!hasRole) {
        throw new ForbiddenException(
          `Only users with role ${requiredRole} can perform this action.`,
        );
      }
    }

    return user;
  }

  /**
   * Creates an RFQ. Can be created directly as SENT or saved as DRAFT.
   */
  async createRfq(
    sponsorId: string,
    dto: CreateRfqDto,
    options: { asDraft?: boolean } = {},
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RfqDetailsResponseDto> {
    await this.assertActiveUser(sponsorId, 'SPONSOR');

    // Assert Vendor exists, is ACTIVE, and has VENDOR role
    const vendor = await this.prisma.user.findFirst({
      where: { id: dto.vendorId, deletedAt: null },
      include: { userRoles: { include: { role: true } } },
    });
    if (!vendor || vendor.status !== AccountStatus.ACTIVE) {
      throw new BadRequestException('Target vendor is not active or does not exist');
    }
    const isVendor = vendor.userRoles.some((ur) => ur.role.name === 'VENDOR');
    if (!isVendor) {
      throw new BadRequestException('Specified recipient does not have the VENDOR role');
    }

    if (sponsorId === dto.vendorId) {
      throw new BadRequestException('Sponsors cannot send RFQs to themselves');
    }

    // Assert Event if provided
    if (dto.eventId) {
      const event = await this.prisma.event.findFirst({
        where: { id: dto.eventId, deletedAt: null },
      });
      if (!event) {
        throw new BadRequestException('Referenced event does not exist');
      }
    }

    // Validate expiration date is in the future
    const expiresAt = new Date(dto.expiresAt);
    if (isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Expiration date must be a valid timestamp in the future');
    }

    // Validate line items
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('RFQ must contain at least one line item');
    }

    // Check referenced vendor services belong to this vendor and are active
    const serviceIds = dto.items
      .map((i) => i.vendorServiceId)
      .filter((id): id is string => Boolean(id));

    if (serviceIds.length > 0) {
      const services = await this.prisma.vendorService.findMany({
        where: {
          id: { in: serviceIds },
          vendorId: dto.vendorId,
          isActive: true,
          deletedAt: null,
        },
      });

      if (services.length !== serviceIds.length) {
        throw new BadRequestException(
          'One or more referenced vendor services do not exist or do not belong to the selected vendor',
        );
      }
    }

    const initialStatus = options.asDraft ? RfqStatus.DRAFT : RfqStatus.SENT;
    const sentAt = initialStatus === RfqStatus.SENT ? new Date() : null;

    // Transactionally create RFQ and Items, plus Outbox if sent
    const rfq = await this.prisma.$transaction(async (tx) => {
      const created = await tx.rfq.create({
        data: {
          sponsorId,
          vendorId: dto.vendorId,
          eventId: dto.eventId || null,
          title: dto.title,
          description: dto.description,
          requirements: dto.requirements || null,
          status: initialStatus,
          expiresAt,
          sentAt,
          items: {
            create: dto.items.map((item) => ({
              vendorServiceId: item.vendorServiceId || null,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit || null,
              targetPrice:
                item.targetPrice !== undefined ? new Prisma.Decimal(item.targetPrice) : null,
              notes: item.notes || null,
            })),
          },
        },
        include: {
          items: true,
          clarifications: true,
        },
      });

      if (initialStatus === RfqStatus.SENT) {
        await this.outboxService.enqueue(
          {
            eventType: 'RFQ_SENT',
            aggregateType: 'rfq',
            aggregateId: created.id,
            payload: {
              rfqId: created.id,
              sponsorId,
              vendorId: dto.vendorId,
              title: created.title,
              expiresAt: created.expiresAt.toISOString(),
            },
          },
          tx,
        );
      }

      return created;
    });

    // Schedule delayed expiration job if sent
    if (initialStatus === RfqStatus.SENT && this.queueService) {
      const delayMs = Math.max(0, expiresAt.getTime() - Date.now());
      await this.queueService.addJob(
        QUEUE_NAMES.CLEANUP,
        'expire-rfq',
        { rfqId: rfq.id },
        { delay: delayMs, jobId: `rfq-expiration:${rfq.id}` },
      );
    }

    await this.auditService.log({
      actorUserId: sponsorId,
      action: initialStatus === RfqStatus.SENT ? 'RFQ_SENT' : 'RFQ_CREATED_DRAFT',
      resourceType: 'rfq',
      resourceId: rfq.id,
      metadata: {
        vendorId: dto.vendorId,
        title: dto.title,
        itemCount: dto.items.length,
        status: initialStatus,
      },
      ipAddress,
      userAgent,
    });

    this.logger.log(
      `RFQ ${rfq.id} created (${initialStatus}) by sponsor ${sponsorId} for vendor ${dto.vendorId}`,
    );
    return this.mapToDetailsResponse(rfq);
  }

  /**
   * Sends a draft RFQ
   */
  async sendRfq(
    sponsorId: string,
    rfqId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RfqDetailsResponseDto> {
    await this.assertActiveUser(sponsorId, 'SPONSOR');

    const rfq = await this.prisma.rfq.findUnique({
      where: { id: rfqId },
      include: { items: true, clarifications: true },
    });

    if (!rfq) {
      throw new NotFoundException('RFQ not found');
    }

    if (rfq.sponsorId !== sponsorId) {
      throw new ForbiddenException('You do not have permission to send this RFQ');
    }

    if (rfq.status !== RfqStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot send RFQ in ${rfq.status} state. Only DRAFT RFQs can be sent.`,
      );
    }

    if (rfq.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        'RFQ expiration date has already passed. Please update expiration date.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.rfq.update({
        where: { id: rfqId },
        data: {
          status: RfqStatus.SENT,
          sentAt: new Date(),
        },
        include: { items: true, clarifications: true },
      });

      await this.outboxService.enqueue(
        {
          eventType: 'RFQ_SENT',
          aggregateType: 'rfq',
          aggregateId: rfqId,
          payload: {
            rfqId,
            sponsorId,
            vendorId: result.vendorId,
            title: result.title,
            expiresAt: result.expiresAt.toISOString(),
          },
        },
        tx,
      );

      return result;
    });

    if (this.queueService) {
      const delayMs = Math.max(0, updated.expiresAt.getTime() - Date.now());
      await this.queueService.addJob(
        QUEUE_NAMES.CLEANUP,
        'expire-rfq',
        { rfqId },
        { delay: delayMs, jobId: `rfq-expiration:${rfqId}` },
      );
    }

    await this.auditService.log({
      actorUserId: sponsorId,
      action: 'RFQ_SENT',
      resourceType: 'rfq',
      resourceId: rfqId,
      metadata: { vendorId: updated.vendorId, title: updated.title },
      ipAddress,
      userAgent,
    });

    return this.mapToDetailsResponse(updated);
  }

  /**
   * Retrieves RFQs involving the authenticated user (as sponsor or vendor)
   */
  async getMyRfqs(userId: string, query: RfqQueryDto): Promise<PaginatedRfqsDto> {
    await this.assertActiveUser(userId);

    const {
      status,
      vendorId,
      sponsorId,
      eventId,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const boundedLimit = Math.min(Math.max(1, limit), 100);
    const skip = (Math.max(1, page) - 1) * boundedLimit;

    // Caller must be either sponsor or vendor of the RFQ
    const where: Prisma.RfqWhereInput = {
      OR: [{ sponsorId: userId }, { vendorId: userId }],
    };

    if (status) {
      where.status = status;
    }

    if (vendorId) {
      where.vendorId = vendorId;
    }

    if (sponsorId) {
      where.sponsorId = sponsorId;
    }

    if (eventId) {
      where.eventId = eventId;
    }

    const orderBy: Prisma.RfqOrderByWithRelationInput = {};
    if (sortBy === 'expiresAt') {
      orderBy.expiresAt = sortOrder;
    } else if (sortBy === 'status') {
      orderBy.status = sortOrder;
    } else {
      orderBy.createdAt = sortOrder;
    }

    const [rfqs, total] = await Promise.all([
      this.prisma.rfq.findMany({
        where,
        skip,
        take: boundedLimit,
        orderBy,
        include: {
          _count: {
            select: { items: true },
          },
        },
      }),
      this.prisma.rfq.count({ where }),
    ]);

    const items: RfqListItemDto[] = rfqs.map((r) => {
      // Lazy check for expiration if in non-terminal state
      const isExpired =
        ['DRAFT', 'SENT', 'VIEWED', 'CLARIFICATION_REQUESTED'].includes(r.status) &&
        r.expiresAt.getTime() <= Date.now();

      return {
        id: r.id,
        sponsorId: r.sponsorId,
        vendorId: r.vendorId,
        eventId: r.eventId,
        title: r.title,
        status: isExpired ? RfqStatus.EXPIRED : r.status,
        expiresAt: r.expiresAt.toISOString(),
        sentAt: r.sentAt ? r.sentAt.toISOString() : null,
        viewedAt: r.viewedAt ? r.viewedAt.toISOString() : null,
        acceptedAt: r.acceptedAt ? r.acceptedAt.toISOString() : null,
        rejectedAt: r.rejectedAt ? r.rejectedAt.toISOString() : null,
        cancelledAt: r.cancelledAt ? r.cancelledAt.toISOString() : null,
        itemCount: r._count.items,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });

    return {
      items,
      total,
      page,
      limit: boundedLimit,
      totalPages: Math.ceil(total / boundedLimit) || 1,
    };
  }

  /**
   * Retrieves single RFQ details with authorization and SENT -> VIEWED transition
   */
  async getRfqById(
    userId: string,
    rfqId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RfqDetailsResponseDto> {
    await this.assertActiveUser(userId);

    const rfq = await this.prisma.rfq.findUnique({
      where: { id: rfqId },
      include: {
        items: true,
        clarifications: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!rfq) {
      throw new NotFoundException('RFQ not found');
    }

    if (rfq.sponsorId !== userId && rfq.vendorId !== userId) {
      throw new ForbiddenException('You do not have permission to view this RFQ');
    }

    let currentStatus = rfq.status;
    let viewedAt = rfq.viewedAt;

    // Check if expired
    const isPastExpiration = rfq.expiresAt.getTime() <= Date.now();
    const isNonTerminal = ['DRAFT', 'SENT', 'VIEWED', 'CLARIFICATION_REQUESTED'].includes(
      currentStatus,
    );

    if (isPastExpiration && isNonTerminal) {
      currentStatus = RfqStatus.EXPIRED;
      await this.prisma.rfq.update({
        where: { id: rfqId },
        data: { status: RfqStatus.EXPIRED },
      });
      await this.outboxService.enqueue({
        eventType: 'RFQ_EXPIRED',
        aggregateType: 'rfq',
        aggregateId: rfqId,
        payload: { rfqId, sponsorId: rfq.sponsorId, vendorId: rfq.vendorId },
      });
    } else if (userId === rfq.vendorId && currentStatus === RfqStatus.SENT) {
      // Transition from SENT to VIEWED on first vendor view
      currentStatus = RfqStatus.VIEWED;
      viewedAt = new Date();

      await this.prisma.rfq.update({
        where: { id: rfqId },
        data: {
          status: RfqStatus.VIEWED,
          viewedAt,
        },
      });

      await this.outboxService.enqueue({
        eventType: 'RFQ_VIEWED',
        aggregateType: 'rfq',
        aggregateId: rfqId,
        payload: { rfqId, sponsorId: rfq.sponsorId, vendorId: rfq.vendorId },
      });

      await this.auditService.log({
        actorUserId: userId,
        action: 'RFQ_VIEWED',
        resourceType: 'rfq',
        resourceId: rfqId,
        ipAddress,
        userAgent,
      });
    }

    return this.mapToDetailsResponse({
      ...rfq,
      status: currentStatus,
      viewedAt,
    });
  }

  /**
   * Adds clarification message to RFQ
   */
  async requestClarification(
    userId: string,
    rfqId: string,
    dto: CreateRfqClarificationDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RfqDetailsResponseDto> {
    await this.assertActiveUser(userId);

    const rfq = await this.prisma.rfq.findUnique({
      where: { id: rfqId },
      include: { items: true, clarifications: true },
    });

    if (!rfq) {
      throw new NotFoundException('RFQ not found');
    }

    if (rfq.sponsorId !== userId && rfq.vendorId !== userId) {
      throw new ForbiddenException('You do not have permission to comment on this RFQ');
    }

    if (['ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'].includes(rfq.status)) {
      throw new BadRequestException(
        `Cannot request clarification on an RFQ in ${rfq.status} status`,
      );
    }

    if (rfq.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Cannot request clarification on an expired RFQ');
    }

    const isVendor = userId === rfq.vendorId;
    const recipientId = isVendor ? rfq.sponsorId : rfq.vendorId;

    const updatedRfq = await this.prisma.$transaction(async (tx) => {
      await tx.rfqClarification.create({
        data: {
          rfqId,
          senderId: userId,
          message: dto.message,
        },
      });

      // If vendor asks clarification and RFQ is SENT or VIEWED, transition status
      let newStatus = rfq.status;
      if (isVendor && (rfq.status === RfqStatus.SENT || rfq.status === RfqStatus.VIEWED)) {
        newStatus = RfqStatus.CLARIFICATION_REQUESTED;
        await tx.rfq.update({
          where: { id: rfqId },
          data: { status: newStatus },
        });
      }

      await this.outboxService.enqueue(
        {
          eventType: 'RFQ_CLARIFICATION_REQUESTED',
          aggregateType: 'rfq',
          aggregateId: rfqId,
          payload: {
            rfqId,
            senderId: userId,
            recipientId,
            message: dto.message,
          },
        },
        tx,
      );

      return tx.rfq.findUnique({
        where: { id: rfqId },
        include: {
          items: true,
          clarifications: { orderBy: { createdAt: 'asc' } },
        },
      });
    });

    await this.auditService.log({
      actorUserId: userId,
      action: 'RFQ_CLARIFICATION_REQUESTED',
      resourceType: 'rfq',
      resourceId: rfqId,
      metadata: { recipientId, messageSnippet: dto.message.slice(0, 100) },
      ipAddress,
      userAgent,
    });

    return this.mapToDetailsResponse(updatedRfq!);
  }

  /**
   * Cancels an RFQ by the sponsor
   */
  async cancelRfq(
    sponsorId: string,
    rfqId: string,
    dto: CancelRfqDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RfqDetailsResponseDto> {
    await this.assertActiveUser(sponsorId, 'SPONSOR');

    const rfq = await this.prisma.rfq.findUnique({
      where: { id: rfqId },
      include: { items: true, clarifications: true },
    });

    if (!rfq) {
      throw new NotFoundException('RFQ not found');
    }

    if (rfq.sponsorId !== sponsorId) {
      throw new ForbiddenException('Only the creating sponsor can cancel this RFQ');
    }

    if (['ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(rfq.status)) {
      throw new BadRequestException(`Cannot cancel RFQ in terminal status ${rfq.status}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.rfq.update({
        where: { id: rfqId },
        data: {
          status: RfqStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: dto.reason || null,
        },
        include: { items: true, clarifications: true },
      });

      // Mark all pending quotations as REJECTED or expired
      await tx.quotation.updateMany({
        where: {
          rfqId,
          status: QuotationStatus.PENDING,
        },
        data: {
          status: QuotationStatus.REJECTED,
          rejectedAt: new Date(),
          rejectionReason: 'RFQ was cancelled by sponsor',
        },
      });

      await this.outboxService.enqueue(
        {
          eventType: 'RFQ_CANCELLED',
          aggregateType: 'rfq',
          aggregateId: rfqId,
          payload: {
            rfqId,
            sponsorId,
            vendorId: res.vendorId,
            reason: dto.reason || null,
          },
        },
        tx,
      );

      return res;
    });

    await this.auditService.log({
      actorUserId: sponsorId,
      action: 'RFQ_CANCELLED',
      resourceType: 'rfq',
      resourceId: rfqId,
      metadata: { reason: dto.reason },
      ipAddress,
      userAgent,
    });

    return this.mapToDetailsResponse(updated);
  }

  /**
   * Rejects an RFQ by the vendor
   */
  async rejectRfq(
    vendorId: string,
    rfqId: string,
    dto: RejectRfqDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RfqDetailsResponseDto> {
    await this.assertActiveUser(vendorId, 'VENDOR');

    const rfq = await this.prisma.rfq.findUnique({
      where: { id: rfqId },
      include: { items: true, clarifications: true },
    });

    if (!rfq) {
      throw new NotFoundException('RFQ not found');
    }

    if (rfq.vendorId !== vendorId) {
      throw new ForbiddenException('Only the recipient vendor can reject this RFQ');
    }

    if (['ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(rfq.status)) {
      throw new BadRequestException(`Cannot reject RFQ in terminal status ${rfq.status}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.rfq.update({
        where: { id: rfqId },
        data: {
          status: RfqStatus.REJECTED,
          rejectedAt: new Date(),
          rejectionReason: dto.reason || null,
        },
        include: { items: true, clarifications: true },
      });

      await this.outboxService.enqueue(
        {
          eventType: 'RFQ_REJECTED',
          aggregateType: 'rfq',
          aggregateId: rfqId,
          payload: {
            rfqId,
            sponsorId: res.sponsorId,
            vendorId,
            reason: dto.reason || null,
          },
        },
        tx,
      );

      return res;
    });

    await this.auditService.log({
      actorUserId: vendorId,
      action: 'RFQ_REJECTED',
      resourceType: 'rfq',
      resourceId: rfqId,
      metadata: { reason: dto.reason },
      ipAddress,
      userAgent,
    });

    return this.mapToDetailsResponse(updated);
  }

  private mapToDetailsResponse(
    rfq: Rfq & { items?: RfqItem[]; clarifications?: RfqClarification[] },
  ): RfqDetailsResponseDto {
    return {
      id: rfq.id,
      sponsorId: rfq.sponsorId,
      vendorId: rfq.vendorId,
      eventId: rfq.eventId,
      title: rfq.title,
      description: rfq.description,
      requirements: rfq.requirements,
      status: rfq.status,
      expiresAt: rfq.expiresAt instanceof Date ? rfq.expiresAt.toISOString() : rfq.expiresAt,
      sentAt: rfq.sentAt
        ? rfq.sentAt instanceof Date
          ? rfq.sentAt.toISOString()
          : rfq.sentAt
        : null,
      viewedAt: rfq.viewedAt
        ? rfq.viewedAt instanceof Date
          ? rfq.viewedAt.toISOString()
          : rfq.viewedAt
        : null,
      acceptedAt: rfq.acceptedAt
        ? rfq.acceptedAt instanceof Date
          ? rfq.acceptedAt.toISOString()
          : rfq.acceptedAt
        : null,
      rejectedAt: rfq.rejectedAt
        ? rfq.rejectedAt instanceof Date
          ? rfq.rejectedAt.toISOString()
          : rfq.rejectedAt
        : null,
      cancelledAt: rfq.cancelledAt
        ? rfq.cancelledAt instanceof Date
          ? rfq.cancelledAt.toISOString()
          : rfq.cancelledAt
        : null,
      cancellationReason: rfq.cancellationReason,
      rejectionReason: rfq.rejectionReason,
      itemCount: rfq.items?.length || 0,
      createdAt: rfq.createdAt instanceof Date ? rfq.createdAt.toISOString() : rfq.createdAt,
      updatedAt: rfq.updatedAt instanceof Date ? rfq.updatedAt.toISOString() : rfq.updatedAt,
      items: (rfq.items || []).map((i: RfqItem) => ({
        id: i.id,
        vendorServiceId: i.vendorServiceId,
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        targetPrice: i.targetPrice ? Number(i.targetPrice) : null,
        notes: i.notes,
        createdAt: i.createdAt instanceof Date ? i.createdAt.toISOString() : i.createdAt,
      })),
      clarifications: (rfq.clarifications || []).map((c: RfqClarification) => ({
        id: c.id,
        rfqId: c.rfqId,
        senderId: c.senderId,
        message: c.message,
        createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
      })),
    };
  }
}
