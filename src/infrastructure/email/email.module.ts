import { Global, Module } from '@nestjs/common';
import { SmtpEmailService } from './smtp-email.service';
import { EMAIL_PROVIDER } from './email.interface';

@Global()
@Module({
  providers: [
    SmtpEmailService,
    {
      provide: EMAIL_PROVIDER,
      useExisting: SmtpEmailService,
    },
  ],
  exports: [EMAIL_PROVIDER, SmtpEmailService],
})
export class EmailModule {}
