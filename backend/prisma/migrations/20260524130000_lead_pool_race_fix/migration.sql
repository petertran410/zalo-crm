-- Phase Lead Pool 2026-05-24 — race condition hardening per codex review.
-- 1. Partial unique index — đảm bảo MỘT active lead_request per contact tại 1 thời điểm.
--    Active = chưa submit note + chưa release + chưa auto-return.
-- 2. Partial index trên contacts để tối ưu forgotten query.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'lead_requests_one_active_per_contact') THEN
    CREATE UNIQUE INDEX "lead_requests_one_active_per_contact"
      ON "lead_requests"("contact_id")
      WHERE "note_submitted_at" IS NULL
        AND "release_reason" IS NULL
        AND "auto_returned_at" IS NULL;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'contacts_forgotten_pool_idx') THEN
    CREATE INDEX "contacts_forgotten_pool_idx"
      ON "contacts"("org_id", "last_activity")
      WHERE "last_activity" IS NOT NULL
        AND "merged_into" IS NULL
        AND "consent_status" != 'revoked';
  END IF;
END$$;
