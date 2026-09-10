import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
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
      where: { email: normalizedEmail, deletedAt: null },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email address already exists');
    }

    if (dto.phone) {
      const existingPhone = await this.prisma.user.findFirst({
        where: { phone: dto.phone.trim(), deletedAt: null },
      });
      if (existingPhone) {
        throw new ConflictException('An account with this phone number already exists');
      }
    }

    // 2. Validate role
    const roleRecord = await this.prisma.role.findUnique({
      where: { name: dto.role },
    });

    if (!roleRecord) {
      throw new BadRequestException(`Role '${dto.role}' is not configured in the system`);
    }

    // 3. Hash password
    const passwordHash = await this.passwordService.hash(dto.password);

    // 4. Initial account status
    const initialStatus = AccountStatus.PENDING;

    // 5. Atomic transaction: User + UserRole + OTP Challenge + Outbox Event
    const result = await this.prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          phone: dto.phone?.trim() || null,
          passwordHash,
          status: initialStatus,
        },
      });

      // Assign role
      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: roleRecord.id,
        },
      });

      return user;
    });

    // 6. Create OTP challenge & queue email
    const otpResult = await this.otpService.createChallenge(
      normalizedEmail,
      OtpPurpose.EMAIL_VERIFICATION,
      result.id,
    );

    // Atomic outbox event for reliable email delivery
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

    // Queue email dispatch job
    await this.queueService.addJob(QUEUE_NAMES.EMAIL, 'send-otp-email', {
      to: normalizedEmail,
      subject: 'Verify your INOVENT account',
      html: `<p>Your INOVENT verification code is: <strong>${otpResult.code}</strong>. It expires in 5 minutes.</p>`,
    });

    await this.auditService.log({
      actorUserId: result.id,
      action: 'USER_REGISTERED',
      resourceType: 'user',
      resourceId: result.id,
      metadata: { role: dto.role },
      ipAddress,
      userAgent,
    });

    return {
      message:
        'Registration successful. A 6-digit verification code has been dispatched to your email.',
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

    const user = await this.prisma.user.findFirst({
      where: { email: normalizedEmail, deletedAt: null },
    });

    // Generate OTP
    const otpResult = await this.otpService.createChallenge(normalizedEmail, dto.purpose, user?.id);

    // Enqueue outbox & email queue
    await this.queueService.addJob(QUEUE_NAMES.EMAIL, 'send-otp-email', {
      to: normalizedEmail,
      subject: `Your INOVENT code for ${dto.purpose.replace(/_/g, ' ').toLowerCase()}`,
      html: `<p>Your verification code is: <strong>${otpResult.code}</strong>. It expires in 5 minutes.</p>`,
    });

    return {
      success: true,
      message: 'If the account exists, a verification code has been sent.',
    };
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

    // 1. Verify OTP
    await this.otpService.verifyChallenge(
      normalizedEmail,
      dto.code,
      OtpPurpose.PASSWORD_RESET,
      ipAddress,
      userAgent,
    );

    // 2. Fetch user
    const user = await this.prisma.user.findFirst({
      where: { email: normalizedEmail, deletedAt: null },
    });

    if (!user) {
      throw new BadRequestException('User account not found');
    }

    // 3. Validate new password
    if (!this.passwordService.validateStrength(dto.newPassword)) {
      throw new BadRequestException(
        'New password must be at least 8 characters and contain both letters and numbers',
      );
    }

    // 4. Update password
    const newPasswordHash = await this.passwordService.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    // 5. Invalidate all existing refresh sessions for this user
    await this.tokenService.revokeAllUserSessions(user.id);

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
