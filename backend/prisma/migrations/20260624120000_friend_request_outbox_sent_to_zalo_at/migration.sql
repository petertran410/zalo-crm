-- Friend-invite BullMQ migration (2026-06-24) — idempotent send / dup-fix.
-- sent_to_zalo_at: mốc Zalo XÁC NHẬN đã gửi lời mời (set ở confirmSent SAU khi SDK trả OK).
--   NULL + sendStatus='pending' = mới ghi ý định, CHƯA chắc Zalo đã gửi (crash ở đây → an toàn gửi lại).
--   NOT NULL = Zalo đã nhận → KHÔNG gửi lại (chống trùng). Stuck sweeper dùng cột này phân nhánh.
-- Additive, nullable, IF NOT EXISTS → an toàn áp prod đang chạy.
ALTER TABLE "friend_request_outbox" ADD COLUMN IF NOT EXISTS "sent_to_zalo_at" TIMESTAMPTZ;
