import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { AuthModule } from '../auth/auth.module';
import { VendorServicesService } from './services/vendor-services.service';
import { B2bMarketplaceService } from './services/b2b-marketplace.service';
import { RfqService } from './services/rfq.service';
import { QuotationService } from './services/quotation.service';
import { RfqExpirationService } from './services/rfq-expiration.service';
import { VendorServicesController } from './controllers/vendor-services.controller';
import { B2bMarketplaceController } from './controllers/b2b-marketplace.controller';
import { RfqController } from './controllers/rfq.controller';
import { QuotationController } from './controllers/quotation.controller';

@Module({
  imports: [DatabaseModule, AuditModule, OutboxModule, QueueModule, AuthModule],
  controllers: [
    VendorServicesController,
    B2bMarketplaceController,
    RfqController,
    QuotationController,
  ],
  providers: [
    VendorServicesService,
    B2bMarketplaceService,
    RfqService,
    QuotationService,
    RfqExpirationService,
  ],
  exports: [
    VendorServicesService,
    B2bMarketplaceService,
    RfqService,
    QuotationService,
    RfqExpirationService,
  ],
})
export class B2bMarketplaceModule {}
