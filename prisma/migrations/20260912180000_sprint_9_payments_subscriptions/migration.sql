-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('PENDING', 'REQUIRES_ACTION', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "payment_purpose" AS ENUM ('COMMUNITY_SPONSORSHIP', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "community_sponsorship_status" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('INCOMPLETE', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'UNPAID', 'TRIALING');

-- CreateEnum
CREATE TYPE "subscription_plan" AS ENUM ('SPONSOR_MONTHLY', 'SPONSOR_ANNUAL', 'VENDOR_MONTHLY', 'VENDOR_ANNUAL');

-- CreateEnum
CREATE TYPE "subscription_billing_interval" AS ENUM ('MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "stripe_webhook_status" AS ENUM ('PENDING', 'PROCESSED', 'FAILED', 'IGNORED');

-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'COMMUNITY_SPONSORSHIP_PAID';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'COMMUNITY_SPONSORSHIP_ACTIVATED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'COMMUNITY_SPONSORSHIP_EXPIRED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_ACTIVATED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_RENEWED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_PAYMENT_FAILED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_CANCELLED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'PAYMENT_REFUNDED';

-- AlterTable users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_customer_id" VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS "users_stripe_customer_id_key" ON "users"("stripe_customer_id");

-- AlterTable sponsor_profiles
ALTER TABLE "sponsor_profiles" ADD COLUMN IF NOT EXISTS "stripe_customer_id" VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS "sponsor_profiles_stripe_customer_id_key" ON "sponsor_profiles"("stripe_customer_id");

-- AlterTable vendor_profiles
ALTER TABLE "vendor_profiles" ADD COLUMN IF NOT EXISTS "stripe_customer_id" VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_profiles_stripe_customer_id_key" ON "vendor_profiles"("stripe_customer_id");

-- CreateTable community_sponsorship_plans
CREATE TABLE "community_sponsorship_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "price" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'SAR',
    "member_capacity" INTEGER NOT NULL DEFAULT 500,
    "duration_days" INTEGER NOT NULL DEFAULT 30,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_sponsorship_plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "community_sponsorship_plans_code_key" ON "community_sponsorship_plans"("code");

-- CreateTable community_sponsorships
CREATE TABLE "community_sponsorships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "community_id" UUID NOT NULL,
    "sponsor_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "payment_id" UUID,
    "status" "community_sponsorship_status" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'SAR',
    "sponsored_capacity" INTEGER NOT NULL,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "stripe_checkout_session_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_sponsorships_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "community_sponsorships_payment_id_key" ON "community_sponsorships"("payment_id");
CREATE UNIQUE INDEX "community_sponsorships_stripe_checkout_session_id_key" ON "community_sponsorships"("stripe_checkout_session_id");
CREATE INDEX "community_sponsorships_community_id_idx" ON "community_sponsorships"("community_id");
CREATE INDEX "community_sponsorships_sponsor_id_idx" ON "community_sponsorships"("sponsor_id");
CREATE INDEX "community_sponsorships_user_id_idx" ON "community_sponsorships"("user_id");
CREATE INDEX "community_sponsorships_status_idx" ON "community_sponsorships"("status");
CREATE INDEX "community_sponsorships_ends_at_idx" ON "community_sponsorships"("ends_at");

-- CreateTable subscription_plan_configs
CREATE TABLE "subscription_plan_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plan" "subscription_plan" NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "target_role" VARCHAR(50) NOT NULL,
    "stripe_price_id" VARCHAR(100),
    "price" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'SAR',
    "interval" "subscription_billing_interval" NOT NULL DEFAULT 'MONTH',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_plan_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subscription_plan_configs_plan_key" ON "subscription_plan_configs"("plan");

-- CreateTable subscriptions
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "sponsor_profile_id" UUID,
    "vendor_profile_id" UUID,
    "plan_config_id" UUID NOT NULL,
    "plan" "subscription_plan" NOT NULL,
    "status" "subscription_status" NOT NULL DEFAULT 'INCOMPLETE',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'SAR',
    "interval" "subscription_billing_interval" NOT NULL DEFAULT 'MONTH',
    "stripe_customer_id" VARCHAR(100) NOT NULL,
    "stripe_subscription_id" VARCHAR(100) NOT NULL,
    "current_period_start" TIMESTAMPTZ(6),
    "current_period_end" TIMESTAMPTZ(6),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "canceled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions"("user_id");
CREATE INDEX "subscriptions_sponsor_profile_id_idx" ON "subscriptions"("sponsor_profile_id");
CREATE INDEX "subscriptions_vendor_profile_id_idx" ON "subscriptions"("vendor_profile_id");
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");
CREATE INDEX "subscriptions_current_period_end_idx" ON "subscriptions"("current_period_end");

-- CreateTable payments
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "sponsor_profile_id" UUID,
    "vendor_profile_id" UUID,
    "subscription_id" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'SAR',
    "status" "payment_status" NOT NULL DEFAULT 'PENDING',
    "purpose" "payment_purpose" NOT NULL,
    "provider" VARCHAR(50) NOT NULL DEFAULT 'stripe',
    "stripe_payment_intent_id" VARCHAR(255),
    "stripe_checkout_session_id" VARCHAR(255),
    "stripe_invoice_id" VARCHAR(255),
    "idempotency_key" VARCHAR(255),
    "metadata" JSONB,
    "paid_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "refunded_at" TIMESTAMPTZ(6),
    "refund_amount" DECIMAL(12,2),
    "refund_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payments_stripe_payment_intent_id_key" ON "payments"("stripe_payment_intent_id");
CREATE UNIQUE INDEX "payments_stripe_checkout_session_id_key" ON "payments"("stripe_checkout_session_id");
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");
CREATE INDEX "payments_user_id_idx" ON "payments"("user_id");
CREATE INDEX "payments_sponsor_profile_id_idx" ON "payments"("sponsor_profile_id");
CREATE INDEX "payments_vendor_profile_id_idx" ON "payments"("vendor_profile_id");
CREATE INDEX "payments_status_idx" ON "payments"("status");
CREATE INDEX "payments_purpose_idx" ON "payments"("purpose");
CREATE INDEX "payments_created_at_idx" ON "payments"("created_at");

-- CreateTable stripe_webhook_events
CREATE TABLE "stripe_webhook_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" VARCHAR(50) NOT NULL DEFAULT 'stripe',
    "provider_event_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "processing_status" "stripe_webhook_status" NOT NULL DEFAULT 'PENDING',
    "processed_at" TIMESTAMPTZ(6),
    "failure_reason" VARCHAR(1000),
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stripe_webhook_events_provider_event_id_key" ON "stripe_webhook_events"("provider_event_id");
CREATE UNIQUE INDEX "stripe_webhook_events_provider_provider_event_id_key" ON "stripe_webhook_events"("provider", "provider_event_id");
CREATE INDEX "stripe_webhook_events_provider_event_id_idx" ON "stripe_webhook_events"("provider_event_id");
CREATE INDEX "stripe_webhook_events_processing_status_idx" ON "stripe_webhook_events"("processing_status");

-- AddForeignKey
ALTER TABLE "community_sponsorships" ADD CONSTRAINT "community_sponsorships_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_sponsorships" ADD CONSTRAINT "community_sponsorships_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_sponsorships" ADD CONSTRAINT "community_sponsorships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_sponsorships" ADD CONSTRAINT "community_sponsorships_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "community_sponsorship_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "community_sponsorships" ADD CONSTRAINT "community_sponsorships_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_sponsor_profile_id_fkey" FOREIGN KEY ("sponsor_profile_id") REFERENCES "sponsor_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_vendor_profile_id_fkey" FOREIGN KEY ("vendor_profile_id") REFERENCES "vendor_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_config_id_fkey" FOREIGN KEY ("plan_config_id") REFERENCES "subscription_plan_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_sponsor_profile_id_fkey" FOREIGN KEY ("sponsor_profile_id") REFERENCES "sponsor_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_vendor_profile_id_fkey" FOREIGN KEY ("vendor_profile_id") REFERENCES "vendor_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
