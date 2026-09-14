CREATE TYPE "oauth_provider" AS ENUM ('GOOGLE', 'LINKEDIN');

CREATE TABLE "oauth_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "oauth_provider" NOT NULL,
    "provider_account_id" VARCHAR(255) NOT NULL,
    "provider_email" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "last_login_at" TIMESTAMPTZ(6),

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oauth_accounts_provider_provider_account_id_key"
ON "oauth_accounts"("provider", "provider_account_id");

CREATE UNIQUE INDEX "oauth_accounts_user_id_provider_key"
ON "oauth_accounts"("user_id", "provider");

CREATE INDEX "oauth_accounts_user_id_idx"
ON "oauth_accounts"("user_id");

CREATE INDEX "oauth_accounts_provider_provider_email_idx"
ON "oauth_accounts"("provider", "provider_email");

ALTER TABLE "oauth_accounts"
ADD CONSTRAINT "oauth_accounts_user_id_fkey"
FOREIGN KEY ("user_id")
REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;