-- Phase Internal Contact 2-method 2026-05-23
-- Sale chọn 1 trong 2 cách nhận system notification:
--   'crm_nick'       = dùng nick OWN (đã có internal_contact_zalo_account_id)
--   'personal_phone' = nhập SĐT Zalo cá nhân (mới: internal_contact_phone)
-- + verify code 4 số chống fake / sai SĐT.
-- Idempotent với IF NOT EXISTS để safe với DB divergence.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "internal_contact_method"       TEXT,
  ADD COLUMN IF NOT EXISTS "internal_contact_phone"        TEXT,
  ADD COLUMN IF NOT EXISTS "internal_contact_setup_at"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "internal_contact_confirmed_at" TIMESTAMP(3);

ALTER TABLE "system_notify_recipients"
  ADD COLUMN IF NOT EXISTS "verify_code"             TEXT,
  ADD COLUMN IF NOT EXISTS "verify_code_expires_at"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "verify_attempts"         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "friend_request_sent_at"  TIMESTAMP(3);

-- Backfill: user đã có internal_contact_zalo_account_id → giả định method = 'crm_nick'
-- nhưng CHƯA confirmed (vì chưa qua handshake mới). Sale sẽ phải re-setup để verify.
UPDATE "users"
SET "internal_contact_method" = 'crm_nick',
    "internal_contact_setup_at" = NOW()
WHERE "internal_contact_zalo_account_id" IS NOT NULL
  AND "internal_contact_method" IS NULL;
