import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class C2bExpirationService {
  private readonly logger = new Logger(C2bExpirationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sweeps and deactivates expired C2B services and coupons
   */
  async sweepExpiredResources(): Promise<{ expiredServices: number; expiredCoupons: number }> {
    const now = new Date();

    // Deactivate services past expiresAt or whose event has ended
    const expiredServicesResult = await this.prisma.c2bService.updateMany({
      where: {
        isAvailable: true,
        deletedAt: null,
        OR: [{ expiresAt: { lte: now } }, { event: { endsAt: { lte: now } } }],
      },
      data: {
        isAvailable: false,
      },
    });

    // Deactivate coupons past expiresAt or whose event has ended
    const expiredCouponsResult = await this.prisma.coupon.updateMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [{ expiresAt: { lte: now } }, { event: { endsAt: { lte: now } } }],
      },
      data: {
        isActive: false,
      },
    });

    this.logger.log(
      `C2B Expiration sweep complete: ${expiredServicesResult.count} services, ${expiredCouponsResult.count} coupons`,
    );

    return {
      expiredServices: expiredServicesResult.count,
      expiredCoupons: expiredCouponsResult.count,
    };
  }
}
