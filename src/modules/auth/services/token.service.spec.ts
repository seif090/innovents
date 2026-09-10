import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { TokenService } from './token.service';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CryptoUtil } from '../../../common/utils/crypto.util';

describe('TokenService', () => {
  let service: TokenService;
  let prisma: {
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let jwtService: {
    sign: jest.Mock;
    verify: jest.Mock;
  };
  let auditService: {
    log: jest.Mock;
  };

  const mockUser = {
    id: 'user-uuid-1',
    email: 'attendee@example.com',
    userRoles: [
      {
        role: {
          name: 'ATTENDEE',
          rolePermissions: [
            {
              permission: { action: 'read', resource: 'event' },
            },
          ],
        },
      },
    ],
  };

  beforeEach(async () => {
    prisma = {
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'token-uuid-1' }),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'token-uuid-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(prisma);
      }),
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('mocked-jwt-access-token'),
      verify: jest.fn().mockReturnValue({
        sub: 'user-uuid-1',
        email: 'attendee@example.com',
        roles: ['ATTENDEE'],
        permissions: ['read:event'],
      }),
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: AuditService, useValue: auditService },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              if (key === 'jwt.accessSecret') return 'test-access-secret-32-chars-long';
              if (key === 'jwt.refreshSecret') return 'test-refresh-secret-32-chars-long';
              return 'test-secret';
            }),
            get: jest.fn((_key: string, defaultVal: unknown) => defaultVal),
          },
        },
      ],
    }).compile();

    service = module.get<TokenService>(TokenService);
  });

  describe('generateTokens', () => {
    it('should generate an access token and rotatable refresh token', async () => {
      const tokens = await service.generateTokens(
        mockUser.id,
        mockUser.email,
        ['ATTENDEE'],
        ['read:event'],
      );

      expect(tokens.accessToken).toBe('mocked-jwt-access-token');
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.expiresIn).toBe('15m');
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: mockUser.id,
          }),
        }),
      );
    });
  });

  describe('rotateRefreshToken', () => {
    it('should rotate valid refresh token successfully', async () => {
      const rawToken = 'valid-refresh-token-hex';
      const tokenHash = CryptoUtil.sha256(rawToken);

      const storedToken = {
        id: 'token-uuid-1',
        userId: mockUser.id,
        tokenHash,
        familyId: 'family-uuid-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
        user: mockUser,
      };

      prisma.refreshToken.findUnique.mockResolvedValue(storedToken);

      const result = await service.rotateRefreshToken(rawToken);

      expect(result.accessToken).toBe('mocked-jwt-access-token');
      expect(result.refreshToken).toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TOKEN_REFRESHED',
        }),
      );
    });

    it('should detect token reuse, revoke entire family, and throw UnauthorizedException', async () => {
      const rawToken = 'reused-token-hex';
      const tokenHash = CryptoUtil.sha256(rawToken);

      // Token was already revoked earlier!
      const compromisedToken = {
        id: 'token-uuid-1',
        userId: mockUser.id,
        tokenHash,
        familyId: 'family-uuid-compromised',
        revokedAt: new Date(Date.now() - 5000),
        expiresAt: new Date(Date.now() + 100000),
        user: mockUser,
      };

      prisma.refreshToken.findUnique.mockResolvedValue(compromisedToken);

      await expect(service.rotateRefreshToken(rawToken)).rejects.toThrow(UnauthorizedException);

      // Entire family must be revoked
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'family-uuid-compromised' },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });

      // Audit log must record TOKEN_REUSE_DETECTED
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TOKEN_REUSE_DETECTED',
        }),
      );
    });

    it('should reject expired refresh token', async () => {
      const rawToken = 'expired-token-hex';
      const tokenHash = CryptoUtil.sha256(rawToken);

      const expiredToken = {
        id: 'token-uuid-expired',
        userId: mockUser.id,
        tokenHash,
        familyId: 'family-uuid-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 10000), // in the past
        user: mockUser,
      };

      prisma.refreshToken.findUnique.mockResolvedValue(expiredToken);

      await expect(service.rotateRefreshToken(rawToken)).rejects.toThrow(UnauthorizedException);
    });
  });
});
