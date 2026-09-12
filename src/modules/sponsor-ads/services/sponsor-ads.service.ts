/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { OutboxService } from '../../outbox/outbox.service';
import { AuditService } from '../../audit/audit.service';
import {
  AccountStatus,
  EventStatus,
  Prisma,
  SponsorAdPlacement,
  SponsorAdStatus,
} from '@prisma/client';
import { CreateSponsorAdDto } from '../dto/create-sponsor-ad.dto';
import { UpdateSponsorAdDto } from '../dto/update-sponsor-ad.dto';
import { RejectSponsorAdDto } from '../dto/review-sponsor-ad.dto';
import { SponsorAdQueryDto } from '../dto/sponsor-ad-query.dto';
import { SponsorAdResponseDto, PaginatedSponsorAdsDto } from '../dto/sponsor-ad-response.dto';

@Injectable()
export class SponsorAdsService {
  private readonly logger = new Logger(SponsorAdsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Asserts active sponsor account
   */
  async assertActiveSponsor(userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user) {
      throw new NotFoundException('Sponsor account not found');
    }

    if (user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException(
        `Account is ${user.status}. Only active sponsors can manage advertising campaigns.`,
      );
    }

    const hasSponsorRole = user.userRoles.some((ur) => ur.role.name === 'SPONSOR');
    if (!hasSponsorRole) {
      throw new ForbiddenException('Only users with the SPONSOR role can manage sponsor ads.');
    }
  }

  /**
   * Sponsor creates a new ad (initial state: DRAFT)
   */
  async createAd(
    sponsorId: string,
    dto: CreateSponsorAdDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<SponsorAdResponseDto> {
    await this.assertActiveSponsor(sponsorId);

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
      throw new BadRequestException('Invalid start or end date format');
    }

    if (endsAt <= startsAt) {
      throw new BadRequestException('Campaign end date must be after start date');
    }

    if (dto.eventId) {
      const event = await this.prisma.event.findFirst({
        where: { id: dto.eventId, deletedAt: null },
      });
      if (!event) {
        throw new NotFoundException('Target event not found');
      }
    }

    const ad = await this.prisma.sponsorAd.create({
      data: {
        sponsorId,
        eventId: dto.eventId || null,
        title: dto.title,
        description: dto.description,
        imageUrl: dto.imageUrl,
        destinationUrl: dto.destinationUrl,
        placement: dto.placement || SponsorAdPlacement.MARKETPLACE,
        status: SponsorAdStatus.DRAFT,
        startsAt,
        endsAt,
      },
      include: {
        sponsor: { include: { sponsorProfile: true } },
      },
    });

    await this.auditService.log({
      actorUserId: sponsorId,
      action: 'SPONSOR_AD_CREATED',
      resourceType: 'sponsor_ad',
      resourceId: ad.id,
      ipAddress,
      userAgent,
      metadata: { title: dto.title, placement: ad.placement },
    });

    this.logger.log(`Sponsor Ad ${ad.id} created as DRAFT by sponsor ${sponsorId}`);
    return this.mapToDto(ad);
  }

  /**
   * Sponsor updates ad details
   */
  async updateAd(
    sponsorId: string,
    adId: string,
    dto: UpdateSponsorAdDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<SponsorAdResponseDto> {
    await this.assertActiveSponsor(sponsorId);

    const ad = await this.prisma.sponsorAd.findFirst({
      where: { id: adId, deletedAt: null },
    });

    if (!ad) {
      throw new NotFoundException('Sponsor ad not found');
    }

    if (ad.sponsorId !== sponsorId) {
      throw new ForbiddenException('You are not authorized to update this ad');
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : ad.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : ad.endsAt;

    if (endsAt <= startsAt) {
      throw new BadRequestException('Campaign end date must be after start date');
    }

    // If ad was published or approved, modifying content moves it back to PENDING_REVIEW
    let newStatus = ad.status;
    if (
      (ad.status === SponsorAdStatus.APPROVED || ad.status === SponsorAdStatus.PUBLISHED) &&
      (dto.title || dto.description || dto.imageUrl || dto.destinationUrl)
    ) {
      newStatus = SponsorAdStatus.PENDING_REVIEW;
    }

    const updated = await this.prisma.sponsorAd.update({
      where: { id: adId },
      data: {
        ...(dto.eventId !== undefined && { eventId: dto.eventId || null }),
        ...(dto.title && { title: dto.title }),
        ...(dto.description && { description: dto.description }),
        ...(dto.imageUrl && { imageUrl: dto.imageUrl }),
        ...(dto.destinationUrl && { destinationUrl: dto.destinationUrl }),
        ...(dto.placement && { placement: dto.placement }),
        ...(dto.startsAt && { startsAt }),
        ...(dto.endsAt && { endsAt }),
        status: newStatus,
      },
      include: {
        sponsor: { include: { sponsorProfile: true } },
      },
    });

    await this.auditService.log({
      actorUserId: sponsorId,
      action: 'SPONSOR_AD_UPDATED',
      resourceType: 'sponsor_ad',
      resourceId: adId,
      ipAddress,
      userAgent,
      metadata: { changes: dto },
    });

    return this.mapToDto(updated);
  }

  /**
   * Sponsor submits ad for admin review (DRAFT -> PENDING_REVIEW)
   */
  async submitAd(
    sponsorId: string,
    adId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<SponsorAdResponseDto> {
    await this.assertActiveSponsor(sponsorId);

    const ad = await this.prisma.sponsorAd.findFirst({
      where: { id: adId, deletedAt: null },
    });

    if (!ad) {
      throw new NotFoundException('Sponsor ad not found');
    }

    if (ad.sponsorId !== sponsorId) {
      throw new ForbiddenException('You are not authorized to submit this ad');
    }

    if (
      ad.status !== SponsorAdStatus.DRAFT &&
      ad.status !== SponsorAdStatus.REJECTED &&
      ad.status !== SponsorAdStatus.PAUSED
    ) {
      throw new BadRequestException(`Cannot submit an ad in ${ad.status} state`);
    }

    const updated = await this.prisma.sponsorAd.update({
      where: { id: adId },
      data: {
        status: SponsorAdStatus.PENDING_REVIEW,
        rejectionReason: null,
      },
      include: {
        sponsor: { include: { sponsorProfile: true } },
      },
    });

    // Enqueue outbox notification for administrative moderation
    await this.outboxService.enqueue({
      eventType: 'SPONSOR_AD_SUBMITTED',
      aggregateType: 'sponsor_ad',
      aggregateId: adId,
      payload: {
        adId,
        sponsorId,
        title: ad.title,
      },
    });

    await this.auditService.log({
      actorUserId: sponsorId,
      action: 'SPONSOR_AD_SUBMITTED',
      resourceType: 'sponsor_ad',
      resourceId: adId,
      ipAddress,
      userAgent,
    });

    this.logger.log(`Sponsor Ad ${adId} submitted for review by sponsor ${sponsorId}`);
    return this.mapToDto(updated);
  }

  /**
   * Toggle pause / resume on active ad
   */
  async togglePauseAd(
    sponsorId: string,
    adId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<SponsorAdResponseDto> {
    await this.assertActiveSponsor(sponsorId);

    const ad = await this.prisma.sponsorAd.findFirst({
      where: { id: adId, deletedAt: null },
    });

    if (!ad) {
      throw new NotFoundException('Sponsor ad not found');
    }

    if (ad.sponsorId !== sponsorId) {
      throw new ForbiddenException('You are not authorized to modify this ad');
    }

    let nextStatus: SponsorAdStatus;
    if (ad.status === SponsorAdStatus.PUBLISHED || ad.status === SponsorAdStatus.APPROVED) {
      nextStatus = SponsorAdStatus.PAUSED;
    } else if (ad.status === SponsorAdStatus.PAUSED) {
      nextStatus = SponsorAdStatus.PUBLISHED;
    } else {
      throw new BadRequestException(`Cannot pause or resume ad in ${ad.status} state`);
    }

    const updated = await this.prisma.sponsorAd.update({
      where: { id: adId },
      data: { status: nextStatus },
      include: {
        sponsor: { include: { sponsorProfile: true } },
      },
    });

    await this.auditService.log({
      actorUserId: sponsorId,
      action: nextStatus === SponsorAdStatus.PAUSED ? 'SPONSOR_AD_PAUSED' : 'SPONSOR_AD_RESUMED',
      resourceType: 'sponsor_ad',
      resourceId: adId,
      ipAddress,
      userAgent,
    });

    return this.mapToDto(updated);
  }

  /**
   * Soft delete ad
   */
  async deleteAd(
    sponsorId: string,
    adId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.assertActiveSponsor(sponsorId);

    const ad = await this.prisma.sponsorAd.findFirst({
      where: { id: adId, deletedAt: null },
    });

    if (!ad) {
      throw new NotFoundException('Sponsor ad not found');
    }

    if (ad.sponsorId !== sponsorId) {
      throw new ForbiddenException('You are not authorized to delete this ad');
    }

    await this.prisma.sponsorAd.update({
      where: { id: adId },
      data: { deletedAt: new Date() },
    });

    await this.auditService.log({
      actorUserId: sponsorId,
      action: 'SPONSOR_AD_DELETED',
      resourceType: 'sponsor_ad',
      resourceId: adId,
      ipAddress,
      userAgent,
    });
  }

  /**
   * Sponsor lists their ads
   */
  async getSponsorAds(
    sponsorId: string,
    query: SponsorAdQueryDto,
  ): Promise<PaginatedSponsorAdsDto> {
    await this.assertActiveSponsor(sponsorId);

    const page = query.page || 1;
    const pageSize = Math.min(query.pageSize || 20, 100);
    const skip = (page - 1) * pageSize;

    const where: Prisma.SponsorAdWhereInput = {
      sponsorId,
      deletedAt: null,
      ...(query.status && { status: query.status }),
      ...(query.eventId && { eventId: query.eventId }),
      ...(query.placement && { placement: query.placement }),
    };

    const [total, ads] = await Promise.all([
      this.prisma.sponsorAd.count({ where }),
      this.prisma.sponsorAd.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          sponsor: { include: { sponsorProfile: true } },
        },
      }),
    ]);

    return {
      items: ads.map((a) => this.mapToDto(a)),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  /**
   * Sponsor gets single ad
   */
  async getSponsorAdById(sponsorId: string, adId: string): Promise<SponsorAdResponseDto> {
    await this.assertActiveSponsor(sponsorId);

    const ad = await this.prisma.sponsorAd.findFirst({
      where: { id: adId, deletedAt: null },
      include: {
        sponsor: { include: { sponsorProfile: true } },
      },
    });

    if (!ad) {
      throw new NotFoundException('Sponsor ad not found');
    }

    if (ad.sponsorId !== sponsorId) {
      throw new ForbiddenException('You are not authorized to view this ad');
    }

    return this.mapToDto(ad);
  }

  /**
   * Admin lists ads for moderation review
   */
  async getAdminAds(query: SponsorAdQueryDto): Promise<PaginatedSponsorAdsDto> {
    const page = query.page || 1;
    const pageSize = Math.min(query.pageSize || 20, 100);
    const skip = (page - 1) * pageSize;

    const where: Prisma.SponsorAdWhereInput = {
      deletedAt: null,
      ...(query.status && { status: query.status }),
      ...(query.eventId && { eventId: query.eventId }),
      ...(query.placement && { placement: query.placement }),
    };

    const [total, ads] = await Promise.all([
      this.prisma.sponsorAd.count({ where }),
      this.prisma.sponsorAd.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          sponsor: { include: { sponsorProfile: true } },
        },
      }),
    ]);

    return {
      items: ads.map((a) => this.mapToDto(a)),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  /**
   * Admin approves sponsor ad
   */
  async approveAd(
    adminId: string,
    adId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<SponsorAdResponseDto> {
    const ad = await this.prisma.sponsorAd.findFirst({
      where: { id: adId, deletedAt: null },
      include: { sponsor: true },
    });

    if (!ad) {
      throw new NotFoundException('Sponsor ad not found');
    }

    if (ad.status !== SponsorAdStatus.PENDING_REVIEW) {
      throw new BadRequestException(`Cannot approve ad currently in ${ad.status} state`);
    }

    const now = new Date();
    // If campaign is already within its active start date window, publish immediately
    const nextStatus =
      now >= ad.startsAt && now < ad.endsAt ? SponsorAdStatus.PUBLISHED : SponsorAdStatus.APPROVED;

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.sponsorAd.update({
        where: { id: adId },
        data: {
          status: nextStatus,
          reviewedByUserId: adminId,
          reviewedAt: now,
          rejectionReason: null,
        },
        include: {
          sponsor: { include: { sponsorProfile: true } },
        },
      });

      await this.outboxService.enqueue(
        {
          eventType: 'SPONSOR_AD_APPROVED',
          aggregateType: 'sponsor_ad',
          aggregateId: adId,
          payload: {
            adId,
            sponsorId: ad.sponsorId,
            title: ad.title,
          },
        },
        tx,
      );

      return res;
    });

    await this.auditService.log({
      actorUserId: adminId,
      action: 'SPONSOR_AD_APPROVED',
      resourceType: 'sponsor_ad',
      resourceId: adId,
      ipAddress,
      userAgent,
      metadata: { status: nextStatus },
    });

    this.logger.log(`Sponsor Ad ${adId} approved by admin ${adminId}`);
    return this.mapToDto(updated);
  }

  /**
   * Admin rejects sponsor ad with reason
   */
  async rejectAd(
    adminId: string,
    adId: string,
    dto: RejectSponsorAdDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<SponsorAdResponseDto> {
    const ad = await this.prisma.sponsorAd.findFirst({
      where: { id: adId, deletedAt: null },
      include: { sponsor: true },
    });

    if (!ad) {
      throw new NotFoundException('Sponsor ad not found');
    }

    if (ad.status !== SponsorAdStatus.PENDING_REVIEW) {
      throw new BadRequestException(`Cannot reject ad currently in ${ad.status} state`);
    }

    const now = new Date();
    const reason = dto.reason || 'Ad does not meet platform guidelines';

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.sponsorAd.update({
        where: { id: adId },
        data: {
          status: SponsorAdStatus.REJECTED,
          rejectionReason: reason,
          reviewedByUserId: adminId,
          reviewedAt: now,
        },
        include: {
          sponsor: { include: { sponsorProfile: true } },
        },
      });

      await this.outboxService.enqueue(
        {
          eventType: 'SPONSOR_AD_REJECTED',
          aggregateType: 'sponsor_ad',
          aggregateId: adId,
          payload: {
            adId,
            sponsorId: ad.sponsorId,
            title: ad.title,
            reason,
          },
        },
        tx,
      );

      return res;
    });

    await this.auditService.log({
      actorUserId: adminId,
      action: 'SPONSOR_AD_REJECTED',
      resourceType: 'sponsor_ad',
      resourceId: adId,
      ipAddress,
      userAgent,
      metadata: { reason },
    });

    this.logger.log(`Sponsor Ad ${adId} rejected by admin ${adminId}`);
    return this.mapToDto(updated);
  }

  /**
   * Public discovery for active and approved ads
   * Enforces: sponsor active, ad approved/published, now >= startsAt && now < endsAt,
   * and if event-scoped, event has not ended and is published.
   */
  async discoverPublicAds(query: SponsorAdQueryDto): Promise<PaginatedSponsorAdsDto> {
    const now = new Date();
    const page = query.page || 1;
    const pageSize = Math.min(query.pageSize || 20, 100);
    const skip = (page - 1) * pageSize;

    const where: Prisma.SponsorAdWhereInput = {
      deletedAt: null,
      status: { in: [SponsorAdStatus.APPROVED, SponsorAdStatus.PUBLISHED] },
      startsAt: { lte: now },
      endsAt: { gt: now },
      sponsor: {
        deletedAt: null,
        status: AccountStatus.ACTIVE,
      },
      ...(query.eventId && { eventId: query.eventId }),
      ...(query.placement && { placement: query.placement }),
      OR: [
        { eventId: null },
        {
          event: {
            deletedAt: null,
            endsAt: { gt: now },
            status: { in: [EventStatus.PUBLISHED, EventStatus.ONGOING] },
          },
        },
      ],
    };

    const [total, ads] = await Promise.all([
      this.prisma.sponsorAd.count({ where }),
      this.prisma.sponsorAd.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          sponsor: { include: { sponsorProfile: true } },
        },
      }),
    ]);

    return {
      items: ads.map((a) => this.mapToDto(a)),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  /**
   * Public single ad view
   */
  async getPublicAdById(adId: string): Promise<SponsorAdResponseDto> {
    const now = new Date();
    const ad = await this.prisma.sponsorAd.findFirst({
      where: {
        id: adId,
        deletedAt: null,
        status: { in: [SponsorAdStatus.APPROVED, SponsorAdStatus.PUBLISHED] },
        startsAt: { lte: now },
        endsAt: { gt: now },
        sponsor: {
          deletedAt: null,
          status: AccountStatus.ACTIVE,
        },
        OR: [
          { eventId: null },
          {
            event: {
              deletedAt: null,
              endsAt: { gt: now },
              status: { in: [EventStatus.PUBLISHED, EventStatus.ONGOING] },
            },
          },
        ],
      },
      include: {
        sponsor: { include: { sponsorProfile: true } },
      },
    });

    if (!ad) {
      throw new NotFoundException('Ad not found or inactive');
    }

    return this.mapToDto(ad);
  }

  private mapToDto(ad: any): SponsorAdResponseDto {
    return {
      id: ad.id,
      sponsorId: ad.sponsorId,
      eventId: ad.eventId,
      title: ad.title,
      description: ad.description,
      imageUrl: ad.imageUrl,
      destinationUrl: ad.destinationUrl,
      placement: ad.placement,
      status: ad.status,
      rejectionReason: ad.rejectionReason,
      reviewedByUserId: ad.reviewedByUserId,
      reviewedAt: ad.reviewedAt,
      startsAt: ad.startsAt,
      endsAt: ad.endsAt,
      sponsor: ad.sponsor?.sponsorProfile
        ? {
            companyName: ad.sponsor.sponsorProfile.companyName,
            logoUrl: ad.sponsor.sponsorProfile.logoUrl,
          }
        : undefined,
      createdAt: ad.createdAt,
      updatedAt: ad.updatedAt,
    };
  }
}
