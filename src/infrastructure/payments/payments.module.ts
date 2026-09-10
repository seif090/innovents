import { Global, Module } from '@nestjs/common';
import { PAYMENT_PROVIDER, PaymentProvider } from './payment.interface';

// Sprint 1 Mock/Stub implementation for PaymentProvider
class MockPaymentProvider implements PaymentProvider {
  async createCheckoutSession(): Promise<{ sessionId: string; checkoutUrl: string }> {
    return {
      sessionId: 'mock_session_id',
      checkoutUrl: 'https://checkout.stripe.com/mock',
    };
  }

  async verifyWebhookSignature(): Promise<{
    id: string;
    type: string;
    data: Record<string, unknown>;
  }> {
    return {
      id: 'mock_evt_1',
      type: 'payment_intent.succeeded',
      data: {},
    };
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      useClass: MockPaymentProvider,
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentsModule {}
