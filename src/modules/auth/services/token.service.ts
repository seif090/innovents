import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AccountStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

import { PrismaService } from '../../../database/prisma.service';
import { CryptoUtil } from '../../../common/utils/crypto.util';
import { AuditService } from '../../audit/audit.service';
import { AUTH_EVENTS } from '../constants/auth.constants';
import { AuthTokensDto } from '../dto/auth-response.dto';
import { RedisService } from '../../../infrastructure/cache/redis.service';

export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
  jti: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly accessSecret: string;
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresInDays: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly redisService: RedisService,
  ) {
    this.accessSecret = this.configService.getOrThrow<string>('jwt.accessSecret');

    this.accessExpiresIn = this.configService.get<string>('jwt.accessExpiresIn', '15m');

    this.refreshExpiresInDays = 7;
  }

  private getAccessBlacklistKey(jti: string): string {
    return `auth:access:blacklist:${jti}`;
  }

  private getAccessTokenTtlSeconds(): number {
    const value = this.accessExpiresIn.trim();

    const match = /^(\d+)(s|m|h|d)$/.exec(value);

    if (!match) {
      // Safe fallback = 15 minutes
      return 15 * 60;
    }

    const amount = Number(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's':
        return amount;

      case 'm':
        return amount * 60;

      case 'h':
        return amount * 60 * 60;

      case 'd':
        return amount * 24 * 60 * 60;

      default:
        return 15 * 60;
    }
  }

  private async blacklistAccessTokenJtis(jtis: string[]): Promise<void> {
    const ttl = this.getAccessTokenTtlSeconds();

    await Promise.all(
      jtis.map((jti) => this.redisService.set(this.getAccessBlacklistKey(jti), '1', ttl)),
    );
  }

  async isAccessTokenRevoked(jti: string): Promise<boolean> {
    return this.redisService.exists(this.getAccessBlacklistKey(jti));
  }

  /**
   * Generates a complete token pair
   * Access Token + Rotatable Refresh Token
   */
  async generateTokens(
    userId: string,
    email: string,
    roles: string[],
    permissions: string[],
    existingFamilyId?: string,
  ): Promise<AuthTokensDto> {
    const jti = uuidv4();
    const familyId = existingFamilyId || uuidv4();

    // 1. Issue Access Token
    const payload: JwtPayload = {
      sub: userId,
      email,
      roles,
      permissions,
      jti,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.accessSecret,
      expiresIn: this.accessExpiresIn,
    });

    // 2. Generate secure Refresh Token
    const rawRefreshToken = CryptoUtil.generateRandomToken(48);

    const tokenHash = CryptoUtil.sha256(rawRefreshToken);

    const expiresAt = new Date();

    expiresAt.setDate(expiresAt.getDate() + this.refreshExpiresInDays);

    // 3. Store Refresh Token hash
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        familyId,
        jti,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: this.accessExpiresIn,
    };
  }

  /**
   * Rotates a refresh token with:
   * - reuse detection
   * - family invalidation
   * - concurrent request protection
   */
  async rotateRefreshToken(
    rawRefreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthTokensDto> {
    const tokenHash = CryptoUtil.sha256(rawRefreshToken);

    // 1. Find refresh token
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: {
        tokenHash,
      },
      include: {
        user: {
          include: {
            userRoles: {
              include: {
                role: {
                  include: {
                    rolePermissions: {
                      include: {
                        permission: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // 2. Reuse detection
    if (storedToken.revokedAt !== null) {
      this.logger.warn(
        `🚨 Security Alert: Refresh token reuse detected for user ${storedToken.userId} on family ${storedToken.familyId}`,
      );

      // Revoke entire family
      await this.prisma.refreshToken.updateMany({
        where: {
          familyId: storedToken.familyId,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      await this.auditService.log({
        actorUserId: storedToken.userId,
        action: AUTH_EVENTS.TOKEN_REUSE_DETECTED,
        resourceType: 'auth:refresh_token',
        resourceId: storedToken.id,
        metadata: {
          familyId: storedToken.familyId,
        },
        ipAddress,
        userAgent,
      });

      throw new UnauthorizedException(
        'Security violation: Refresh token reuse detected. All sessions revoked. Please log in again.',
      );
    }

    // 3. Check expiration
    if (storedToken.expiresAt < new Date()) {
      await this.prisma.refreshToken.update({
        where: {
          id: storedToken.id,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      throw new UnauthorizedException('Refresh token has expired. Please log in again.');
    }

    // 4. Check account status
    if (
      storedToken.user.deletedAt !== null ||
      storedToken.user.status === AccountStatus.DEACTIVATED ||
      storedToken.user.status === AccountStatus.SUSPENDED ||
      storedToken.user.status === AccountStatus.REJECTED
    ) {
      // Revoke every active session for this user
      await this.prisma.refreshToken.updateMany({
        where: {
          userId: storedToken.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      throw new UnauthorizedException('Your session is no longer valid. Please log in again.');
    }

    // 5. Gather roles
    const roles: string[] = storedToken.user.userRoles.map((ur) => ur.role.name);

    // 6. Gather permissions
    const permissions: string[] = Array.from(
      new Set(
        storedToken.user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => `${rp.permission.action}:${rp.permission.resource}`),
        ),
      ),
    );

    // 7. Prepare replacement token
    const newJti = uuidv4();

    const newRawRefreshToken = CryptoUtil.generateRandomToken(48);

    const newTokenHash = CryptoUtil.sha256(newRawRefreshToken);

    const newExpiresAt = new Date();

    newExpiresAt.setDate(newExpiresAt.getDate() + this.refreshExpiresInDays);

    // Prepare new Access Token
    const newAccessToken = this.jwtService.sign(
      {
        sub: storedToken.userId,
        email: storedToken.user.email,
        roles,
        permissions,
        jti: newJti,
      },
      {
        secret: this.accessSecret,
        expiresIn: this.accessExpiresIn,
      },
    );

    /**
     * 8. Atomic rotation
     *
     * updateMany acts as an atomic "claim".
     *
     * If two requests use the same refresh token
     * at the same time:
     *
     * Request A -> count = 1
     * Request B -> count = 0
     *
     * Only one request can rotate the token.
     */
    const rotationResult = await this.prisma.$transaction(async (tx) => {
      const now = new Date();

      // Atomically claim old token
      const claimedToken = await tx.refreshToken.updateMany({
        where: {
          id: storedToken.id,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        data: {
          revokedAt: now,
          lastUsedAt: now,
        },
      });

      // Another request already claimed it
      if (claimedToken.count !== 1) {
        return null;
      }

      // Create replacement refresh token
      const createdToken = await tx.refreshToken.create({
        data: {
          userId: storedToken.userId,
          tokenHash: newTokenHash,
          familyId: storedToken.familyId,
          jti: newJti,
          expiresAt: newExpiresAt,
        },
      });

      // Link old token to new token
      await tx.refreshToken.update({
        where: {
          id: storedToken.id,
        },
        data: {
          replacedByTokenId: createdToken.id,
        },
      });

      return createdToken;
    });

    /**
     * IMPORTANT:
     * This MUST be outside the transaction.
     */
    if (!rotationResult) {
      this.logger.warn(
        `🚨 Concurrent refresh token reuse detected for user ${storedToken.userId} on family ${storedToken.familyId}`,
      );

      // Revoke entire compromised family
      await this.prisma.refreshToken.updateMany({
        where: {
          familyId: storedToken.familyId,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      await this.auditService.log({
        actorUserId: storedToken.userId,
        action: AUTH_EVENTS.TOKEN_REUSE_DETECTED,
        resourceType: 'auth:refresh_token',
        resourceId: storedToken.id,
        metadata: {
          familyId: storedToken.familyId,
          reason: 'Concurrent refresh token reuse',
        },
        ipAddress,
        userAgent,
      });

      throw new UnauthorizedException(
        'Security violation: Refresh token reuse detected. All sessions revoked. Please log in again.',
      );
    }

    // 9. Audit successful rotation
    await this.auditService.log({
      actorUserId: storedToken.userId,
      action: AUTH_EVENTS.TOKEN_REFRESHED,
      resourceType: 'auth:refresh_token',
      resourceId: storedToken.id,
      ipAddress,
      userAgent,
    });

    // 10. Return new token pair
    return {
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
      expiresIn: this.accessExpiresIn,
    };
  }

  /**
   * Revokes all refresh tokens for a user
   * e.g. logout-all / password reset
   */
  async revokeAllUserSessions(userId: string): Promise<void> {
    // Get all JTIs that belong to this user's sessions
    const userTokens = await this.prisma.refreshToken.findMany({
      where: {
        userId,
      },
      select: {
        jti: true,
      },
    });

    // Revoke every active refresh token
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    // Immediately revoke corresponding access tokens
    await this.blacklistAccessTokenJtis(userTokens.map((token) => token.jti));
  }

  /**
   * Revokes a specific refresh token family
   */
  async revokeRefreshToken(rawRefreshToken: string): Promise<void> {
    const tokenHash = CryptoUtil.sha256(rawRefreshToken);

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: {
        tokenHash,
      },
    });

    if (!storedToken) {
      return;
    }

    // Get all access-token JTIs issued inside this session family
    const familyTokens = await this.prisma.refreshToken.findMany({
      where: {
        familyId: storedToken.familyId,
      },
      select: {
        jti: true,
      },
    });

    // Revoke the whole refresh-token family
    await this.prisma.refreshToken.updateMany({
      where: {
        familyId: storedToken.familyId,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    // Immediately revoke corresponding access tokens
    await this.blacklistAccessTokenJtis(familyTokens.map((token) => token.jti));
  }

  /**
   * Verifies access token
   */
  verifyAccessToken(token: string): JwtPayload {
    try {
      return this.jwtService.verify<JwtPayload>(token, {
        secret: this.accessSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
