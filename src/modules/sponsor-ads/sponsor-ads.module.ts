import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AuthModule } from '../auth/auth.module';
import { SponsorAdsController } from './controllers/sponsor-ads.controller';
import { AdminAdsController } from './controllers/admin-ads.controller';
import { PublicAdsController } from './controllers/public-ads.controller';
import { SponsorAdsService } from './services/sponsor-ads.service';

@Module({
  imports: [DatabaseModule, AuditModule, OutboxModule, AuthModule],
  controllers: [SponsorAdsController, AdminAdsController, PublicAdsController],
  providers: [SponsorAdsService],
  exports: [SponsorAdsService],
})
export class SponsorAdsModule {}
