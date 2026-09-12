-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "report_target_type" AS ENUM ('COMMUNITY_POST', 'COMMUNITY_REPLY', 'COMMUNITY_MEETUP', 'COMMUNITY_CHAT_MESSAGE', 'EVENT', 'COMMUNITY', 'SPONSOR_AD', 'C2B_SERVICE', 'VENDOR_SERVICE', 'USER');

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "target_type" "report_target_type" NOT NULL,
    "target_id" UUID NOT NULL,
    "reason" VARCHAR(100) NOT NULL,
    "description" VARCHAR(1000),
    "status" "report_status" NOT NULL DEFAULT 'OPEN',
    "resolved_by_user_id" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "resolution_note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_reporter_id_idx" ON "reports"("reporter_id");

-- CreateIndex
CREATE INDEX "reports_target_type_target_id_idx" ON "reports"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE INDEX "reports_created_at_idx" ON "reports"("created_at");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
