import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { EventAuthorizationService } from '../../events/services/event-authorization.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { TokenService } from '../../auth/services/token.service';
import { PasswordService } from '../../auth/services/password.service';
import { CryptoUtil } from '../../../common/utils/crypto.util';
import { AccountStatus, InvitationStatus } from '@prisma/client';
import { CreateInvitationDto } from '../dto/create-invitation.dto';
import { AcceptInvitationDto } from '../dto/accept-invitation.dto';
import {
  InvitationDetailsDto,
  CreatedInvitationResponseDto,
  AcceptedInvitationResponseDto,
} from '../dto/invitation-response.dto';

@Injectable()
export class OrganizerInvitationsService {
  private readonly logger = new Logger(OrganizerInvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventAuth: EventAuthorizationService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    private readonly tokenService: TokenService,
    private readonly passwordService: PasswordService,
  ) {}

  /**
   * Creates a single-use, time-limited organizer invitation for an event.
   * Only the EVENT_OWNER of this event or an ADMIN may invite organizers.
   */
  async createInvitation(
    eventId: string,
    ownerUserId: string,
    ownerRoles: string[],
    dto: CreateInvitationDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<CreatedInvitationResponseDto> {
    const event = await this.eventAuth.assertCanInviteOrganizer(ownerUserId, ownerRoles, eventId);
    const normalizedEmail = dto.email.trim().toLowerCase();

    // 1. Invalidate any existing pending invitation for this event and email
    await this.prisma.organizerInvitation.updateMany({
      where: {
        eventId,
        email: normalizedEmail,
        status: InvitationStatus.PENDING,
      },
      data: {
        status: InvitationStatus.REVOKED,
        revokedAt: new Date(),
      },
    });

    // 2. Generate 256-bit cryptographically secure token and its SHA-256 fingerprint
    const rawToken = CryptoUtil.generateRandomToken(32);
    const tokenHash = CryptoUtil.sha256(rawToken);

    const days = dto.expiresDays && dto.expiresDays > 0 ? dto.expiresDays : 7;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    // 3. Persist invitation atomically with outbox event
    const invitation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organizerInvitation.create({
        data: {
          eventId,
          eventOwnerId: ownerUserId,
          email: normalizedEmail,
          tokenHash,
          status: InvitationStatus.PENDING,
          expiresAt,
        },
      });

      const invitationUrl = `https://innovent.app/invitations/accept?token=${rawToken}`;

      await this.outboxService.enqueue(
        {
          eventType: 'ORGANIZER_INVITATION_CREATED',
          aggregateType: 'OrganizerInvitation',
          aggregateId: created.id,
          payload: {
            invitationId: created.id,
            email: normalizedEmail,
            eventId,
            eventName: event.name,
            inviterName: event.ownerId,
            invitationLink: invitationUrl,
            expiresAt: expiresAt.toISOString(),
          },
        },
        tx,
      );

      return created;
    });

    await this.auditService.log({
      actorUserId: ownerUserId,
      action: 'ORGANIZER_INVITATION_CREATED',
      resourceType: 'organizer_invitation',
      resourceId: invitation.id,
      metadata: {
        eventId,
        email: normalizedEmail,
        expiresAt: expiresAt.toISOString(),
      },
      ipAddress,
      userAgent,
    });

    this.logger.log(`Organizer invitation created for ${normalizedEmail} on event ${eventId}`);

    const invitationDetails: InvitationDetailsDto = {
      id: invitation.id,
      eventId: invitation.eventId,
      email: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
      acceptedAt: null,
      revokedAt: null,
      createdAt: invitation.createdAt.toISOString(),
    };

    return {
      invitation: invitationDetails,
      token: rawToken,
      invitationUrl: `https://innovent.app/invitations/accept?token=${rawToken}`,
    };
  }

  /**
   * Lists all organizer invitations for an event (excludes token hash)
   */
  async listInvitations(
    eventId: string,
    userId: string,
    userRoles: string[],
  ): Promise<InvitationDetailsDto[]> {
    await this.eventAuth.assertCanInviteOrganizer(userId, userRoles, eventId);

    const list = await this.prisma.organizerInvitation.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
    });

    return list.map((inv) => ({
      id: inv.id,
      eventId: inv.eventId,
      email: inv.email,
      status: inv.status,
      expiresAt: inv.expiresAt.toISOString(),
      acceptedAt: inv.acceptedAt ? inv.acceptedAt.toISOString() : null,
      revokedAt: inv.revokedAt ? inv.revokedAt.toISOString() : null,
      createdAt: inv.createdAt.toISOString(),
    }));
  }

  /**
   * Revokes an active organizer invitation
   */
  async revokeInvitation(
    invitationId: string,
    userId: string,
    userRoles: string[],
    ipAddress?: string,
    userAgent?: string,
  ): Promise<InvitationDetailsDto> {
    const invitation = await this.prisma.organizerInvitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    await this.eventAuth.assertCanInviteOrganizer(userId, userRoles, invitation.eventId);

    if (invitation.status === InvitationStatus.REVOKED) {
      throw new BadRequestException('Invitation is already revoked');
    }

    if (invitation.status === InvitationStatus.ACCEPTED) {
      throw new BadRequestException('Invitation has already been accepted and cannot be revoked');
    }

    const updated = await this.prisma.organizerInvitation.update({
      where: { id: invitationId },
      data: {
        status: InvitationStatus.REVOKED,
        revokedAt: new Date(),
      },
    });

    await this.auditService.log({
      actorUserId: userId,
      action: 'ORGANIZER_INVITATION_REVOKED',
      resourceType: 'organizer_invitation',
      resourceId: invitation.id,
      metadata: { eventId: invitation.eventId, email: invitation.email },
      ipAddress,
      userAgent,
    });

    this.logger.log(`Invitation ${invitationId} revoked by user ${userId}`);

    return {
      id: updated.id,
      eventId: updated.eventId,
      email: updated.email,
      status: updated.status,
      expiresAt: updated.expiresAt.toISOString(),
      acceptedAt: updated.acceptedAt ? updated.acceptedAt.toISOString() : null,
      revokedAt: updated.revokedAt ? updated.revokedAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  /**
   * Accepts an organizer invitation token atomically.
   * Creates/links user, assigns ORGANIZER role, creates EventOrganizer relation, marks token ACCEPTED.
   */
  async acceptInvitation(
    dto: AcceptInvitationDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AcceptedInvitationResponseDto> {
    const tokenHash = CryptoUtil.sha256(dto.token.trim());

    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.organizerInvitation.findUnique({
        where: { tokenHash },
      });

      if (!invitation) {
        throw new BadRequestException('Invalid or unknown invitation token');
      }

      if (invitation.status === InvitationStatus.REVOKED) {
        throw new BadRequestException('This invitation has been revoked');
      }

      if (invitation.status === InvitationStatus.ACCEPTED) {
        throw new BadRequestException('This invitation has already been accepted');
      }

      if (invitation.status === InvitationStatus.EXPIRED || invitation.expiresAt < new Date()) {
        await tx.organizerInvitation.update({
          where: { id: invitation.id },
          data: { status: InvitationStatus.EXPIRED },
        });
        throw new BadRequestException('This invitation token has expired');
      }

      // Check event existence and status
      const event = await tx.event.findFirst({
        where: { id: invitation.eventId, deletedAt: null },
      });

      if (!event) {
        throw new NotFoundException('The associated event is no longer available');
      }

      // Role check: retrieve ORGANIZER system role
      const organizerRole = await tx.role.findUnique({
        where: { name: 'ORGANIZER' },
      });

      if (!organizerRole) {
        throw new BadRequestException('System configuration error: ORGANIZER role not found');
      }

      let userId: string;
      const existingUser = await tx.user.findFirst({
        where: { email: invitation.email, deletedAt: null },
        include: { userRoles: { include: { role: true } } },
      });

      if (existingUser) {
        if (
          existingUser.status === AccountStatus.DEACTIVATED ||
          existingUser.status === AccountStatus.SUSPENDED
        ) {
          throw new ForbiddenException('Account is suspended or deactivated');
        }

        userId = existingUser.id;

        // Ensure user has ORGANIZER role
        const hasOrganizerRole = existingUser.userRoles.some((ur) => ur.role.name === 'ORGANIZER');
        if (!hasOrganizerRole) {
          await tx.userRole.create({
            data: {
              userId,
              roleId: organizerRole.id,
            },
          });
        }
      } else {
        // Must provide password for new account creation
        if (!dto.password) {
          throw new BadRequestException('Password is required to create your organizer account');
        }

        const passwordHash = await this.passwordService.hash(dto.password);

        const newUser = await tx.user.create({
          data: {
            email: invitation.email,
            phone: dto.phone?.trim() || null,
            passwordHash,
            status: AccountStatus.ACTIVE, // Pre-approved through verified invitation
            emailVerifiedAt: new Date(),
          },
        });

        userId = newUser.id;

        // Assign ORGANIZER role
        await tx.userRole.create({
          data: {
            userId,
            roleId: organizerRole.id,
          },
        });

        // Create Organizer profile
        await tx.organizerProfile.create({
          data: {
            userId,
            firstName: dto.firstName?.trim() || 'Organizer',
            lastName: dto.lastName?.trim() || 'User',
            phone: dto.phone?.trim() || null,
          },
        });
      }

      // Create event-scoped EventOrganizer assignment
      await tx.eventOrganizer.upsert({
        where: {
          eventId_userId: {
            eventId: invitation.eventId,
            userId,
          },
        },
        create: {
          eventId: invitation.eventId,
          userId,
          assignedBy: invitation.eventOwnerId,
        },
        update: {},
      });

      // Mark invitation accepted
      const acceptedAt = new Date();
      await tx.organizerInvitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.ACCEPTED,
          acceptedAt,
          acceptedByUserId: userId,
        },
      });

      // Emit outbox notification to event owner
      await this.outboxService.enqueue(
        {
          eventType: 'ORGANIZER_INVITATION_ACCEPTED',
          aggregateType: 'OrganizerInvitation',
          aggregateId: invitation.id,
          payload: {
            invitationId: invitation.id,
            eventId: invitation.eventId,
            eventName: event.name,
            eventOwnerId: invitation.eventOwnerId,
            organizerEmail: invitation.email,
            acceptedAt: acceptedAt.toISOString(),
          },
        },
        tx,
      );

      await this.auditService.log({
        actorUserId: userId,
        action: 'ORGANIZER_INVITATION_ACCEPTED',
        resourceType: 'organizer_invitation',
        resourceId: invitation.id,
        metadata: {
          eventId: invitation.eventId,
          email: invitation.email,
        },
        ipAddress,
        userAgent,
      });

      this.logger.log(`Organizer invitation ${invitation.id} accepted by user ${userId}`);

      // Issue JWT session tokens for seamless login
      const updatedUser = await tx.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: { include: { permission: true } },
                },
              },
            },
          },
        },
      });

      let accessToken: string | undefined;
      let refreshToken: string | undefined;

      if (updatedUser) {
        const roles = updatedUser.userRoles.map((ur) => ur.role.name);
        const permissions = Array.from(
          new Set(
            updatedUser.userRoles.flatMap((ur) =>
              ur.role.rolePermissions.map(
                (rp) => `${rp.permission.action}:${rp.permission.resource}`,
              ),
            ),
          ),
        );

        const tokens = await this.tokenService.generateTokens(
          updatedUser.id,
          updatedUser.email,
          roles,
          permissions,
        );

        accessToken = tokens.accessToken;
        refreshToken = tokens.refreshToken;
      }

      return {
        success: true,
        message: 'Organizer invitation accepted successfully',
        userId,
        eventId: invitation.eventId,
        accessToken,
        refreshToken,
      };
    });
  }
}
