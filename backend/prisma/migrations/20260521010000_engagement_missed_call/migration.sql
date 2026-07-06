-- Engagement signals 2026-05-21 (anh chốt option C): tách call nhỡ riêng để weight thấp hơn
--   call_count        — duration > 0  (connected, weight 35)
--   missed_call_count — duration = 0  (intent yếu hơn, weight 5)
ALTER TABLE "contact_engagement_daily"
  ADD COLUMN IF NOT EXISTS "missed_call_count" INTEGER NOT NULL DEFAULT 0;
