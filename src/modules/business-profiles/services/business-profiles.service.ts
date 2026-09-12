import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AccountStatus } from '@prisma/client';
import {
  OwnProfileDto,
  PublicBusinessProfileDto,
  PublicUserProfileDto,
} from '../dto/profile-response.dto';

@Injectable()
export class BusinessProfilesService {
  private readonly logger = new Logger(BusinessProfilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Retrieves full profile of the currently authenticated user
   */
  async getOwnProfile(userId: string): Promise<OwnProfileDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        userRoles: { include: { role: true } },
        attendeeProfile: true,
        sponsorProfile: true,
        vendorProfile: true,
        providerProfile: true,
        eventOwnerProfile: true,
        organizerProfile: true,
        mediaProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const roles = user.userRoles.map((ur) => ur.role.name);
    const activeProfile =
      user.sponsorProfile ||
      user.vendorProfile ||
      user.providerProfile ||
      user.eventOwnerProfile ||
      user.organizerProfile ||
      user.mediaProfile ||
      user.attendeeProfile ||
      null;

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      status: user.status,
      roles,
      emailVerified: user.emailVerifiedAt !== null,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      profile: activeProfile as Record<string, unknown> | null,
    };
  }

  /**
   * Updates the profile of the currently authenticated user based on their primary role
   */
  async updateOwnProfile(
    userId: string,
    updateData: Record<string, unknown>,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<OwnProfileDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        userRoles: { include: { role: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const roles = user.userRoles.map((ur) => ur.role.name);
    const primaryRole = roles[0] || 'ATTENDEE';

    // Prevent passing unauthorized keys
    const sanitized = { ...updateData };
    delete (sanitized as Record<string, unknown>).id;
    delete (sanitized as Record<string, unknown>).userId;
    delete (sanitized as Record<string, unknown>).createdAt;
    delete (sanitized as Record<string, unknown>).updatedAt;
    delete (sanitized as Record<string, unknown>).deletedAt;

    if (roles.includes('SPONSOR')) {
      await this.prisma.sponsorProfile.upsert({
        where: { userId },
        create: {
          userId,
          companyName: (sanitized.companyName as string) || 'Business Name',
          ...sanitized,
        },
        update: sanitized,
      });
    } else if (roles.includes('VENDOR')) {
      await this.prisma.vendorProfile.upsert({
        where: { userId },
        create: {
          userId,
          companyName: (sanitized.companyName as string) || 'Vendor Business',
          serviceCategory: (sanitized.serviceCategory as string) || 'General',
          ...sanitized,
        },
        update: sanitized,
      });
    } else if (roles.includes('PROVIDER')) {
      await this.prisma.providerProfile.upsert({
        where: { userId },
        create: {
          userId,
          businessName: (sanitized.businessName as string) || 'Provider Service',
          providerType: (sanitized.providerType as string) || 'Service',
          ...sanitized,
        },
        update: sanitized,
      });
    } else if (roles.includes('EVENT_OWNER')) {
      await this.prisma.eventOwnerProfile.upsert({
        where: { userId },
        create: {
          userId,
          organizationName: (sanitized.organizationName as string) || 'Event Organization',
          ...sanitized,
        },
        update: sanitized,
      });
    } else if (roles.includes('ORGANIZER')) {
      await this.prisma.organizerProfile.upsert({
        where: { userId },
        create: {
          userId,
          firstName: (sanitized.firstName as string) || 'Organizer',
          lastName: (sanitized.lastName as string) || 'User',
          ...sanitized,
        },
        update: sanitized,
      });
    } else if (roles.includes('MEDIA')) {
      await this.prisma.mediaProfile.upsert({
        where: { userId },
        create: {
          userId,
          mediaOutlet: (sanitized.mediaOutlet as string) || 'Media Outlet',
          ...sanitized,
        },
        update: sanitized,
      });
    } else {
      // ATTENDEE or default
      await this.prisma.attendeeProfile.upsert({
        where: { userId },
        create: {
          userId,
          firstName: (sanitized.firstName as string) || 'Attendee',
          lastName: (sanitized.lastName as string) || 'User',
          ...sanitized,
        },
        update: sanitized,
      });
    }

    await this.auditService.log({
      actorUserId: userId,
      action: 'BUSINESS_PROFILE_UPDATED',
      resourceType: 'business_profile',
      resourceId: userId,
      metadata: { role: primaryRole },
      ipAddress,
      userAgent,
    });

    this.logger.log(`User ${userId} (${primaryRole}) updated profile successfully`);
    return this.getOwnProfile(userId);
  }

  /**
   * Retrieves a public-safe business profile.
   * Enforces: Account must be ACTIVE and not deleted.
   * Strips all sensitive identity, authentication, phone, and verification metadata.
   */
  async getPublicBusiness(businessId: string): Promise<PublicBusinessProfileDto> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: businessId,
        status: AccountStatus.ACTIVE,
        deletedAt: null,
      },
      include: {
        userRoles: { include: { role: true } },
        sponsorProfile: true,
        vendorProfile: true,
        providerProfile: true,
        eventOwnerProfile: true,
        mediaProfile: true,
      },
    });

    if (!user) {
      // 404 anti-enumeration for non-active, suspended, or non-existent accounts
      throw new NotFoundException('Business not found');
    }

    const roles = user.userRoles.map((ur) => ur.role.name);
    const isBusiness = roles.some((r) =>
      ['SPONSOR', 'VENDOR', 'PROVIDER', 'EVENT_OWNER', 'MEDIA'].includes(r),
    );

    if (!isBusiness) {
      throw new NotFoundException('Business not found');
    }

    if (user.sponsorProfile) {
      return {
        id: user.id,
        role: 'SPONSOR',
        name: user.sponsorProfile.companyName,
        logoUrl: user.sponsorProfile.logoUrl,
        website: user.sponsorProfile.website,
        description: user.sponsorProfile.description,
        category: user.sponsorProfile.industry,
        city: user.sponsorProfile.city,
        country: user.sponsorProfile.country,
        tags: user.sponsorProfile.tier ? [user.sponsorProfile.tier] : [],
        createdAt: user.sponsorProfile.createdAt.toISOString(),
      };
    }

    if (user.vendorProfile) {
      return {
        id: user.id,
        role: 'VENDOR',
        name: user.vendorProfile.companyName,
        logoUrl: user.vendorProfile.logoUrl,
        website: user.vendorProfile.website,
        description: user.vendorProfile.description,
        category: user.vendorProfile.serviceCategory,
        city: user.vendorProfile.city,
        country: user.vendorProfile.country,
        createdAt: user.vendorProfile.createdAt.toISOString(),
      };
    }

    if (user.providerProfile) {
      return {
        id: user.id,
        role: 'PROVIDER',
        name: user.providerProfile.businessName,
        logoUrl: user.providerProfile.logoUrl,
        website: user.providerProfile.website,
        description: user.providerProfile.description,
        category: user.providerProfile.providerType,
        city: user.providerProfile.city,
        country: user.providerProfile.country,
        tags: user.providerProfile.skills,
        createdAt: user.providerProfile.createdAt.toISOString(),
      };
    }

    if (user.eventOwnerProfile) {
      return {
        id: user.id,
        role: 'EVENT_OWNER',
        name: user.eventOwnerProfile.organizationName,
        logoUrl: user.eventOwnerProfile.logoUrl,
        website: user.eventOwnerProfile.website,
        description: user.eventOwnerProfile.description,
        city: user.eventOwnerProfile.city,
        country: user.eventOwnerProfile.country,
        createdAt: user.eventOwnerProfile.createdAt.toISOString(),
      };
    }

    if (user.mediaProfile) {
      return {
        id: user.id,
        role: 'MEDIA',
        name: user.mediaProfile.mediaOutlet,
        logoUrl: user.mediaProfile.logoUrl,
        website: user.mediaProfile.website,
        category: user.mediaProfile.outletType,
        tags: user.mediaProfile.coverageInterests,
        createdAt: user.mediaProfile.createdAt.toISOString(),
      };
    }

    throw new NotFoundException('Business not found');
  }

  /**
   * Retrieves a public-safe user profile (Attendee / Organizer).
   * Enforces: Account must be ACTIVE and not deleted.
   * Strips all private contact, phone, email, and authentication metadata.
   */
  async getPublicUser(userId: string): Promise<PublicUserProfileDto> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        status: AccountStatus.ACTIVE,
        deletedAt: null,
      },
      include: {
        attendeeProfile: true,
        organizerProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.attendeeProfile) {
      return {
        id: user.id,
        firstName: user.attendeeProfile.firstName,
        lastName: user.attendeeProfile.lastName,
        avatarUrl: user.attendeeProfile.avatarUrl,
        bio: user.attendeeProfile.bio,
        jobTitle: user.attendeeProfile.jobTitle,
        company: user.attendeeProfile.company,
        city: user.attendeeProfile.city,
        country: user.attendeeProfile.country,
        interests: user.attendeeProfile.interests,
        createdAt: user.attendeeProfile.createdAt.toISOString(),
      };
    }

    if (user.organizerProfile) {
      return {
        id: user.id,
        firstName: user.organizerProfile.firstName,
        lastName: user.organizerProfile.lastName,
        avatarUrl: user.organizerProfile.avatarUrl,
        jobTitle: user.organizerProfile.jobTitle,
        company: user.organizerProfile.organization,
        createdAt: user.organizerProfile.createdAt.toISOString(),
      };
    }

    // Default safe fallback if profile table record not yet populated
    return {
      id: user.id,
      firstName: 'INOVENT',
      lastName: 'Member',
      createdAt: user.createdAt.toISOString(),
    };
  }
}
