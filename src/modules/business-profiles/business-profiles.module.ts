import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { BusinessProfilesService } from './services/business-profiles.service';
import { BusinessProfilesController } from './controllers/business-profiles.controller';
import { PublicProfilesController } from './controllers/public-profiles.controller';

@Module({
  imports: [DatabaseModule, AuditModule, AuthModule],
  controllers: [BusinessProfilesController, PublicProfilesController],
  providers: [BusinessProfilesService],
  exports: [BusinessProfilesService],
})
export class BusinessProfilesModule {}
