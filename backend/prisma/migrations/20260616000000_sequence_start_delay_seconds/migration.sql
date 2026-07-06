-- 2026-06-16: Wizard B3 — ô "Delay sau lời mời → bước 1 bám đuổi" cho nhập GIÂY (mặc định 10s).
--
-- Trước đây delay này lưu ở sequence_start_delay_minutes (Int phút), nhỏ nhất khác 0 là 1 phút.
-- Thêm cột giây NULLABLE (additive, an toàn): Mục tiêu CŨ giữ NULL → consumer fallback
-- sequence_start_delay_minutes × 60 (hành vi không đổi). Mục tiêu mới ghi giây chính xác.
-- 0 = gửi ngay (không delay). Không đụng dữ liệu cũ.
ALTER TABLE "automation_triggers" ADD COLUMN "sequence_start_delay_seconds" INTEGER;
