-- 2026-05-28: Greeting templates configurable per-org. Empty array = service fallback default.
ALTER TABLE "lead_pool_configs"
  ADD COLUMN "greeting_templates" JSONB NOT NULL DEFAULT '[]'::jsonb;
