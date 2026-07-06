-- Phase Lead Pool v2 2026-05-27 — granular auto-return (phút) + require phone filter.

ALTER TABLE "lead_pool_configs"
  ADD COLUMN IF NOT EXISTS "auto_return_after_minutes" INTEGER NOT NULL DEFAULT 1440,
  ADD COLUMN IF NOT EXISTS "require_phone_in_pool" BOOLEAN NOT NULL DEFAULT true;

-- Backfill: copy ngày → phút cho org đã setup trước (ngày × 1440)
UPDATE "lead_pool_configs"
SET "auto_return_after_minutes" = "auto_return_after_days" * 1440
WHERE "auto_return_after_minutes" = 1440
  AND "auto_return_after_days" != 1;
