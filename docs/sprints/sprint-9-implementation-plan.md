# Sprint 9 Implementation Plan — Stripe Payments, Sponsored Communities, Subscriptions & Revenue Foundation

This document details the enterprise architectural design and execution plan for **Sprint 9** of the INOVENT Smart Event Ecosystem, incorporating rigorous financial domain rules, configurable plans, business entity mappings, and resilient webhook transaction boundaries.

---

## 1. Executive Summary & Architectural Decisions

### Core Architectural Corrections Applied
1. **Configurable Sponsorship Plans (Zero Hardcoded Pricing or Capacity)**:
   - Pricing and member capacities are NEVER hardcoded in code or business logic.
   - Introduced `CommunitySponsorshipPlan` entity storing: `code`, `name`, `price`, `currency`, `memberCapacity`, `durationDays`, and `isActive`.
   - Business logic derives all monetary and capacity parameters strictly from the active plan record.
2. **Business Account Stripe Customer Mapping (`SponsorProfile` & `VendorProfile`)**:
   - Subscriptions and sponsorships represent commercial business transactions.
   - Stripe customer mappings are maintained on both `SponsorProfile` (`stripeCustomerId`) and `VendorProfile` (`stripeCustomerId`), with optional personal fallback on `User`.
   - Customer creation uses an atomic lookup/create pattern to eliminate duplicate customer registrations.
3. **Real Sponsor Linkage**:
   - `CommunitySponsorship` strictly links `sponsorId` (referencing `SponsorProfile.id`), `userId` (the authorized actor), `planId` (the configured plan), and `paymentId`.
   - Verified role boundaries require `SPONSOR` or `ADMIN` role with an active approved profile.
4. **Configured Entitlement & Non-Destructive Expiration**:
   - **Free Community**: Default maximum capacity = 20 members.
   - **Active Sponsored Community**: Capacity = Plan's `memberCapacity` (e.g. 500 members).
   - **Expired Sponsorship**: Dynamic query-level expiration (`endsAt <= NOW()`) reverts effective capacity to 20 for *new* joins without deleting existing members.
5. **Subscription Plans & Stripe Price ID Mapping (No Fake Commercial Pricing)**:
   - `SubscriptionPlanConfig` entity maps plans (`SPONSOR_MONTHLY`, `SPONSOR_ANNUAL`, `VENDOR_MONTHLY`, `VENDOR_ANNUAL`) to configured `stripePriceId`, billing intervals, and reference amounts.
   - Checkout uses Stripe Price IDs rather than inventing hardcoded prices.
6. **Strict Webhook Transaction Boundaries**:
   - External Stripe API calls occur strictly OUTSIDE database transactions.
   - Flow:
     $$\text{Raw Body} \xrightarrow{\text{Verify Signature}} \text{Persist Event} \xrightarrow{\text{DB Transaction}} [\text{Payment} + \text{Entitlement} + \text{Audit} + \text{Outbox}] \rightarrow \text{COMMIT}$$
7. **Automated Financial Reconciliation**:
   - `PaymentReconciliationService` identifies stale `PENDING` payments (> 15 minutes old) and queries Stripe provider state to safely reconcile missing webhook deliveries.

---

## 2. Proposed Database Schema Changes (`prisma/schema.prisma`)

### New Enums
```prisma
enum PaymentStatus {
  PENDING
  REQUIRES_ACTION
  SUCCEEDED
  FAILED
  CANCELLED
  REFUNDED
  PARTIALLY_REFUNDED

  @@map("payment_status")
}

enum PaymentPurpose {
  COMMUNITY_SPONSORSHIP
  SUBSCRIPTION

  @@map("payment_purpose")
}

enum CommunitySponsorshipStatus {
  PENDING_PAYMENT
  ACTIVE
  EXPIRED
  CANCELLED
  REFUNDED

  @@map("community_sponsorship_status")
}

enum SubscriptionStatus {
  INCOMPLETE
  ACTIVE
  PAST_DUE
  CANCELLED
  UNPAID
  TRIALING

  @@map("subscription_status")
}

enum SubscriptionPlan {
  SPONSOR_MONTHLY
  SPONSOR_ANNUAL
  VENDOR_MONTHLY
  VENDOR_ANNUAL

  @@map("subscription_plan")
}

enum SubscriptionBillingInterval {
  MONTH
  YEAR

  @@map("subscription_billing_interval")
}

enum StripeWebhookStatus {
  PENDING
  PROCESSED
  FAILED
  IGNORED

  @@map("stripe_webhook_status")
}
```

### Extended `NotificationType`
- `COMMUNITY_SPONSORSHIP_PAID`
- `COMMUNITY_SPONSORSHIP_ACTIVATED`
- `COMMUNITY_SPONSORSHIP_EXPIRED`
- `SUBSCRIPTION_ACTIVATED`
- `SUBSCRIPTION_RENEWED`
- `SUBSCRIPTION_PAYMENT_FAILED`
- `SUBSCRIPTION_CANCELLED`
- `PAYMENT_REFUNDED`

### New Models
1. **`CommunitySponsorshipPlan`**: Configured sponsorship product definitions (price, capacity, duration).
2. **`CommunitySponsorship`**: Sponsorship contract linking `communityId`, `sponsorId`, `userId`, `planId`, `paymentId`, `startsAt`, `endsAt`.
3. **`SubscriptionPlanConfig`**: Subscription tier definitions linking `plan` to `stripePriceId`, target role, and intervals.
4. **`Subscription`**: Recurring business subscription tracking periods, cancellation flags, and Stripe references.
5. **`Payment`**: Authoritative payment ledger tracking amounts, currencies, status, idempotency keys, and refund metadata.
6. **`StripeWebhookEvent`**: Webhook receipt ledger with composite unique constraint `@@unique([provider, providerEventId])`.

### Modified Models
- **`SponsorProfile`**: Added `stripeCustomerId String? @unique`.
- **`VendorProfile`**: Added `stripeCustomerId String? @unique`.
- **`User`**: Added `stripeCustomerId String? @unique`, `payments`, `sponsorships`, `subscriptions`.
- **`Community`**: Added `sponsorships` relation.

---

## 3. Module & Component Plan

### 3.1 Infrastructure Layer (`src/infrastructure/payments`)
- `PaymentProvider` interface:
  - `createCheckoutSession(params)`: Supports mode `'payment'` or `'subscription'`.
  - `verifyWebhookSignature(payload: Buffer, signature: string)`.
  - `createOrGetCustomer(email: string, name: string, metadata: Record<string, string>)`.
  - `retrievePaymentIntent(id: string)`.
  - `retrieveCheckoutSession(id: string)`.
  - `cancelSubscription(id: string, immediately?: boolean)`.
  - `refundPayment(paymentIntentId: string, amountMinorUnits?: number, reason?: string)`.
- `StripePaymentProvider`: Production Stripe SDK implementation with test-friendly fallback.
- `src/main.ts`: Configures `rawBody: true` and `express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } })` to safeguard raw webhook verification.

### 3.2 Payments Module (`src/modules/payments`)
- `PaymentsService`: Payment lifecycle, state transitions, refunds, and idempotency.
- `StripeWebhookService`: Authoritative event processor handling `checkout.session.completed`, `payment_intent.*`, `invoice.*`, `customer.subscription.*`, `charge.refunded`.
- `RevenueService`: Financial aggregation queries for total revenue, active subscriptions, refund deductions, and volume.
- `PaymentReconciliationService`: Scheduled and on-demand reconciliation recovering delayed webhooks.
- Controllers:
  - `PaymentsController`: `/api/v1/payments`
  - `StripeWebhookController`: `/api/v1/payments/stripe/webhook`
  - `AdminRevenueController`: `/api/v1/admin/revenue`, `/api/v1/admin/payments`, `/api/v1/admin/payments/:id/refund`, `/api/v1/admin/payments/reconcile`

### 3.3 Community Sponsorship (`src/modules/communities`)
- `POST /api/v1/communities/:id/sponsorship`: Sponsor chooses plan; backend derives price and duration, records pending payment, and creates Stripe Checkout session.
- `GET /api/v1/communities/:id/sponsorship`: Retrieve active/pending sponsorship status.
- Fulfillment on webhook: Atomically updates payment to `SUCCEEDED`, activates sponsorship (`startsAt = now`, `endsAt = now + plan.durationDays`), and expands community capacity to `plan.memberCapacity`.
- Query-level dynamic expiration: Communities with expired sponsorships automatically clamp effective join capacity to 20 without deleting existing members.

### 3.4 Subscriptions Module (`src/modules/subscriptions`)
- `POST /api/v1/subscriptions/checkout`: Eligible Sponsor/Vendor initiates subscription; backend resolves `SubscriptionPlanConfig`, ensures business Stripe customer, and opens subscription checkout session.
- `GET /api/v1/subscriptions`: List user/business subscriptions.
- `GET /api/v1/subscriptions/:id`: Subscription details.
- `POST /api/v1/subscriptions/:id/cancel`: User or Admin cancellation.
- Webhook synchronization: Handles activations, renewals (`invoice.paid`), and lapses (`invoice.payment_failed` $\rightarrow$ `PAST_DUE`).

### 3.5 Notifications & Localized Emails
- 8 responsive email templates in `EmailTemplateService` with Arabic RTL (`dir="rtl"`) and English LTR layouts.
- Outbox handlers with deterministic idempotency keys (`payment-success:${paymentId}`, `sub-renewed:${invoiceId}`, etc.).

---

## 4. Verification Plan

### Automated Tests
1. **Unit Tests**:
   - `payments.service.spec.ts`: Amount calculations, state transitions, refund rules, ownership.
   - `stripe-webhook.service.spec.ts`: Signature checks, anti-replay deduplication, transaction atomicity.
   - `community-sponsorship.service.spec.ts`: Plan price derivation, capacity expansion, query expiration.
   - `subscriptions.service.spec.ts`: Plan lookup, customer deduplication, lifecycle states.
   - `revenue.service.spec.ts`: Accurate financial aggregation, refund deduction.
   - `payment-reconciliation.service.spec.ts`: Stale payment recovery, provider state repair.
2. **E2E Integration Suite (`test/payments.e2e-spec.ts`)**:
   - FLOW 1: Sponsored Community Checkout $\rightarrow$ Webhook $\rightarrow$ Capacity Expansion ($20 \rightarrow 500$).
   - FLOW 2: Duplicate Checkout & Anti-Double-Purchase Defense.
   - FLOW 3: Webhook Replay Idempotency (same event delivered twice processed once).
   - FLOW 4: Invalid/Tampered Webhook Signature (rejected with 400).
   - FLOW 5: Subscription Checkout $\rightarrow$ Webhook Activation.
   - FLOW 6: Failed Renewal (`invoice.payment_failed` $\rightarrow$ `PAST_DUE`).
   - FLOW 7: Subscription Cancellation.
   - FLOW 8: Financial IDOR Defense (User A cannot access User B's payments/subscriptions).
   - FLOW 9: Client Price Tampering (client-manipulated amount ignored, authoritative plan price used).
   - FLOW 10: Admin Revenue, Refunds, and Reconciliation Recovery.
3. **Full Regression Gates**:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run format:check`
   - `npm test`
   - `npm run test:e2e`
   - `npm run build`
   - `npx prisma validate`
