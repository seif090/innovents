-- ==============================================================================
-- INOVENT Database Migration — Sprint 7: B2B Marketplace, Services, RFQ & Quotations
-- ==============================================================================

-- 1. Create Enums
DO $$ BEGIN
  CREATE TYPE "pricing_model" AS ENUM ('FIXED', 'HOURLY', 'DAILY', 'PER_UNIT', 'CUSTOM');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "rfq_status" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'CLARIFICATION_REQUESTED', 'QUOTED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "quotation_status" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Alter NotificationType Enum with Sprint 7 event types
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'RFQ_SENT';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'RFQ_VIEWED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'RFQ_CLARIFICATION_REQUESTED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'RFQ_QUOTED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'RFQ_ACCEPTED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'RFQ_REJECTED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'RFQ_CANCELLED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'RFQ_EXPIRED';

-- 3. Create vendor_services
CREATE TABLE IF NOT EXISTS "vendor_services" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "vendor_id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "description" TEXT NOT NULL,
  "category" VARCHAR(100) NOT NULL,
  "pricing_model" "pricing_model" NOT NULL DEFAULT 'FIXED',
  "price" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'SAR',
  "delivery_duration" VARCHAR(100) NOT NULL,
  "service_areas" TEXT[] NOT NULL DEFAULT '{}',
  "tags" TEXT[] NOT NULL DEFAULT '{}',
  "minimum_order" INTEGER NOT NULL DEFAULT 1,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "fk_vendor_services_vendor" FOREIGN KEY ("vendor_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_vendor_services_vendor_active" ON "vendor_services"("vendor_id", "is_active");
CREATE INDEX IF NOT EXISTS "idx_vendor_services_category_active" ON "vendor_services"("category", "is_active");
CREATE INDEX IF NOT EXISTS "idx_vendor_services_created_at" ON "vendor_services"("created_at");
CREATE INDEX IF NOT EXISTS "idx_vendor_services_deleted_at" ON "vendor_services"("deleted_at");

-- 4. Create rfqs
CREATE TABLE IF NOT EXISTS "rfqs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sponsor_id" UUID NOT NULL,
  "vendor_id" UUID NOT NULL,
  "event_id" UUID,
  "title" VARCHAR(200) NOT NULL,
  "description" TEXT NOT NULL,
  "requirements" TEXT,
  "status" "rfq_status" NOT NULL DEFAULT 'DRAFT',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "sent_at" TIMESTAMPTZ(6),
  "viewed_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "accepted_at" TIMESTAMPTZ(6),
  "rejected_at" TIMESTAMPTZ(6),
  "cancellation_reason" TEXT,
  "rejection_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "fk_rfqs_sponsor" FOREIGN KEY ("sponsor_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_rfqs_vendor" FOREIGN KEY ("vendor_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_rfqs_event" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_rfqs_sponsor_created" ON "rfqs"("sponsor_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_rfqs_vendor_status_created" ON "rfqs"("vendor_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "idx_rfqs_status_expires" ON "rfqs"("status", "expires_at");

-- 5. Create rfq_items
CREATE TABLE IF NOT EXISTS "rfq_items" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "rfq_id" UUID NOT NULL,
  "vendor_service_id" UUID,
  "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unit" VARCHAR(50),
  "target_price" DECIMAL(12, 2),
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "fk_rfq_items_rfq" FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_rfq_items_service" FOREIGN KEY ("vendor_service_id") REFERENCES "vendor_services"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_rfq_items_rfq_id" ON "rfq_items"("rfq_id");

-- 6. Create rfq_clarifications
CREATE TABLE IF NOT EXISTS "rfq_clarifications" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "rfq_id" UUID NOT NULL,
  "sender_id" UUID NOT NULL,
  "message" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_rfq_clarifications_rfq" FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_rfq_clarifications_sender" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_rfq_clarifications_rfq_created" ON "rfq_clarifications"("rfq_id", "created_at");

-- 7. Create quotations
CREATE TABLE IF NOT EXISTS "quotations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "rfq_id" UUID NOT NULL,
  "vendor_id" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "quotation_status" NOT NULL DEFAULT 'PENDING',
  "subtotal" DECIMAL(12, 2) NOT NULL,
  "tax" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "discount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "total" DECIMAL(12, 2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'SAR',
  "valid_until" TIMESTAMPTZ(6) NOT NULL,
  "notes" TEXT,
  "accepted_at" TIMESTAMPTZ(6),
  "rejected_at" TIMESTAMPTZ(6),
  "rejection_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "fk_quotations_rfq" FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_quotations_vendor" FOREIGN KEY ("vendor_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "uq_quotations_rfq_version" UNIQUE ("rfq_id", "version")
);

CREATE INDEX IF NOT EXISTS "idx_quotations_rfq_status" ON "quotations"("rfq_id", "status");
CREATE INDEX IF NOT EXISTS "idx_quotations_vendor_created" ON "quotations"("vendor_id", "created_at");

-- 8. Create quotation_items
CREATE TABLE IF NOT EXISTS "quotation_items" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "quotation_id" UUID NOT NULL,
  "rfq_item_id" UUID,
  "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unit_price" DECIMAL(12, 2) NOT NULL,
  "total" DECIMAL(12, 2) NOT NULL,
  "notes" TEXT,
  CONSTRAINT "fk_quotation_items_quotation" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_quotation_items_rfq_item" FOREIGN KEY ("rfq_item_id") REFERENCES "rfq_items"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_quotation_items_quotation_id" ON "quotation_items"("quotation_id");
