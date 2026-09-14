import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { AccountStatus, OtpPurpose } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { QueueService } from '../../../infrastructure/queue/queue.service';
import { QUEUE_NAMES } from '../../../infrastructure/queue/queue.constants';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { OtpService } from './otp.service';
import { AUTH_EVENTS } from '../constants/auth.constants';
import { RegisterDto, AllowedRegistrationRole } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { RequestOtpDto, VerifyOtpDto } from '../dto/otp.dto';
import { RefreshDto } from '../dto/refresh.dto';
import { RequestPasswordResetDto, ConfirmPasswordResetDto } from '../dto/password-reset.dto';
import { AuthResponseDto, AuthTokensDto, SafeUserDto } from '../dto/auth-response.dto';
import { RegisterBusinessDto, AllowedBusinessRegistrationRole } from '../dto/register-business.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly otpService: OtpService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Registers a new user account with transaction-safe OTP and Outbox event
   */
  async register(
    dto: RegisterDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ message: string; email: string }> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // 1. Check if user already exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        deletedAt: null,
      },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email address already exists');
    }

    if (dto.phone) {
      const normalizedPhone = dto.phone.trim();

      const existingPhone = await this.prisma.user.findFirst({
        where: {
          phone: normalizedPhone,
          deletedAt: null,
        },
      });

      if (existingPhone) {
        throw new ConflictException('An account with this phone number already exists');
      }
    }

    // 2. Validate role

    const roleRecord = await this.prisma.role.findUnique({
      where: { name: 'ATTENDEE' },
    });

    if (!roleRecord) {
      throw new InternalServerErrorException('ATTENDEE role is not configured in the system');
    }
    // 3. Hash password
    const passwordHash = await this.passwordService.hash(dto.password);

    // 4. Initial account status
    const initialStatus = AccountStatus.PENDING;

    // 5. Create User + ATTENDEE role + profile atomically
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          phone: dto.phone?.trim() || null,
          passwordHash,
          status: initialStatus,
        },
      });

      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: roleRecord.id,
        },
      });

      await tx.attendeeProfile.create({
        data: {
          userId: user.id,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
        },
      });

      return user;
    });

    // 6. Create OTP challenge
    const otpResult = await this.otpService.createChallenge(
      normalizedEmail,
      OtpPurpose.EMAIL_VERIFICATION,
      result.id,
    );

    // 7. Store outbox event
    await this.outboxService.enqueue({
      eventType: 'EMAIL_VERIFICATION_REQUESTED',
      aggregateType: 'User',
      aggregateId: result.id,
      payload: {
        to: normalizedEmail,
        code: otpResult.code,
        purpose: 'EMAIL_VERIFICATION',
      },
    });

    // 8. Queue email
    await this.queueService.addJob(QUEUE_NAMES.EMAIL, 'send-otp-email', {
      to: normalizedEmail,
      subject: 'Verify your INOVENT account',
      html: `<p>Your INOVENT verification code is: <strong>${otpResult.code}</strong>. It expires in 5 minutes.</p>`,
    });

    // 9. Audit
    await this.auditService.log({
      actorUserId: result.id,
      action: 'USER_REGISTERED',
      resourceType: 'user',
      resourceId: result.id,
      metadata: {
        role: 'ATTENDEE',
      },
      ipAddress,
      userAgent,
    });

    return {
      message:
        'Registration successful. A 6-digit verification code has been dispatched to your email.',
      email: normalizedEmail,
    };
  }

  async registerBusiness(
    dto: RegisterBusinessDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ message: string; email: string }> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const normalizedPhone = dto.phone?.trim() || null;

    // 1. Check duplicate email
    const existingUser = await this.prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        deletedAt: null,
      },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email address already exists');
    }

    // 2. Check duplicate phone
    if (normalizedPhone) {
      const existingPhone = await this.prisma.user.findFirst({
        where: {
          phone: normalizedPhone,
          deletedAt: null,
        },
      });

      if (existingPhone) {
        throw new ConflictException('An account with this phone number already exists');
      }
    }

    // 3. Find requested business role
    const roleRecord = await this.prisma.role.findUnique({
      where: {
        name: dto.role,
      },
    });

    if (!roleRecord) {
      throw new InternalServerErrorException(`${dto.role} role is not configured in the system`);
    }

    // 4. Hash password
    const passwordHash = await this.passwordService.hash(dto.password);

    // Business accounts remain PENDING until admin approval
    const initialStatus = AccountStatus.PENDING;

    // 5. Create User + Role + correct Business Profile atomically
    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          phone: normalizedPhone,
          passwordHash,
          status: initialStatus,
        },
      });

      await tx.userRole.create({
        data: {
          userId: createdUser.id,
          roleId: roleRecord.id,
        },
      });

      switch (dto.role) {
        case AllowedBusinessRegistrationRole.SPONSOR: {
          if (!dto.companyName) {
            throw new BadRequestException('Company name is required for Sponsor registration');
          }

          await tx.sponsorProfile.create({
            data: {
              userId: createdUser.id,
              companyName: dto.companyName.trim(),
              contactName: dto.contactName?.trim() || null,
              contactEmail: normalizedEmail,
              contactPhone: normalizedPhone,
              website: dto.website?.trim() || null,
              description: dto.description?.trim() || null,
              city: dto.city?.trim() || null,
              country: dto.country?.trim() || null,
            },
          });

          break;
        }

        case AllowedBusinessRegistrationRole.VENDOR: {
          if (!dto.companyName || !dto.serviceCategory) {
            throw new BadRequestException(
              'Company name and service category are required for Vendor registration',
            );
          }

          await tx.vendorProfile.create({
            data: {
              userId: createdUser.id,
              companyName: dto.companyName.trim(),
              serviceCategory: dto.serviceCategory.trim(),
              contactName: dto.contactName?.trim() || null,
              contactEmail: normalizedEmail,
              contactPhone: normalizedPhone,
              website: dto.website?.trim() || null,
              description: dto.description?.trim() || null,
              city: dto.city?.trim() || null,
              country: dto.country?.trim() || null,
            },
          });

          break;
        }

        case AllowedBusinessRegistrationRole.PROVIDER: {
          if (!dto.businessName || !dto.providerType) {
            throw new BadRequestException(
              'Business name and provider type are required for Provider registration',
            );
          }

          await tx.providerProfile.create({
            data: {
              userId: createdUser.id,
              businessName: dto.businessName.trim(),
              providerType: dto.providerType.trim(),
              contactName: dto.contactName?.trim() || null,
              contactEmail: normalizedEmail,
              contactPhone: normalizedPhone,
              website: dto.website?.trim() || null,
              description: dto.description?.trim() || null,
              city: dto.city?.trim() || null,
              country: dto.country?.trim() || null,
            },
          });

          break;
        }

        case AllowedBusinessRegistrationRole.EVENT_OWNER: {
          if (!dto.organizationName) {
            throw new BadRequestException(
              'Organization name is required for Event Owner registration',
            );
          }

          await tx.eventOwnerProfile.create({
            data: {
              userId: createdUser.id,
              organizationName: dto.organizationName.trim(),
              contactName: dto.contactName?.trim() || null,
              contactEmail: normalizedEmail,
              contactPhone: normalizedPhone,
              website: dto.website?.trim() || null,
              description: dto.description?.trim() || null,
              city: dto.city?.trim() || null,
              country: dto.country?.trim() || null,
            },
          });

          break;
        }

        case AllowedBusinessRegistrationRole.MEDIA: {
          if (!dto.mediaOutlet) {
            throw new BadRequestException('Media outlet is required for Media registration');
          }

          await tx.mediaProfile.create({
            data: {
              userId: createdUser.id,
              mediaOutlet: dto.mediaOutlet.trim(),
              contactName: dto.contactName?.trim() || null,
              contactEmail: normalizedEmail,
              contactPhone: normalizedPhone,
              website: dto.website?.trim() || null,
            },
          });

          break;
        }

        default:
          throw new BadRequestException('Invalid business registration role');
      }

      return createdUser;
    });

    // 6. Create email verification OTP
    const otpResult = await this.otpService.createChallenge(
      normalizedEmail,
      OtpPurpose.EMAIL_VERIFICATION,
      user.id,
    );

    // 7. Create outbox event
    await this.outboxService.enqueue({
      eventType: 'EMAIL_VERIFICATION_REQUESTED',
      aggregateType: 'User',
      aggregateId: user.id,
      payload: {
        to: normalizedEmail,
        code: otpResult.code,
        purpose: 'EMAIL_VERIFICATION',
      },
    });

    // 8. Send verification email
    await this.queueService.addJob(QUEUE_NAMES.EMAIL, 'send-otp-email', {
      to: normalizedEmail,
      subject: 'Verify your INOVENT business account',
      html: `<p>Your INOVENT verification code is: <strong>${otpResult.code}</strong>. It expires in 5 minutes.</p>`,
    });

    // 9. Audit
    await this.auditService.log({
      actorUserId: user.id,
      action: 'BUSINESS_USER_REGISTERED',
      resourceType: 'user',
      resourceId: user.id,
      metadata: {
        role: dto.role,
      },
      ipAddress,
      userAgent,
    });

    return {
      message:
        'Business registration successful. A 6-digit verification code has been dispatched to your email. Your account will require administrative approval after email verification.',
      email: normalizedEmail,
    };
  }

  /**
   * Verifies OTP challenge and transitions account status according to role rules
   */
  async verifyOtp(
    dto: VerifyOtpDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // 1. Verify OTP challenge
    await this.otpService.verifyChallenge(
      normalizedEmail,
      dto.code,
      dto.purpose,
      ipAddress,
      userAgent,
    );

    // 2. If email verification, activate Attendee or set emailVerifiedAt
    if (dto.purpose === OtpPurpose.EMAIL_VERIFICATION) {
      const user = await this.prisma.user.findFirst({
        where: { email: normalizedEmail, deletedAt: null },
        include: { userRoles: { include: { role: true } } },
      });

      if (user) {
        const isAttendee = user.userRoles.some(
          (ur) => ur.role.name === AllowedRegistrationRole.ATTENDEE,
        );

        // Attendees become ACTIVE upon email verification; business roles remain PENDING awaiting admin review
        const newStatus =
          isAttendee && user.status === AccountStatus.PENDING ? AccountStatus.ACTIVE : user.status;

        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            emailVerifiedAt: new Date(),
            status: newStatus,
          },
        });
      }
    }

    return {
      success: true,
      message: 'Verification code validated successfully.',
    };
  }

  /**
   * Requests a new OTP challenge
   */
  async requestOtp(
    dto: RequestOtpDto,
    _ipAddress?: string,
    _userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const genericResponse = {
      success: true,
      message: 'If the account exists, a verification code has been sent.',
    };

    const user = await this.prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        deletedAt: null,
      },
    });

    // EMAIL VERIFICATION rules
    if (dto.purpose === OtpPurpose.EMAIL_VERIFICATION) {
      // Do not reveal whether the account exists
      if (!user) {
        return genericResponse;
      }

      // Already verified → don't generate/send another OTP
      if (user.emailVerifiedAt) {
        return genericResponse;
      }
    }

    // Generate OTP only when appropriate
    const otpResult = await this.otpService.createChallenge(normalizedEmail, dto.purpose, user?.id);

    await this.queueService.addJob(QUEUE_NAMES.EMAIL, 'send-otp-email', {
      to: normalizedEmail,
      subject: `Your INOVENT code for ${dto.purpose.replace(/_/g, ' ').toLowerCase()}`,
      html: `<p>Your verification code is: <strong>${otpResult.code}</strong>. It expires in 5 minutes.</p>`,
    });

    return genericResponse;
  }

  /**
   * Authenticates user, enforces lifecycle status rules, and generates JWT credentials
   */
  async login(dto: LoginDto, ipAddress?: string, userAgent?: string): Promise<AuthResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // 1. Fetch user by email
    const user = await this.prisma.user.findFirst({
      where: { email: normalizedEmail, deletedAt: null },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    // Generic response to mitigate account enumeration
    if (!user) {
      await this.auditService.log({
        action: AUTH_EVENTS.LOGIN_FAILURE,
        resourceType: 'auth:login',
        metadata: { email: normalizedEmail, reason: 'User not found' },
        ipAddress,
        userAgent,
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    // 2. Compare password
    const isPasswordValid = await this.passwordService.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      await this.auditService.log({
        actorUserId: user.id,
        action: AUTH_EVENTS.LOGIN_FAILURE,
        resourceType: 'auth:login',
        resourceId: user.id,
        metadata: { reason: 'Password mismatch' },
        ipAddress,
        userAgent,
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    // 3. Enforce lifecycle and account status rules
    if (user.status === AccountStatus.DEACTIVATED) {
      throw new ForbiddenException('Your account has been deactivated. Please contact support.');
    }

    if (user.status === AccountStatus.SUSPENDED) {
      throw new ForbiddenException('Your account has been suspended by moderation.');
    }

    if (user.status === AccountStatus.REJECTED) {
      throw new ForbiddenException('Your account application was reviewed and rejected.');
    }

    // 4. Verify email verification
    if (user.emailVerifiedAt === null) {
      throw new UnauthorizedException(
        'Please verify your email address via OTP before logging in.',
      );
    }

    // 5. Check business role pending approval
    const isAttendee = user.userRoles.some((ur) => ur.role.name === 'ATTENDEE');
    const isAdmin = user.userRoles.some((ur) => ur.role.name === 'ADMIN');

    if (!isAttendee && !isAdmin && user.status === AccountStatus.PENDING) {
      throw new ForbiddenException(
        'Your account email is verified, but your profile is currently pending administrative review.',
      );
    }

    // 6. Update last login timestamp
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // 7. Collect roles and permissions
    const roles = user.userRoles.map((ur) => ur.role.name);
    const permissions = Array.from(
      new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => `${rp.permission.action}:${rp.permission.resource}`),
        ),
      ),
    );

    // 8. Generate JWT token pair
    const tokens = await this.tokenService.generateTokens(user.id, user.email, roles, permissions);

    await this.auditService.log({
      actorUserId: user.id,
      action: AUTH_EVENTS.LOGIN_SUCCESS,
      resourceType: 'auth:login',
      resourceId: user.id,
      ipAddress,
      userAgent,
    });

    const safeUser: SafeUserDto = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      status: user.status,
      roles,
      emailVerified: user.emailVerifiedAt !== null,
      createdAt: user.createdAt.toISOString(),
    };

    return {
      user: safeUser,
      tokens,
    };
  }

  /**
   * Rotates refresh tokens safely with reuse detection
   */
  async refresh(dto: RefreshDto, ipAddress?: string, userAgent?: string): Promise<AuthTokensDto> {
    return this.tokenService.rotateRefreshToken(dto.refreshToken, ipAddress, userAgent);
  }

  /**
   * Logs out user by revoking the refresh token session family
   */
  async logout(
    dto: RefreshDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.tokenService.revokeRefreshToken(dto.refreshToken);

    await this.auditService.log({
      action: AUTH_EVENTS.LOGOUT,
      resourceType: 'auth:logout',
      ipAddress,
      userAgent,
    });

    return {
      success: true,
      message: 'Logged out successfully. Refresh session invalidated.',
    };
  }

  /**
   * Initiates password reset request (anti-enumeration resistant)
   */
  async requestPasswordReset(
    dto: RequestPasswordResetDto,
    _ipAddress?: string,
    _userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: { email: normalizedEmail, deletedAt: null },
    });

    if (user) {
      const otpResult = await this.otpService.createChallenge(
        normalizedEmail,
        OtpPurpose.PASSWORD_RESET,
        user.id,
      );

      await this.outboxService.enqueue({
        eventType: 'PASSWORD_RESET_REQUESTED',
        aggregateType: 'User',
        aggregateId: user.id,
        payload: {
          to: normalizedEmail,
          code: otpResult.code,
          purpose: 'PASSWORD_RESET',
        },
      });

      await this.queueService.addJob(QUEUE_NAMES.EMAIL, 'send-password-reset-email', {
        to: normalizedEmail,
        subject: 'Reset your INOVENT password',
        html: `<p>Your password reset code is: <strong>${otpResult.code}</strong>. It expires in 5 minutes.</p>`,
      });
    }

    return {
      success: true,
      message: 'If an account exists with this email, a password reset code has been sent.',
    };
  }

  /**
   * Confirms password reset with OTP and invalidates all active user sessions
   */
  async confirmPasswordReset(
    dto: ConfirmPasswordResetDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // 1. Verify password-reset OTP
    await this.otpService.verifyChallenge(
      normalizedEmail,
      dto.code,
      OtpPurpose.PASSWORD_RESET,
      ipAddress,
      userAgent,
    );

    // 2. Fetch user
    const user = await this.prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        deletedAt: null,
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired password reset request');
    }

    // 3. Validate password strength
    if (!this.passwordService.validateStrength(dto.newPassword)) {
      throw new BadRequestException(
        'New password must be at least 8 characters and contain both letters and numbers',
      );
    }

    // 4. Prevent reusing the current password
    const isSamePassword = await this.passwordService.compare(dto.newPassword, user.passwordHash);

    if (isSamePassword) {
      throw new BadRequestException('New password must be different from your current password');
    }

    // 5. Hash new password
    const newPasswordHash = await this.passwordService.hash(dto.newPassword);

    // 6. Update password
    await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        passwordHash: newPasswordHash,
      },
    });

    // 7. Revoke ALL sessions:
    // refresh tokens + access tokens
    await this.tokenService.revokeAllUserSessions(user.id);

    // 8. Audit
    await this.auditService.log({
      actorUserId: user.id,
      action: AUTH_EVENTS.PASSWORD_CHANGED,
      resourceType: 'user:password',
      resourceId: user.id,
      ipAddress,
      userAgent,
    });

    return {
      success: true,
      message:
        'Password reset successfully. All previous sessions have been revoked. Please log in with your new password.',
    };
  }
}
