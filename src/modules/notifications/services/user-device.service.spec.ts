import { Test, TestingModule } from '@nestjs/testing';
import { UserDeviceService } from './user-device.service';
import { PrismaService } from '../../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { DevicePlatform } from '@prisma/client';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { CryptoUtil } from '../../../common/utils/crypto.util';

describe('UserDeviceService', () => {
  let service: UserDeviceService;
  let prisma: {
    userDevice: {
      upsert: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  const userId = '11111111-1111-1111-1111-111111111111';
  const otherUserId = '22222222-2222-2222-2222-222222222222';
  const rawToken = 'fcm_valid_sample_device_registration_token_12345';
  const encKey = 'innovent-secure-device-token-key-32ch!';

  beforeEach(async () => {
    prisma = {
      userDevice: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserDeviceService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(encKey),
          },
        },
      ],
    }).compile();

    service = module.get<UserDeviceService>(UserDeviceService);
  });

  describe('registerDevice', () => {
    it('should hash token, encrypt token at rest, and return masked token', async () => {
      const encryptedToken = CryptoUtil.encrypt(rawToken, encKey);
      prisma.userDevice.upsert.mockResolvedValue({
        id: 'dev-1',
        userId,
        platform: DevicePlatform.ANDROID,
        token: encryptedToken,
        tokenHash: CryptoUtil.sha256(rawToken),
        isActive: true,
        lastSeenAt: new Date(),
        createdAt: new Date(),
      });

      const result = await service.registerDevice(userId, {
        platform: DevicePlatform.ANDROID,
        token: rawToken,
      });

      expect(result.id).toBe('dev-1');
      expect(result.platform).toBe(DevicePlatform.ANDROID);
      expect(result.maskedToken).not.toBe(rawToken);
      expect(result.maskedToken).toContain('***');
      expect(prisma.userDevice.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenHash: CryptoUtil.sha256(rawToken) },
        }),
      );
    });
  });

  describe('getUserDevices', () => {
    it('should return active devices with masked tokens', async () => {
      const encryptedToken = CryptoUtil.encrypt(rawToken, encKey);
      prisma.userDevice.findMany.mockResolvedValue([
        {
          id: 'dev-1',
          userId,
          platform: DevicePlatform.IOS,
          token: encryptedToken,
          tokenHash: 'hash-1',
          isActive: true,
          lastSeenAt: new Date(),
          createdAt: new Date(),
        },
      ]);

      const devices = await service.getUserDevices(userId);
      expect(devices.length).toBe(1);
      expect(devices[0]?.maskedToken).toContain('***');
      expect(devices[0]?.maskedToken).not.toBe(rawToken);
    });
  });

  describe('revokeDevice', () => {
    it('should revoke device when user owns it', async () => {
      prisma.userDevice.findUnique.mockResolvedValue({
        id: 'dev-1',
        userId,
        isActive: true,
      });
      prisma.userDevice.update.mockResolvedValue({});

      await service.revokeDevice(userId, 'dev-1');

      expect(prisma.userDevice.update).toHaveBeenCalledWith({
        where: { id: 'dev-1' },
        data: expect.objectContaining({ isActive: false }),
      });
    });

    it('should throw NotFoundException if device does not exist', async () => {
      prisma.userDevice.findUnique.mockResolvedValue(null);

      await expect(service.revokeDevice(userId, 'dev-999')).rejects.toThrow(NotFoundException);
    });

    it('should prevent IDOR and throw ForbiddenException if device belongs to another user', async () => {
      prisma.userDevice.findUnique.mockResolvedValue({
        id: 'dev-1',
        userId: otherUserId,
        isActive: true,
      });

      await expect(service.revokeDevice(userId, 'dev-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deactivateToken', () => {
    it('should deactivate all devices with the given tokenHash', async () => {
      prisma.userDevice.updateMany.mockResolvedValue({ count: 1 });

      await service.deactivateToken('some-token-hash');

      expect(prisma.userDevice.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: 'some-token-hash' },
        data: expect.objectContaining({ isActive: false }),
      });
    });
  });
});
