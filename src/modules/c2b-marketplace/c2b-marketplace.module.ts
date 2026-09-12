import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AuthModule } from '../auth/auth.module';
import { ProviderServicesController } from './controllers/provider-services.controller';
import { C2bMarketplaceController } from './controllers/c2b-marketplace.controller';
import { C2bBookingsController } from './controllers/c2b-bookings.controller';
import { CouponsController } from './controllers/coupons.controller';
import { C2bServicesService } from './services/c2b-services.service';
import { C2bBookingsService } from './services/c2b-bookings.service';
import { CouponsService } from './services/coupons.service';
import { C2bExpirationService } from './services/c2b-expiration.service';

@Module({
  imports: [DatabaseModule, AuditModule, OutboxModule, AuthModule],
  controllers: [
    ProviderServicesController,
    C2bMarketplaceController,
    C2bBookingsController,
    CouponsController,
  ],
  providers: [C2bServicesService, C2bBookingsService, CouponsService, C2bExpirationService],
  exports: [C2bServicesService, C2bBookingsService, CouponsService, C2bExpirationService],
})
export class C2bMarketplaceModule {}
