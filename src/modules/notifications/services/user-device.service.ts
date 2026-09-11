import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { CryptoUtil } from '../../../common/utils/crypto.util';
import { RegisterDeviceDto } from '../dto/register-device.dto';
import { UserDeviceResponseDto } from '../dto/user-device-response.dto';
import { UserDevice } from '@prisma/client';

@Injectable()
export class UserDeviceService {
  private readonly logger = new Logger(UserDeviceService.name);
  private readonly encryptionKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.encryptionKey =
      this.configService.get<string>('notifications.encryptionKey') ||
      'innovent-secure-device-token-key-32ch!';
  }

  /**
   * Registers or rotates a user push device token.
   * Uses SHA-256 tokenHash for unique lookup and AES-256-GCM for encrypted-at-rest storage.
   */
  async registerDevice(userId: string, dto: RegisterDeviceDto): Promise<UserDeviceResponseDto> {
    const tokenHash = CryptoUtil.sha256(dto.token.trim());
    const encryptedToken = CryptoUtil.encrypt(dto.token.trim(), this.encryptionKey);

    const device = await this.prisma.userDevice.upsert({
      where: { tokenHash },
      update: {
        userId,
        platform: dto.platform,
        token: encryptedToken,
        isActive: true,
        revokedAt: null,
        lastSeenAt: new Date(),
      },
      create: {
        userId,
        platform: dto.platform,
        token: encryptedToken,
        tokenHash,
        isActive: true,
        lastSeenAt: new Date(),
      },
    });

    this.logger.debug(`Registered/updated device ${device.id} for user ${userId}`);
    return this.toResponseDto(device, dto.token.trim());
  }

  /**
   * Retrieves all active registered devices for a user (with masked tokens)
   */
  async getUserDevices(userId: string): Promise<UserDeviceResponseDto[]> {
    const devices = await this.prisma.userDevice.findMany({
      where: {
        userId,
        isActive: true,
      },
      orderBy: { lastSeenAt: 'desc' },
    });

    return devices.map((d) => this.toResponseDto(d));
  }

  /**
   * Revokes a user device, asserting ownership to prevent IDOR
   */
  async revokeDevice(userId: string, deviceId: string): Promise<void> {
    const device = await this.prisma.userDevice.findUnique({
      where: { id: deviceId },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    if (device.userId !== userId) {
      throw new ForbiddenException('You are not authorized to revoke this device');
    }

    await this.prisma.userDevice.update({
      where: { id: deviceId },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    });

    this.logger.debug(`Revoked device ${deviceId} for user ${userId}`);
  }

  /**
   * Deactivates a token when the push provider reports it as expired or unregistered
   */
  async deactivateToken(tokenHash: string): Promise<void> {
    try {
      await this.prisma.userDevice.updateMany({
        where: { tokenHash },
        data: {
          isActive: false,
          revokedAt: new Date(),
        },
      });
      this.logger.warn(`Deactivated invalid/unregistered push token with hash: ${tokenHash}`);
    } catch (err) {
      this.logger.error(`Error deactivating push token: ${err}`);
    }
  }

  /**
   * Decrypts raw tokens for active user devices (used strictly by push delivery engine)
   */
  async getActiveDecryptedTokens(
    userId: string,
  ): Promise<Array<{ id: string; token: string; tokenHash: string }>> {
    const devices = await this.prisma.userDevice.findMany({
      where: {
        userId,
        isActive: true,
      },
    });

    const results: Array<{ id: string; token: string; tokenHash: string }> = [];
    for (const d of devices) {
      try {
        const rawToken = CryptoUtil.decrypt(d.token, this.encryptionKey);
        results.push({ id: d.id, token: rawToken, tokenHash: d.tokenHash });
      } catch (err) {
        this.logger.error(`Failed to decrypt token for device ${d.id}: ${err}`);
      }
    }

    return results;
  }

  private toResponseDto(device: UserDevice, rawTokenFallback?: string): UserDeviceResponseDto {
    let masked = '***';
    try {
      const raw = rawTokenFallback || CryptoUtil.decrypt(device.token, this.encryptionKey);
      if (raw.length > 8) {
        masked = `***${raw.slice(-6)}`;
      }
    } catch {
      masked = '***';
    }

    return {
      id: device.id,
      platform: device.platform,
      maskedToken: masked,
      isActive: device.isActive,
      lastSeenAt: device.lastSeenAt,
      createdAt: device.createdAt,
    };
  }
}
