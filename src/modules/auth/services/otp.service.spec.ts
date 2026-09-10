import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpPurpose } from '@prisma/client';
import { OtpService } from './otp.service';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CryptoUtil } from '../../../common/utils/crypto.util';

describe('OtpService', () => {
  let service: OtpService;
  let prisma: {
    otpChallenge: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let auditService: {
    log: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      otpChallenge: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'otp-uuid-1', ...data })),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'otp-uuid-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultVal: unknown) => {
              if (key === 'otp.expiresInMinutes') return 5;
              if (key === 'otp.maxAttempts') return 5;
              if (key === 'otp.cooldownSeconds') return 60;
              return defaultVal;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<OtpService>(OtpService);
  });

  describe('createChallenge', () => {
    it('should generate a 6-digit numeric OTP and store hashed digest', async () => {
      prisma.otpChallenge.findFirst.mockResolvedValue(null);

      const result = await service.createChallenge(
        'test@example.com',
        OtpPurpose.EMAIL_VERIFICATION,
        'user-uuid-1',
      );

      expect(result.code).toHaveLength(6);
      expect(/^\d{6}$/.test(result.code)).toBe(true);
      expect(prisma.otpChallenge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            identifier: 'test@example.com',
            purpose: OtpPurpose.EMAIL_VERIFICATION,
            codeHash: CryptoUtil.sha256(result.code),
            maxAttempts: 5,
          }),
        }),
      );
    });

    it('should enforce cooldown if another challenge was requested within 60 seconds', async () => {
      const futureCooldown = new Date(Date.now() + 45000); // 45s remaining
      prisma.otpChallenge.findFirst.mockResolvedValue({
        id: 'otp-recent',
        identifier: 'test@example.com',
        purpose: OtpPurpose.EMAIL_VERIFICATION,
        resendAfter: futureCooldown,
        consumedAt: null,
      });

      await expect(
        service.createChallenge('test@example.com', OtpPurpose.EMAIL_VERIFICATION),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifyChallenge', () => {
    it('should successfully verify valid code and mark it consumed', async () => {
      const code = '123456';
      const codeHash = CryptoUtil.sha256(code);

      prisma.otpChallenge.findFirst.mockResolvedValue({
        id: 'otp-uuid-1',
        identifier: 'test@example.com',
        purpose: OtpPurpose.EMAIL_VERIFICATION,
        codeHash,
        expiresAt: new Date(Date.now() + 60000),
        attempts: 0,
        maxAttempts: 5,
        consumedAt: null,
      });

      const result = await service.verifyChallenge(
        'test@example.com',
        code,
        OtpPurpose.EMAIL_VERIFICATION,
      );

      expect(result).toBe(true);
      expect(prisma.otpChallenge.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'otp-uuid-1' },
          data: expect.objectContaining({ consumedAt: expect.any(Date) }),
        }),
      );
    });

    it('should reject incorrect code and increment attempts count', async () => {
      const correctCode = '123456';
      const wrongCode = '654321';
      const codeHash = CryptoUtil.sha256(correctCode);

      prisma.otpChallenge.findFirst.mockResolvedValue({
        id: 'otp-uuid-1',
        identifier: 'test@example.com',
        purpose: OtpPurpose.EMAIL_VERIFICATION,
        codeHash,
        expiresAt: new Date(Date.now() + 60000),
        attempts: 1,
        maxAttempts: 5,
        consumedAt: null,
      });

      await expect(
        service.verifyChallenge('test@example.com', wrongCode, OtpPurpose.EMAIL_VERIFICATION),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.otpChallenge.update).toHaveBeenCalledWith({
        where: { id: 'otp-uuid-1' },
        data: { attempts: { increment: 1 } },
      });
    });

    it('should reject expired code', async () => {
      const code = '123456';
      const codeHash = CryptoUtil.sha256(code);

      prisma.otpChallenge.findFirst.mockResolvedValue({
        id: 'otp-uuid-1',
        identifier: 'test@example.com',
        purpose: OtpPurpose.EMAIL_VERIFICATION,
        codeHash,
        expiresAt: new Date(Date.now() - 5000), // expired
        attempts: 0,
        maxAttempts: 5,
        consumedAt: null,
      });

      await expect(
        service.verifyChallenge('test@example.com', code, OtpPurpose.EMAIL_VERIFICATION),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
