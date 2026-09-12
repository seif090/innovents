export interface CreateCheckoutSessionParams {
  userId: string;
  customerEmail?: string;
  stripeCustomerId?: string;
  mode?: 'payment' | 'subscription';
  amount?: number; // In minor units (e.g. cents/halalas) or decimal converted
  currency?: string; // default 'SAR'
  lineItems?: Array<{
    price?: string; // Stripe Price ID (for subscription or catalog products)
    priceData?: {
      currency: string;
      productData: {
        name: string;
        description?: string;
        metadata?: Record<string, string>;
      };
      unitAmount: number; // minor units
      recurring?: {
        interval: 'month' | 'year';
      };
    };
    quantity: number;
  }>;
  metadata?: Record<string, string>;
  clientReferenceId?: string;
  idempotencyKey?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  sessionId: string;
  checkoutUrl: string;
  paymentIntentId?: string;
  subscriptionId?: string;
}

export interface PaymentWebhookEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface StripeCustomerResult {
  id: string;
  email: string;
  name?: string;
}

export interface PaymentProvider {
  createCheckoutSession(params: CreateCheckoutSessionParams): Promise<CheckoutSessionResult>;
  verifyWebhookSignature(payload: Buffer, signature: string): Promise<PaymentWebhookEvent>;
  createOrGetCustomer(params: {
    email: string;
    name?: string;
    metadata?: Record<string, string>;
  }): Promise<StripeCustomerResult>;
  retrievePaymentIntent(
    id: string,
  ): Promise<{ id: string; status: string; amount: number; currency: string } | null>;
  retrieveCheckoutSession(id: string): Promise<{
    id: string;
    paymentStatus: string;
    status: string;
    paymentIntentId?: string;
  } | null>;
  cancelSubscription(
    subscriptionId: string,
    immediately?: boolean,
  ): Promise<{ id: string; status: string; cancelAtPeriodEnd: boolean }>;
  refundPayment(
    paymentIntentId: string,
    amountMinorUnits?: number,
    reason?: string,
  ): Promise<{ id: string; status: string; amount: number }>;
}

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';
