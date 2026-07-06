-- Phase Privacy OTP 2026-05-27
-- Thay PIN tự setup bằng OTP 4 số gửi Zalo nick nội bộ. 1 row per request gửi OTP.

CREATE TABLE IF NOT EXISTS "privacy_otp_tokens" (
  "id"                        TEXT NOT NULL PRIMARY KEY,
  "user_id"                   TEXT NOT NULL,
  "otp_hash"                  TEXT NOT NULL,
  "session_duration_minutes"  INTEGER NOT NULL,
  "expires_at"                TIMESTAMP(3) NOT NULL,
  "verify_attempts"           INTEGER NOT NULL DEFAULT 0,
  "last_sent_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "used_at"                   TIMESTAMP(3),
  "ip_address"                TEXT,
  "user_agent"                TEXT,
  CONSTRAINT "privacy_otp_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "privacy_otp_tokens_user_id_expires_at_idx"
  ON "privacy_otp_tokens" ("user_id", "expires_at");

CREATE INDEX IF NOT EXISTS "privacy_otp_tokens_user_id_created_at_idx"
  ON "privacy_otp_tokens" ("user_id", "created_at" DESC);
