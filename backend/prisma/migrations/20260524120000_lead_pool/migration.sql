-- Phase Lead Pool 2026-05-24 — Nhận Lead feature
-- Schema: LeadRequest + LeadPoolConfig + CustomerList.shareableToPool
-- Idempotent với IF NOT EXISTS.

-- 1. CustomerList field
ALTER TABLE "customer_lists"
  ADD COLUMN IF NOT EXISTS "shareable_to_pool" BOOLEAN NOT NULL DEFAULT false;

-- 2. lead_pool_configs (per org)
CREATE TABLE IF NOT EXISTS "lead_pool_configs" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "max_requests_per_day" INTEGER NOT NULL DEFAULT 10,
  "cooldown_minutes" INTEGER NOT NULL DEFAULT 15,
  "forgotten_threshold_days" INTEGER NOT NULL DEFAULT 30,
  "excluded_statuses" JSONB NOT NULL DEFAULT '["hot","potential","won"]',
  "auto_return_after_days" INTEGER NOT NULL DEFAULT 7,
  "force_note_before_next" BOOLEAN NOT NULL DEFAULT true,
  "enabled_sources" JSONB NOT NULL DEFAULT '["forgotten","customer_list"]',
  "note_min_length" INTEGER NOT NULL DEFAULT 20,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "lead_pool_configs_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'lead_pool_configs_org_id_key') THEN
    CREATE UNIQUE INDEX "lead_pool_configs_org_id_key" ON "lead_pool_configs"("org_id");
  END IF;
END$$;

ALTER TABLE "lead_pool_configs"
  DROP CONSTRAINT IF EXISTS "lead_pool_configs_org_id_fkey",
  ADD CONSTRAINT "lead_pool_configs_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. lead_requests (audit + state machine)
CREATE TABLE IF NOT EXISTS "lead_requests" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "requested_by_user_id" TEXT NOT NULL,
  "contact_id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "priority_score" INTEGER NOT NULL,
  "note_content" TEXT,
  "note_submitted_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "auto_returned_at" TIMESTAMP(3),
  "release_reason" TEXT,
  "previous_assignee_id" TEXT,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "lead_requests_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'lead_requests_org_user_requested_at_idx') THEN
    CREATE INDEX "lead_requests_org_user_requested_at_idx" ON "lead_requests"("org_id", "requested_by_user_id", "requested_at" DESC);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'lead_requests_contact_requested_at_idx') THEN
    CREATE INDEX "lead_requests_contact_requested_at_idx" ON "lead_requests"("contact_id", "requested_at" DESC);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'lead_requests_user_note_idx') THEN
    CREATE INDEX "lead_requests_user_note_idx" ON "lead_requests"("requested_by_user_id", "note_submitted_at");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'lead_requests_expires_returned_idx') THEN
    CREATE INDEX "lead_requests_expires_returned_idx" ON "lead_requests"("expires_at", "auto_returned_at");
  END IF;
END$$;

ALTER TABLE "lead_requests"
  DROP CONSTRAINT IF EXISTS "lead_requests_org_id_fkey",
  ADD CONSTRAINT "lead_requests_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  DROP CONSTRAINT IF EXISTS "lead_requests_requested_by_user_id_fkey",
  ADD CONSTRAINT "lead_requests_requested_by_user_id_fkey"
    FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON UPDATE CASCADE,
  DROP CONSTRAINT IF EXISTS "lead_requests_contact_id_fkey",
  ADD CONSTRAINT "lead_requests_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
