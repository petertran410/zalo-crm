-- Phase Onboarding v1 2026-05-24
-- 4-step first-run setup: force password change + connect nick + internal contact + optional PIN.
-- Idempotent với IF NOT EXISTS để safe với DB divergence.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "password_changed_at"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "onboarding_steps_completed"  JSONB,
  ADD COLUMN IF NOT EXISTS "onboarding_dismissed_at"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "jwt_token_version"           INTEGER NOT NULL DEFAULT 0;

-- Backfill: user cũ (trước phase này) coi như đã đổi password xong, không bị force.
UPDATE "users"
SET "password_changed_at" = "created_at"
WHERE "password_changed_at" IS NULL
  AND "created_at" < '2026-05-24'::timestamp;
