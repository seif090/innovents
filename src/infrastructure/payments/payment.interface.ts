export interface CreateCheckoutSessionParams {
  userId: string;
  amount: number;
  currency: string;
  metadata?: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  sessionId: string;
  checkoutUrl: string;
}

export interface PaymentWebhookEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface PaymentProvider {
  createCheckoutSession(params: CreateCheckoutSessionParams): Promise<CheckoutSessionResult>;

  verifyWebhookSignature(payload: Buffer, signature: string): Promise<PaymentWebhookEvent>;
}

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';
