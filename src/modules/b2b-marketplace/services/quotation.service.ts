import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import {
  AccountStatus,
  Prisma,
  Quotation,
  QuotationItem,
  QuotationStatus,
  RfqStatus,
} from '@prisma/client';
import { CreateQuotationDto } from '../dto/create-quotation.dto';
import { RejectQuotationDto } from '../dto/quotation-action.dto';
import {
  QuotationDetailsResponseDto,
  QuotationListItemDto,
  PaginatedQuotationsDto,
} from '../dto/quotation-response.dto';

@Injectable()
export class QuotationService {
  private readonly logger = new Logger(QuotationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
  ) {}

  /**
   * Asserts user is active, not deleted, and optionally has the required role
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
   * Submits a new quotation (or next version) for an RFQ
   */
  async createQuotation(
    vendorId: string,
    dto: CreateQuotationDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<QuotationDetailsResponseDto> {
    await this.assertActiveUser(vendorId, 'VENDOR');

    const rfq = await this.prisma.rfq.findUnique({
      where: { id: dto.rfqId },
      include: { items: true },
    });

    if (!rfq) {
      throw new NotFoundException('RFQ not found');
    }

    if (rfq.vendorId !== vendorId) {
      throw new ForbiddenException('You do not have permission to submit quotations for this RFQ');
    }

    const eligibleStatuses: RfqStatus[] = [
      RfqStatus.SENT,
      RfqStatus.VIEWED,
      RfqStatus.CLARIFICATION_REQUESTED,
      RfqStatus.QUOTED,
    ];

    if (!eligibleStatuses.includes(rfq.status)) {
      throw new BadRequestException(`Cannot submit quotation for RFQ in status ${rfq.status}`);
    }

    if (rfq.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('RFQ has expired. Quotations can no longer be submitted.');
    }

    const validUntil = new Date(dto.validUntil);
    if (isNaN(validUntil.getTime()) || validUntil.getTime() <= Date.now()) {
      throw new BadRequestException('Quotation validity timestamp must be in the future');
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Quotation must contain at least one item');
    }

    // Server-side authoritative calculation using Prisma.Decimal
    let calculatedSubtotal = new Prisma.Decimal(0);
    const calculatedItems = dto.items.map((item) => {
      if (item.quantity <= 0) {
        throw new BadRequestException('Item quantity must be greater than zero');
      }
      if (item.unitPrice < 0) {
        throw new BadRequestException('Item unit price cannot be negative');
      }

      const unitPriceDec = new Prisma.Decimal(item.unitPrice);
      const itemTotalDec = unitPriceDec.mul(item.quantity);
      calculatedSubtotal = calculatedSubtotal.add(itemTotalDec);

      return {
        rfqItemId: item.rfqItemId || null,
        description: item.description,
        quantity: item.quantity,
        unitPrice: unitPriceDec,
        total: itemTotalDec,
        notes: item.notes || null,
      };
    });

    const taxDec = new Prisma.Decimal(dto.tax !== undefined ? dto.tax : 0);
    const discountDec = new Prisma.Decimal(dto.discount !== undefined ? dto.discount : 0);

    if (taxDec.isNegative()) {
      throw new BadRequestException('Tax cannot be negative');
    }
    if (discountDec.isNegative()) {
      throw new BadRequestException('Discount cannot be negative');
    }

    const calculatedTotal = calculatedSubtotal.add(taxDec).sub(discountDec);
    if (calculatedTotal.isNegative()) {
      throw new BadRequestException('Quotation total cannot be negative after discounts');
    }

    // Transactionally create quotation, bump version, supersede previous, and update RFQ status
    const createdQuotation = await this.prisma.$transaction(async (tx) => {
      // Find maximum existing version
      const aggregate = await tx.quotation.aggregate({
        where: { rfqId: dto.rfqId },
        _max: { version: true },
      });
      const nextVersion = (aggregate._max.version || 0) + 1;

      // Supersede any pending previous quotations
      if (nextVersion > 1) {
        await tx.quotation.updateMany({
          where: {
            rfqId: dto.rfqId,
            status: QuotationStatus.PENDING,
          },
          data: {
            status: QuotationStatus.SUPERSEDED,
          },
        });
      }

      const quotation = await tx.quotation.create({
        data: {
          rfqId: dto.rfqId,
          vendorId,
          version: nextVersion,
          status: QuotationStatus.PENDING,
          subtotal: calculatedSubtotal,
          tax: taxDec,
          discount: discountDec,
          total: calculatedTotal,
          currency: dto.currency || 'SAR',
          validUntil,
          notes: dto.notes || null,
          items: {
            create: calculatedItems,
          },
        },
        include: { items: true },
      });

      // Update RFQ status to QUOTED
      await tx.rfq.update({
        where: { id: dto.rfqId },
        data: { status: RfqStatus.QUOTED },
      });

      // Outbox event
      await this.outboxService.enqueue(
        {
          eventType: 'RFQ_QUOTED',
          aggregateType: 'quotation',
          aggregateId: quotation.id,
          payload: {
            quotationId: quotation.id,
            rfqId: dto.rfqId,
            vendorId,
            sponsorId: rfq.sponsorId,
            version: nextVersion,
            total: quotation.total.toNumber(),
            currency: quotation.currency,
            validUntil: quotation.validUntil.toISOString(),
          },
        },
        tx,
      );

      return quotation;
    });

    await this.auditService.log({
      actorUserId: vendorId,
      action: 'QUOTATION_CREATED',
      resourceType: 'quotation',
      resourceId: createdQuotation.id,
      metadata: {
        rfqId: dto.rfqId,
        version: createdQuotation.version,
        total: createdQuotation.total.toNumber(),
        currency: createdQuotation.currency,
      },
      ipAddress,
      userAgent,
    });

    this.logger.log(
      `Quotation ${createdQuotation.id} (v${createdQuotation.version}) created for RFQ ${dto.rfqId}`,
    );

    return this.mapToDetailsResponse(createdQuotation);
  }

  /**
   * Accepts a quotation with atomic row locking and double-acceptance prevention
   */
  async acceptQuotation(
    sponsorId: string,
    quotationId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<QuotationDetailsResponseDto> {
    await this.assertActiveUser(sponsorId, 'SPONSOR');

    // Perform acceptance within transaction with strict concurrency checks
    const acceptedQuotation = await this.prisma.$transaction(async (tx) => {
      const quotation = await tx.quotation.findUnique({
        where: { id: quotationId },
        include: {
          rfq: true,
          items: true,
        },
      });

      if (!quotation) {
        throw new NotFoundException('Quotation not found');
      }

      if (quotation.rfq.sponsorId !== sponsorId) {
        throw new ForbiddenException('Only the creating sponsor can accept this quotation');
      }

      if (quotation.status !== QuotationStatus.PENDING) {
        throw new BadRequestException(
          `Cannot accept quotation in ${quotation.status} status. Only PENDING quotations can be accepted.`,
        );
      }

      if (quotation.validUntil.getTime() <= Date.now()) {
        throw new BadRequestException('Quotation validity period has expired');
      }

      // Concurrency check: Ensure RFQ has not already been accepted
      const rfqUpdateResult = await tx.rfq.updateMany({
        where: {
          id: quotation.rfqId,
          status: { not: RfqStatus.ACCEPTED },
        },
        data: {
          status: RfqStatus.ACCEPTED,
          acceptedAt: new Date(),
        },
      });

      if (rfqUpdateResult.count === 0) {
        throw new ConflictException(
          'This RFQ has already been accepted or is no longer eligible for acceptance',
        );
      }

      // Mark this quotation as ACCEPTED
      const updated = await tx.quotation.update({
        where: { id: quotationId },
        data: {
          status: QuotationStatus.ACCEPTED,
          acceptedAt: new Date(),
        },
        include: { items: true },
      });

      // Supersede any other pending quotations for this RFQ
      await tx.quotation.updateMany({
        where: {
          rfqId: quotation.rfqId,
          id: { not: quotationId },
          status: QuotationStatus.PENDING,
        },
        data: {
          status: QuotationStatus.SUPERSEDED,
        },
      });

      // Create outbox notification event for vendor
      await this.outboxService.enqueue(
        {
          eventType: 'RFQ_ACCEPTED',
          aggregateType: 'quotation',
          aggregateId: quotationId,
          payload: {
            quotationId,
            rfqId: quotation.rfqId,
            sponsorId,
            vendorId: quotation.vendorId,
            total: updated.total.toNumber(),
            currency: updated.currency,
          },
        },
        tx,
      );

      return updated;
    });

    await this.auditService.log({
      actorUserId: sponsorId,
      action: 'QUOTATION_ACCEPTED',
      resourceType: 'quotation',
      resourceId: quotationId,
      metadata: {
        rfqId: acceptedQuotation.rfqId,
        version: acceptedQuotation.version,
        total: acceptedQuotation.total.toNumber(),
      },
      ipAddress,
      userAgent,
    });

    this.logger.log(`Quotation ${quotationId} accepted by sponsor ${sponsorId}`);
    return this.mapToDetailsResponse(acceptedQuotation);
  }

  /**
   * Rejects a quotation with an optional reason
   */
  async rejectQuotation(
    sponsorId: string,
    quotationId: string,
    dto: RejectQuotationDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<QuotationDetailsResponseDto> {
    await this.assertActiveUser(sponsorId, 'SPONSOR');

    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { rfq: true, items: true },
    });

    if (!quotation) {
      throw new NotFoundException('Quotation not found');
    }

    if (quotation.rfq.sponsorId !== sponsorId) {
      throw new ForbiddenException('Only the creating sponsor can reject this quotation');
    }

    if (quotation.status !== QuotationStatus.PENDING) {
      throw new BadRequestException(
        `Cannot reject quotation in ${quotation.status} status. Only PENDING quotations can be rejected.`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.quotation.update({
        where: { id: quotationId },
        data: {
          status: QuotationStatus.REJECTED,
          rejectedAt: new Date(),
          rejectionReason: dto.reason || null,
        },
        include: { items: true },
      });

      await this.outboxService.enqueue(
        {
          eventType: 'RFQ_REJECTED',
          aggregateType: 'quotation',
          aggregateId: quotationId,
          payload: {
            quotationId,
            rfqId: quotation.rfqId,
            sponsorId,
            vendorId: quotation.vendorId,
            reason: dto.reason || null,
          },
        },
        tx,
      );

      return res;
    });

    await this.auditService.log({
      actorUserId: sponsorId,
      action: 'QUOTATION_REJECTED',
      resourceType: 'quotation',
      resourceId: quotationId,
      metadata: {
        rfqId: quotation.rfqId,
        version: quotation.version,
        reason: dto.reason,
      },
      ipAddress,
      userAgent,
    });

    this.logger.log(`Quotation ${quotationId} rejected by sponsor ${sponsorId}`);
    return this.mapToDetailsResponse(updated);
  }

  /**
   * Retrieves all quotations for a given RFQ
   */
  async getQuotationsForRfq(
    userId: string,
    rfqId: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedQuotationsDto> {
    await this.assertActiveUser(userId);

    const rfq = await this.prisma.rfq.findUnique({
      where: { id: rfqId },
    });

    if (!rfq) {
      throw new NotFoundException('RFQ not found');
    }

    if (rfq.sponsorId !== userId && rfq.vendorId !== userId) {
      throw new ForbiddenException('You do not have permission to view quotations for this RFQ');
    }

    const boundedLimit = Math.min(Math.max(1, limit), 100);
    const skip = (Math.max(1, page) - 1) * boundedLimit;

    const [quotations, total] = await Promise.all([
      this.prisma.quotation.findMany({
        where: { rfqId },
        skip,
        take: boundedLimit,
        orderBy: { version: 'desc' },
      }),
      this.prisma.quotation.count({ where: { rfqId } }),
    ]);

    const items: QuotationListItemDto[] = quotations.map((q) => this.mapToListItem(q));

    return {
      items,
      total,
      page,
      limit: boundedLimit,
      totalPages: Math.ceil(total / boundedLimit) || 1,
    };
  }

  /**
   * Retrieves a single quotation with full line items
   */
  async getQuotationById(
    userId: string,
    quotationId: string,
  ): Promise<QuotationDetailsResponseDto> {
    await this.assertActiveUser(userId);

    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        rfq: true,
        items: true,
      },
    });

    if (!quotation) {
      throw new NotFoundException('Quotation not found');
    }

    if (quotation.rfq.sponsorId !== userId && quotation.rfq.vendorId !== userId) {
      throw new ForbiddenException('You do not have permission to view this quotation');
    }

    return this.mapToDetailsResponse(quotation);
  }

  private mapToListItem(q: Quotation): QuotationListItemDto {
    return {
      id: q.id,
      rfqId: q.rfqId,
      vendorId: q.vendorId,
      version: q.version,
      status: q.status,
      subtotal: q.subtotal ? Number(q.subtotal) : 0,
      tax: q.tax ? Number(q.tax) : 0,
      discount: q.discount ? Number(q.discount) : 0,
      total: q.total ? Number(q.total) : 0,
      currency: q.currency,
      validUntil: q.validUntil instanceof Date ? q.validUntil.toISOString() : q.validUntil,
      acceptedAt: q.acceptedAt
        ? q.acceptedAt instanceof Date
          ? q.acceptedAt.toISOString()
          : q.acceptedAt
        : null,
      rejectedAt: q.rejectedAt
        ? q.rejectedAt instanceof Date
          ? q.rejectedAt.toISOString()
          : q.rejectedAt
        : null,
      rejectionReason: q.rejectionReason,
      createdAt: q.createdAt instanceof Date ? q.createdAt.toISOString() : q.createdAt,
      updatedAt: q.updatedAt instanceof Date ? q.updatedAt.toISOString() : q.updatedAt,
    };
  }

  private mapToDetailsResponse(
    q: Quotation & { items?: QuotationItem[] },
  ): QuotationDetailsResponseDto {
    return {
      ...this.mapToListItem(q),
      notes: q.notes,
      items: (q.items || []).map((i: QuotationItem) => ({
        id: i.id,
        rfqItemId: i.rfqItemId,
        description: i.description,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        total: Number(i.total),
        notes: i.notes,
      })),
    };
  }
}
