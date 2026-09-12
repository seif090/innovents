-- ==============================================================================
-- INOVENT Database Migration — Sprint 8: C2B Marketplace, Coupons & Sponsor Ads
-- ==============================================================================

-- 1. Create Enums
DO $$ BEGIN
  CREATE TYPE "c2b_service_category" AS ENUM ('ACCOMMODATION', 'TRANSPORTATION', 'RESTAURANTS', 'COUPONS', 'TRAVEL_SERVICES', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "c2b_booking_status" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "discount_type" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "sponsor_ad_status" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'PAUSED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "sponsor_ad_placement" AS ENUM ('MARKETPLACE', 'EVENT_PAGE', 'BANNER_TOP', 'SIDEBAR');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Alter NotificationType Enum with Sprint 8 event types
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'C2B_BOOKING_REQUESTED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'C2B_BOOKING_STATUS_CHANGED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'SPONSOR_AD_SUBMITTED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'SPONSOR_AD_APPROVED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'SPONSOR_AD_REJECTED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'COUPON_REDEEMED';

-- 3. Create c2b_services
CREATE TABLE IF NOT EXISTS "c2b_services" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "category" "c2b_service_category" NOT NULL DEFAULT 'OTHER',
  "short_description" VARCHAR(300) NOT NULL,
  "detailed_description" TEXT NOT NULL,
  "images" TEXT[] NOT NULL DEFAULT '{}',
  "price" DECIMAL(12, 2),
  "discount_percentage" INTEGER,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'SAR',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "contact_method" VARCHAR(50) NOT NULL,
  "contact_value" VARCHAR(255),
  "promotional_code" VARCHAR(50),
  "max_bookings" INTEGER,
  "booking_count" INTEGER NOT NULL DEFAULT 0,
  "is_available" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "fk_c2b_services_provider" FOREIGN KEY ("provider_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_c2b_services_event" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_c2b_services_provider_available" ON "c2b_services"("provider_id", "is_available");
CREATE INDEX IF NOT EXISTS "idx_c2b_services_event_category_available" ON "c2b_services"("event_id", "category", "is_available");
CREATE INDEX IF NOT EXISTS "idx_c2b_services_expires_at" ON "c2b_services"("expires_at");
CREATE INDEX IF NOT EXISTS "idx_c2b_services_deleted_at" ON "c2b_services"("deleted_at");

-- 4. Create c2b_bookings
CREATE TABLE IF NOT EXISTS "c2b_bookings" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "service_id" UUID NOT NULL,
  "attendee_id" UUID NOT NULL,
  "provider_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "status" "c2b_booking_status" NOT NULL DEFAULT 'PENDING',
  "notes" TEXT,
  "provider_notes" TEXT,
  "contact_method" VARCHAR(50),
  "contact_value" VARCHAR(255),
  "requested_date" TIMESTAMPTZ(6),
  "confirmed_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "fk_c2b_bookings_service" FOREIGN KEY ("service_id") REFERENCES "c2b_services"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_c2b_bookings_attendee" FOREIGN KEY ("attendee_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_c2b_bookings_provider" FOREIGN KEY ("provider_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_c2b_bookings_event" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_c2b_bookings_attendee_created" ON "c2b_bookings"("attendee_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_c2b_bookings_provider_status_created" ON "c2b_bookings"("provider_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "idx_c2b_bookings_service_status" ON "c2b_bookings"("service_id", "status");

-- 5. Create coupons
CREATE TABLE IF NOT EXISTS "coupons" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "service_id" UUID,
  "code" VARCHAR(50) NOT NULL,
  "normalized_code" VARCHAR(50) NOT NULL,
  "description" TEXT,
  "discount_type" "discount_type" NOT NULL DEFAULT 'PERCENTAGE',
  "discount_value" DECIMAL(10, 2) NOT NULL,
  "max_redemptions" INTEGER,
  "redemption_count" INTEGER NOT NULL DEFAULT 0,
  "starts_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "fk_coupons_provider" FOREIGN KEY ("provider_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_coupons_event" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_coupons_service" FOREIGN KEY ("service_id") REFERENCES "c2b_services"("id") ON DELETE SET NULL,
  CONSTRAINT "uq_coupons_normalized_code" UNIQUE ("normalized_code")
);

CREATE INDEX IF NOT EXISTS "idx_coupons_provider_active" ON "coupons"("provider_id", "is_active");
CREATE INDEX IF NOT EXISTS "idx_coupons_event_active" ON "coupons"("event_id", "is_active");
CREATE INDEX IF NOT EXISTS "idx_coupons_expires_at" ON "coupons"("expires_at");

-- 6. Create coupon_redemptions
CREATE TABLE IF NOT EXISTS "coupon_redemptions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "coupon_id" UUID NOT NULL,
  "attendee_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "service_id" UUID,
  "discount_amount" DECIMAL(10, 2),
  "idempotency_key" VARCHAR(128),
  "redeemed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_coupon_redemptions_coupon" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_coupon_redemptions_attendee" FOREIGN KEY ("attendee_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_coupon_redemptions_event" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE,
  CONSTRAINT "uq_coupon_redemptions_coupon_attendee" UNIQUE ("coupon_id", "attendee_id"),
  CONSTRAINT "uq_coupon_redemptions_idempotency" UNIQUE ("idempotency_key")
);

CREATE INDEX IF NOT EXISTS "idx_coupon_redemptions_attendee_redeemed" ON "coupon_redemptions"("attendee_id", "redeemed_at");

-- 7. Create sponsor_ads
CREATE TABLE IF NOT EXISTS "sponsor_ads" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sponsor_id" UUID NOT NULL,
  "event_id" UUID,
  "title" VARCHAR(200) NOT NULL,
  "description" TEXT NOT NULL,
  "image_url" VARCHAR(500) NOT NULL,
  "destination_url" VARCHAR(500) NOT NULL,
  "placement" "sponsor_ad_placement" NOT NULL DEFAULT 'MARKETPLACE',
  "status" "sponsor_ad_status" NOT NULL DEFAULT 'DRAFT',
  "rejection_reason" TEXT,
  "reviewed_by_user_id" UUID,
  "reviewed_at" TIMESTAMPTZ(6),
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "ends_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "fk_sponsor_ads_sponsor" FOREIGN KEY ("sponsor_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_sponsor_ads_event" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL,
  CONSTRAINT "fk_sponsor_ads_reviewer" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_sponsor_ads_sponsor_status_created" ON "sponsor_ads"("sponsor_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "idx_sponsor_ads_status_dates" ON "sponsor_ads"("status", "starts_at", "ends_at");
CREATE INDEX IF NOT EXISTS "idx_sponsor_ads_event_status" ON "sponsor_ads"("event_id", "status");
CREATE INDEX IF NOT EXISTS "idx_sponsor_ads_deleted_at" ON "sponsor_ads"("deleted_at");
