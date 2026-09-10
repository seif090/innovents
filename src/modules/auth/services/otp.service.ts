import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpPurpose } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { CryptoUtil } from '../../../common/utils/crypto.util';
import { AuditService } from '../../audit/audit.service';
import { AUTH_EVENTS } from '../constants/auth.constants';

export interface GeneratedOtpResult {
  code: string; // Used only internally for immediate outbox/email dispatch; never logged or exposed via API
  challengeId: string;
}

@Injectable()
export class OtpService {
  private readonly expiresInMinutes: number;
  private readonly maxAttempts: number;
  private readonly cooldownSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {
    this.expiresInMinutes = this.configService.get<number>('otp.expiresInMinutes', 5);
    this.maxAttempts = this.configService.get<number>('otp.maxAttempts', 5);
    this.cooldownSeconds = this.configService.get<number>('otp.cooldownSeconds', 60);
  }

  /**
   * Generates and stores a new OTP challenge, enforcing resend cooldown
   */
  async createChallenge(
    identifier: string,
    purpose: OtpPurpose,
    userId?: string,
  ): Promise<GeneratedOtpResult> {
    const normalizedIdentifier = identifier.trim().toLowerCase();

    // 1. Check for active unexpired challenge with cooldown violation
    const recentChallenge = await this.prisma.otpChallenge.findFirst({
      where: {
        identifier: normalizedIdentifier,
        purpose,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentChallenge) {
      const now = new Date();
      if (recentChallenge.resendAfter > now) {
        const remainingSec = Math.ceil(
          (recentChallenge.resendAfter.getTime() - now.getTime()) / 1000,
        );
        throw new BadRequestException(
          `Please wait ${remainingSec} seconds before requesting a new verification code.`,
        );
      }
    }

    // 2. Invalidate older unconsumed challenges for this identifier & purpose
    await this.prisma.otpChallenge.updateMany({
      where: {
        identifier: normalizedIdentifier,
        purpose,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });

    // 3. Generate 6-digit numeric OTP and hash it
    const code = CryptoUtil.generateNumericOtp(6);
    const codeHash = CryptoUtil.sha256(code);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.expiresInMinutes * 60 * 1000);
    const resendAfter = new Date(now.getTime() + this.cooldownSeconds * 1000);

    const challenge = await this.prisma.otpChallenge.create({
      data: {
        userId: userId || null,
        identifier: normalizedIdentifier,
        purpose,
        codeHash,
        expiresAt,
        resendAfter,
        maxAttempts: this.maxAttempts,
      },
    });

    await this.auditService.log({
      actorUserId: userId,
      action: AUTH_EVENTS.OTP_REQUESTED,
      resourceType: 'auth:otp_challenge',
      resourceId: challenge.id,
      metadata: { purpose },
    });

    return {
      code,
      challengeId: challenge.id,
    };
  }

  /**
   * Verifies an OTP code against stored challenges
   */
  async verifyChallenge(
    identifier: string,
    code: string,
    purpose: OtpPurpose,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<boolean> {
    const normalizedIdentifier = identifier.trim().toLowerCase();
    const incomingCodeHash = CryptoUtil.sha256(code.trim());

    const challenge = await this.prisma.otpChallenge.findFirst({
      where: {
        identifier: normalizedIdentifier,
        purpose,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    // 1. Check expiration
    if (challenge.expiresAt < new Date()) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      throw new BadRequestException('Verification code has expired. Please request a new code.');
    }

    // 2. Check maximum attempts
    if (challenge.attempts >= challenge.maxAttempts) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      await this.auditService.log({
        actorUserId: challenge.userId || undefined,
        action: AUTH_EVENTS.ACCOUNT_LOCKED,
        resourceType: 'auth:otp_challenge',
        resourceId: challenge.id,
        metadata: { reason: 'Maximum OTP verification attempts exceeded' },
        ipAddress,
        userAgent,
      });
      throw new BadRequestException(
        'Maximum verification attempts exceeded. Please request a new code.',
      );
    }

    // 3. Verify hash match
    if (challenge.codeHash !== incomingCodeHash) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });

      await this.auditService.log({
        actorUserId: challenge.userId || undefined,
        action: AUTH_EVENTS.OTP_FAILED,
        resourceType: 'auth:otp_challenge',
        resourceId: challenge.id,
        metadata: { attempts: challenge.attempts + 1 },
        ipAddress,
        userAgent,
      });

      const remaining = challenge.maxAttempts - (challenge.attempts + 1);
      throw new BadRequestException(
        `Invalid verification code. ${remaining} attempt(s) remaining.`,
      );
    }

    // 4. Mark challenge as consumed (one-time use)
    await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: {
        consumedAt: new Date(),
      },
    });

    await this.auditService.log({
      actorUserId: challenge.userId || undefined,
      action: AUTH_EVENTS.OTP_VERIFIED,
      resourceType: 'auth:otp_challenge',
      resourceId: challenge.id,
      metadata: { purpose },
      ipAddress,
      userAgent,
    });

    return true;
  }
}
