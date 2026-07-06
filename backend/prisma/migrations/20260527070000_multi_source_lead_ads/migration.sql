-- Phase Multi-Source Lead Ads 2026-05-27
-- Adapter Pattern foundation — adds 4 tables (facebook_page_accounts,
-- webhook_logs, meta_campaign_cache, notify_dedup_state) + columns trên
-- customer_lists (integration_key, display_inline_fields) +
-- customer_list_entries (custom_fields, source_meta).

-- ============================================================================
-- AlterTable customer_lists — gắn #KEY in tên campaign cho routing tự động
-- ============================================================================
ALTER TABLE "customer_lists"
  ADD COLUMN "integration_key" TEXT,
  ADD COLUMN "display_inline_fields" JSONB;

CREATE UNIQUE INDEX "customer_lists_org_id_integration_key_key"
  ON "customer_lists"("org_id", "integration_key");

-- ============================================================================
-- AlterTable customer_list_entries — schemaless form payload + audit trail
-- ============================================================================
ALTER TABLE "customer_list_entries"
  ADD COLUMN "custom_fields" JSONB,
  ADD COLUMN "source_meta" JSONB;

-- ============================================================================
-- CreateTable facebook_page_accounts — multi-tenant page connections
-- ============================================================================
CREATE TABLE "facebook_page_accounts" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "page_name" TEXT,
  "encrypted_access_token" TEXT NOT NULL,
  "webhook_verify_token" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "connected_by_user_id" TEXT,
  "subscribed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_webhook_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "facebook_page_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "facebook_page_accounts_page_id_key"
  ON "facebook_page_accounts"("page_id");
CREATE INDEX "facebook_page_accounts_org_id_is_active_idx"
  ON "facebook_page_accounts"("org_id", "is_active");

ALTER TABLE "facebook_page_accounts"
  ADD CONSTRAINT "facebook_page_accounts_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- CreateTable webhook_logs — outbox + audit cho mọi ad-network delivery
-- ============================================================================
CREATE TABLE "webhook_logs" (
  "id" TEXT NOT NULL,
  "org_id" TEXT,
  "source" TEXT NOT NULL,
  "external_lead_id" TEXT NOT NULL,
  "raw_body" JSONB NOT NULL,
  "signature" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_retry_at" TIMESTAMP(3),
  "error_message" TEXT,
  "created_entry_id" TEXT,
  "processing_steps" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webhook_logs_external_lead_id_key"
  ON "webhook_logs"("external_lead_id");
CREATE INDEX "webhook_logs_source_status_next_retry_at_idx"
  ON "webhook_logs"("source", "status", "next_retry_at");
CREATE INDEX "webhook_logs_org_id_source_created_at_idx"
  ON "webhook_logs"("org_id", "source", "created_at");

-- ============================================================================
-- CreateTable meta_campaign_cache — 5-min TTL cache campaign_id → list_id
-- ============================================================================
CREATE TABLE "meta_campaign_cache" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "campaign_name" TEXT NOT NULL,
  "matched_key" TEXT,
  "matched_list_id" TEXT,
  "cached_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "meta_campaign_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "meta_campaign_cache_campaign_id_key"
  ON "meta_campaign_cache"("campaign_id");
CREATE INDEX "meta_campaign_cache_matched_list_id_idx"
  ON "meta_campaign_cache"("matched_list_id");

-- ============================================================================
-- CreateTable notify_dedup_state — dedup notify storm trong 24h window
-- ============================================================================
CREATE TABLE "notify_dedup_state" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "notify_key" TEXT NOT NULL,
  "counter" INTEGER NOT NULL DEFAULT 1,
  "first_sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notify_dedup_state_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notify_dedup_state_org_id_notify_key_key"
  ON "notify_dedup_state"("org_id", "notify_key");
CREATE INDEX "notify_dedup_state_expires_at_idx"
  ON "notify_dedup_state"("expires_at");
