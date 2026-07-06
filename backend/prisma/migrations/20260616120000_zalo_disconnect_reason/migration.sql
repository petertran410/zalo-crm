-- 2026-06-16 (Anh chốt): "Ngắt kết nối là phải ngắt thật".
-- Phân biệt ngắt THỦ CÔNG (không tự reconnect) vs mất kết nối THỤ ĐỘNG (đếm thời gian tăng).
--   disconnected_at   = mốc nick rời connected (FE hiển thị/đếm từ đây).
--   disconnect_reason = 'manual' | 'passive' | NULL (đang connected).
-- Cron health-check + autoReconnect BỎ QUA nick reason='manual'.
ALTER TABLE "zalo_accounts"
  ADD COLUMN "disconnected_at" TIMESTAMP(3),
  ADD COLUMN "disconnect_reason" TEXT;

-- BACKFILL: nick CŨ đang disconnected KHÔNG set 'manual' (tránh chặn auto-reconnect nhầm nick
-- đang chờ hồi). Để NULL → cron vẫn reconnect như cũ. Chỉ nick ngắt-thủ-công TỪ NAY mới gắn
-- 'manual'. (Không cần backfill disconnected_at — nick đang chờ hồi không cần mốc cố định.)
