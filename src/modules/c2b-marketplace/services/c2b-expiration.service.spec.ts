import { Test, TestingModule } from '@nestjs/testing';
import { C2bExpirationService } from './c2b-expiration.service';
import { PrismaService } from '../../../database/prisma.service';

describe('C2bExpirationService', () => {
  let service: C2bExpirationService;
  let prisma: {
    c2bService: { updateMany: jest.Mock };
    coupon: { updateMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      c2bService: {
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      coupon: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [C2bExpirationService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<C2bExpirationService>(C2bExpirationService);
  });

  it('should deactivate expired services and coupons', async () => {
    const result = await service.sweepExpiredResources();
    expect(result.expiredServices).toEqual(3);
    expect(result.expiredCoupons).toEqual(2);
    expect(prisma.c2bService.updateMany).toHaveBeenCalled();
    expect(prisma.coupon.updateMany).toHaveBeenCalled();
  });
});
