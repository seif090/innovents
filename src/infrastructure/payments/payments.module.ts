import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PAYMENT_PROVIDER } from './payment.interface';
import { StripePaymentProvider } from './stripe-payment.provider';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    StripePaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      useExisting: StripePaymentProvider,
    },
  ],
  exports: [PAYMENT_PROVIDER, StripePaymentProvider],
})
export class PaymentsInfrastructureModule {}
