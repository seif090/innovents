import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../../database/prisma.service';
import { CryptoUtil } from '../../../common/utils/crypto.util';
import { AuditService } from '../../audit/audit.service';
import { AUTH_EVENTS } from '../constants/auth.constants';
import { AuthTokensDto } from '../dto/auth-response.dto';

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
  ) {
    this.accessSecret = this.configService.getOrThrow<string>('jwt.accessSecret');
    this.accessExpiresIn = this.configService.get<string>('jwt.accessExpiresIn', '15m');
    this.refreshExpiresInDays = 7;
  }

  /**
   * Generates a complete token pair (Access Token + Rotatable Refresh Token)
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

    // 2. Generate cryptographically secure Refresh Token
    const rawRefreshToken = CryptoUtil.generateRandomToken(48);
    const tokenHash = CryptoUtil.sha256(rawRefreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.refreshExpiresInDays);

    // 3. Persist Refresh Token
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
   * Rotates a refresh token with strict reuse detection and family invalidation
   */
  async rotateRefreshToken(
    rawRefreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthTokensDto> {
    const tokenHash = CryptoUtil.sha256(rawRefreshToken);

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
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
        },
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Reuse Detection: If the token has already been revoked, the token family is compromised!
    if (storedToken.revokedAt !== null) {
      this.logger.warn(
        `🚨 Security Alert: Refresh token reuse detected for user ${storedToken.userId} on family ${storedToken.familyId}`,
      );

      // Invalidate the entire token family immediately
      await this.prisma.refreshToken.updateMany({
        where: { familyId: storedToken.familyId },
        data: { revokedAt: new Date() },
      });

      // Audit security event
      await this.auditService.log({
        actorUserId: storedToken.userId,
        action: AUTH_EVENTS.TOKEN_REUSE_DETECTED,
        resourceType: 'auth:refresh_token',
        resourceId: storedToken.id,
        metadata: { familyId: storedToken.familyId },
        ipAddress,
        userAgent,
      });

      throw new UnauthorizedException(
        'Security violation: Refresh token reuse detected. All sessions revoked. Please log in again.',
      );
    }

    // Check expiration
    if (storedToken.expiresAt < new Date()) {
      await this.prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token has expired. Please log in again.');
    }

    // Gather roles and permissions
    const roles: string[] = storedToken.user.userRoles.map((ur) => ur.role.name);
    const permissions: string[] = Array.from(
      new Set(
        storedToken.user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => `${rp.permission.action}:${rp.permission.resource}`),
        ),
      ),
    );

    // Concurrency-safe atomic rotation
    const newJti = uuidv4();
    const newRawRefreshToken = CryptoUtil.generateRandomToken(48);
    const newTokenHash = CryptoUtil.sha256(newRawRefreshToken);
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + this.refreshExpiresInDays);

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

    await this.prisma.$transaction(async (tx) => {
      // Create new token in same family
      const createdToken = await tx.refreshToken.create({
        data: {
          userId: storedToken.userId,
          tokenHash: newTokenHash,
          familyId: storedToken.familyId,
          jti: newJti,
          expiresAt: newExpiresAt,
        },
      });

      // Revoke old token and link to replacement
      await tx.refreshToken.update({
        where: { id: storedToken.id },
        data: {
          revokedAt: new Date(),
          lastUsedAt: new Date(),
          replacedByTokenId: createdToken.id,
        },
      });
    });

    await this.auditService.log({
      actorUserId: storedToken.userId,
      action: AUTH_EVENTS.TOKEN_REFRESHED,
      resourceType: 'auth:refresh_token',
      resourceId: storedToken.id,
      ipAddress,
      userAgent,
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
      expiresIn: this.accessExpiresIn,
    };
  }

  /**
   * Revokes all refresh tokens for a user (e.g. on logout-all or password reset)
   */
  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Revokes a specific refresh token / family
   */
  async revokeRefreshToken(rawRefreshToken: string): Promise<void> {
    const tokenHash = CryptoUtil.sha256(rawRefreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (storedToken) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: storedToken.familyId },
        data: { revokedAt: new Date() },
      });
    }
  }

  /**
   * Verifies access token and returns typed payload
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
