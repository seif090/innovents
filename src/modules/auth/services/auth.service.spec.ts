import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AccountStatus, OtpPurpose } from '@prisma/client';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { OtpService } from './otp.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { QueueService } from '../../../infrastructure/queue/queue.service';
import { PrismaService } from '../../../database/prisma.service';
import { AllowedRegistrationRole } from '../dto/register.dto';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    role: {
      findUnique: jest.Mock;
    };
    userRole: {
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let passwordService: {
    hash: jest.Mock;
    compare: jest.Mock;
    validateStrength: jest.Mock;
  };
  let tokenService: {
    generateTokens: jest.Mock;
    rotateRefreshToken: jest.Mock;
    revokeRefreshToken: jest.Mock;
    revokeAllUserSessions: jest.Mock;
  };
  let otpService: {
    createChallenge: jest.Mock;
    verifyChallenge: jest.Mock;
  };
  let outboxService: {
    enqueue: jest.Mock;
  };
  let queueService: {
    addJob: jest.Mock;
  };
  let auditService: {
    log: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      role: {
        findUnique: jest.fn().mockResolvedValue({ id: 'role-uuid-1', name: 'ATTENDEE' }),
      },
      userRole: {
        create: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(prisma);
      }),
    };

    passwordService = {
      hash: jest.fn().mockResolvedValue('hashed_password_123'),
      compare: jest.fn(),
      validateStrength: jest.fn().mockReturnValue(true),
    };

    tokenService = {
      generateTokens: jest.fn().mockResolvedValue({
        accessToken: 'access_jwt',
        refreshToken: 'refresh_raw',
        expiresIn: '15m',
      }),
      rotateRefreshToken: jest.fn(),
      revokeRefreshToken: jest.fn(),
      revokeAllUserSessions: jest.fn().mockResolvedValue(undefined),
    };

    otpService = {
      createChallenge: jest.fn().mockResolvedValue({
        code: '123456',
        challengeId: 'otp-uuid-1',
      }),
      verifyChallenge: jest.fn().mockResolvedValue(true),
    };

    outboxService = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    };

    queueService = {
      addJob: jest.fn().mockResolvedValue(undefined),
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: PasswordService, useValue: passwordService },
        { provide: TokenService, useValue: tokenService },
        { provide: OtpService, useValue: otpService },
        { provide: OutboxService, useValue: outboxService },
        { provide: QueueService, useValue: queueService },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should register an attendee and enqueue verification email atomically', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-uuid-1',
        email: 'newuser@example.com',
        status: AccountStatus.PENDING,
      });

      const result = await service.register({
        email: 'newuser@example.com',
        password: 'Password123!',
        role: AllowedRegistrationRole.ATTENDEE,
      });

      expect(result.email).toBe('newuser@example.com');
      expect(passwordService.hash).toHaveBeenCalledWith('Password123!');
      expect(otpService.createChallenge).toHaveBeenCalledWith(
        'newuser@example.com',
        OtpPurpose.EMAIL_VERIFICATION,
        'user-uuid-1',
      );
      expect(outboxService.enqueue).toHaveBeenCalled();
      expect(queueService.addJob).toHaveBeenCalled();
    });

    it('should throw ConflictException on duplicate email', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'existing-user' });

      await expect(
        service.register({
          email: 'existing@example.com',
          password: 'Password123!',
          role: AllowedRegistrationRole.ATTENDEE,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should authenticate user and return token pair on valid credentials', async () => {
      const mockDbUser = {
        id: 'user-uuid-1',
        email: 'attendee@example.com',
        phone: '+966501234567',
        passwordHash: 'hashed_password_123',
        status: AccountStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
        userRoles: [
          {
            role: {
              name: 'ATTENDEE',
              rolePermissions: [],
            },
          },
        ],
      };

      prisma.user.findFirst.mockResolvedValue(mockDbUser);
      passwordService.compare.mockResolvedValue(true);

      const result = await service.login({
        email: 'attendee@example.com',
        password: 'Password123!',
      });

      expect(result.tokens.accessToken).toBe('access_jwt');
      expect(result.user.email).toBe('attendee@example.com');
      expect(tokenService.generateTokens).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      const mockDbUser = {
        id: 'user-uuid-1',
        email: 'attendee@example.com',
        passwordHash: 'hashed_password_123',
        status: AccountStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        userRoles: [],
      };

      prisma.user.findFirst.mockResolvedValue(mockDbUser);
      passwordService.compare.mockResolvedValue(false);

      await expect(
        service.login({
          email: 'attendee@example.com',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if email is not verified', async () => {
      const mockDbUser = {
        id: 'user-uuid-1',
        email: 'attendee@example.com',
        passwordHash: 'hashed_password_123',
        status: AccountStatus.PENDING,
        emailVerifiedAt: null, // Unverified!
        userRoles: [{ role: { name: 'ATTENDEE', rolePermissions: [] } }],
      };

      prisma.user.findFirst.mockResolvedValue(mockDbUser);
      passwordService.compare.mockResolvedValue(true);

      await expect(
        service.login({
          email: 'attendee@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException if account is suspended', async () => {
      const mockDbUser = {
        id: 'user-uuid-1',
        email: 'suspended@example.com',
        passwordHash: 'hashed_password_123',
        status: AccountStatus.SUSPENDED,
        emailVerifiedAt: new Date(),
        userRoles: [],
      };

      prisma.user.findFirst.mockResolvedValue(mockDbUser);
      passwordService.compare.mockResolvedValue(true);

      await expect(
        service.login({
          email: 'suspended@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should block verified Sponsor account from logging in while status is PENDING admin approval', async () => {
      const mockSponsorUser = {
        id: 'sponsor-uuid-1',
        email: 'sponsor@company.com',
        passwordHash: 'hashed_password_123',
        status: AccountStatus.PENDING, // Verified email, but pending admin review!
        emailVerifiedAt: new Date(),
        userRoles: [{ role: { name: 'SPONSOR', rolePermissions: [] } }],
      };

      prisma.user.findFirst.mockResolvedValue(mockSponsorUser);
      passwordService.compare.mockResolvedValue(true);

      await expect(
        service.login({
          email: 'sponsor@company.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('confirmPasswordReset', () => {
    it('should update password and invalidate all sessions on valid OTP', async () => {
      const mockDbUser = {
        id: 'user-uuid-1',
        email: 'attendee@example.com',
      };

      prisma.user.findFirst.mockResolvedValue(mockDbUser);
      prisma.user.update.mockResolvedValue({ id: 'user-uuid-1' });

      const result = await service.confirmPasswordReset({
        email: 'attendee@example.com',
        code: '123456',
        newPassword: 'NewPassword2026!',
      });

      expect(result.success).toBe(true);
      expect(otpService.verifyChallenge).toHaveBeenCalledWith(
        'attendee@example.com',
        '123456',
        OtpPurpose.PASSWORD_RESET,
        undefined,
        undefined,
      );
      expect(tokenService.revokeAllUserSessions).toHaveBeenCalledWith('user-uuid-1');
    });
  });
});
