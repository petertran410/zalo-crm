-- GĐ13a (2026-06-13): Thùng rác Media + tự dọn 30 ngày.
-- Dùng LẠI cột archivedAt sẵn có làm dấu thùng rác (asset archivedAt != null = đang trong thùng rác).
-- Chỉ thêm 1 cột: ai đã bỏ asset vào thùng rác (audit + scope sale khôi phục đồ của mình).
-- KHÔNG đụng byte MinIO (33/36 blob kho dùng chung object với lịch sử chat → xóa byte = vỡ ảnh chat).
-- Index [org_id, archived_at] ĐÃ CÓ SẴN từ migration media_library → cron quét nhanh, khỏi thêm.

ALTER TABLE "media_assets"
  ADD COLUMN "trashed_by_id" TEXT;
