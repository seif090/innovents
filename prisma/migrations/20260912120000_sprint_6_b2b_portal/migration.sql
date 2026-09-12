-- ==============================================================================
-- INOVENT Database Migration — Sprint 6: B2B Portal & Business Profiles
-- ==============================================================================

-- 1. Create InvitationStatus Enum
CREATE TYPE "invitation_status" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- 2. Alter NotificationType Enum to support Organizer Invitations
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'ORGANIZER_INVITATION_CREATED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'ORGANIZER_INVITATION_ACCEPTED';

-- 3. Extend users table with approval and suspension metadata
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "approved_by_user_id" UUID,
  ADD COLUMN IF NOT EXISTS "rejected_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "suspended_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "suspension_reason" TEXT;

-- 4. Create attendee_profiles
CREATE TABLE IF NOT EXISTS "attendee_profiles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL UNIQUE,
  "first_name" VARCHAR(100) NOT NULL,
  "last_name" VARCHAR(100) NOT NULL,
  "avatar_url" VARCHAR(500),
  "bio" VARCHAR(500),
  "job_title" VARCHAR(100),
  "company" VARCHAR(150),
  "interests" TEXT[] NOT NULL DEFAULT '{}',
  "city" VARCHAR(100),
  "country" VARCHAR(100),
  "social_links" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "fk_attendee_profiles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_attendee_profiles_user_id" ON "attendee_profiles"("user_id");

-- 5. Create sponsor_profiles
CREATE TABLE IF NOT EXISTS "sponsor_profiles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL UNIQUE,
  "company_name" VARCHAR(200) NOT NULL,
  "logo_url" VARCHAR(500),
  "website" VARCHAR(500),
  "description" TEXT,
  "industry" VARCHAR(100),
  "tier" VARCHAR(50),
  "contact_name" VARCHAR(150),
  "contact_email" VARCHAR(255),
  "contact_phone" VARCHAR(50),
  "address" VARCHAR(255),
  "city" VARCHAR(100),
  "country" VARCHAR(100),
  "documents" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "fk_sponsor_profiles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_sponsor_profiles_user_id" ON "sponsor_profiles"("user_id");

-- 6. Create vendor_profiles
CREATE TABLE IF NOT EXISTS "vendor_profiles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL UNIQUE,
  "company_name" VARCHAR(200) NOT NULL,
  "logo_url" VARCHAR(500),
  "website" VARCHAR(500),
  "description" TEXT,
  "service_category" VARCHAR(100) NOT NULL,
  "contact_name" VARCHAR(150),
  "contact_email" VARCHAR(255),
  "contact_phone" VARCHAR(50),
  "cr_number" VARCHAR(100),
  "tax_number" VARCHAR(100),
  "documents" JSONB,
  "address" VARCHAR(255),
  "city" VARCHAR(100),
  "country" VARCHAR(100),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "fk_vendor_profiles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_vendor_profiles_user_id" ON "vendor_profiles"("user_id");

-- 7. Create provider_profiles
CREATE TABLE IF NOT EXISTS "provider_profiles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL UNIQUE,
  "business_name" VARCHAR(200) NOT NULL,
  "logo_url" VARCHAR(500),
  "website" VARCHAR(500),
  "description" TEXT,
  "provider_type" VARCHAR(100) NOT NULL,
  "skills" TEXT[] NOT NULL DEFAULT '{}',
  "contact_name" VARCHAR(150),
  "contact_email" VARCHAR(255),
  "contact_phone" VARCHAR(50),
  "portfolio_url" VARCHAR(500),
  "city" VARCHAR(100),
  "country" VARCHAR(100),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "fk_provider_profiles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_provider_profiles_user_id" ON "provider_profiles"("user_id");

-- 8. Create event_owner_profiles
CREATE TABLE IF NOT EXISTS "event_owner_profiles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL UNIQUE,
  "organization_name" VARCHAR(200) NOT NULL,
  "logo_url" VARCHAR(500),
  "website" VARCHAR(500),
  "description" TEXT,
  "contact_name" VARCHAR(150),
  "contact_email" VARCHAR(255),
  "contact_phone" VARCHAR(50),
  "city" VARCHAR(100),
  "country" VARCHAR(100),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "fk_event_owner_profiles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_event_owner_profiles_user_id" ON "event_owner_profiles"("user_id");

-- 9. Create organizer_profiles
CREATE TABLE IF NOT EXISTS "organizer_profiles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL UNIQUE,
  "first_name" VARCHAR(100) NOT NULL,
  "last_name" VARCHAR(100) NOT NULL,
  "avatar_url" VARCHAR(500),
  "job_title" VARCHAR(100),
  "organization" VARCHAR(150),
  "phone" VARCHAR(50),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "fk_organizer_profiles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_organizer_profiles_user_id" ON "organizer_profiles"("user_id");

-- 10. Create media_profiles
CREATE TABLE IF NOT EXISTS "media_profiles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL UNIQUE,
  "media_outlet" VARCHAR(200) NOT NULL,
  "outlet_type" VARCHAR(100),
  "logo_url" VARCHAR(500),
  "website" VARCHAR(500),
  "press_card_number" VARCHAR(100),
  "contact_name" VARCHAR(150),
  "contact_email" VARCHAR(255),
  "contact_phone" VARCHAR(50),
  "coverage_interests" TEXT[] NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "fk_media_profiles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_media_profiles_user_id" ON "media_profiles"("user_id");

-- 11. Create organizer_invitations
CREATE TABLE IF NOT EXISTS "organizer_invitations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "event_owner_id" UUID NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL UNIQUE,
  "status" "invitation_status" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "accepted_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "accepted_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "fk_organizer_invitations_event" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_organizer_invitations_owner" FOREIGN KEY ("event_owner_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "fk_organizer_invitations_accepted_by" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "idx_organizer_invitations_event_status" ON "organizer_invitations"("event_id", "status");
CREATE INDEX IF NOT EXISTS "idx_organizer_invitations_email" ON "organizer_invitations"("email");
CREATE INDEX IF NOT EXISTS "idx_organizer_invitations_token_hash" ON "organizer_invitations"("token_hash");
CREATE INDEX IF NOT EXISTS "idx_organizer_invitations_expires_at" ON "organizer_invitations"("expires_at");
