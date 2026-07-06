-- Phase user-create-with-zalo 2026-05-27
-- 3 cột Org config cho flow tạo user gộp Zalo handshake:
--   welcome_message_template = template markup admin sửa được, BE substitute placeholder lúc gửi
--   welcome_image_url        = ảnh đính kèm (1 ảnh per org, admin upload)
--   admin_fallback_phone     = SĐT admin nhận credentials text-plain khi tin gửi sale fail
-- Tất cả nullable — org chưa setup vẫn dùng flow được với template default ở code,
-- không có ảnh đính kèm, fail thì log + để admin xem trong UI (không gửi fallback).

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "welcome_message_template" TEXT,
  ADD COLUMN IF NOT EXISTS "welcome_image_url"        TEXT,
  ADD COLUMN IF NOT EXISTS "admin_fallback_phone"     TEXT;

-- FIX codex review HIGH-1 2026-05-27: chống race condition khi 2 admin tạo user khác nhau
-- với cùng UID Zalo. App-level precheck không đủ — cần DB unique enforce. Postgres NULL
-- semantics cho phép nhiều row có thread_id_in_sender_view=NULL (recipient chưa setup) cùng tồn tại.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_recipient_sender_thread"
  ON "system_notify_recipients" ("sender_zalo_account_id", "thread_id_in_sender_view");

-- UI refactor 2026-05-27: avatar nhân viên lấy từ Zalo nick (findUser response → User.avatarUrl).
-- Hiển thị trong UsersRbacView. Nullable vì user legacy chưa qua flow create-with-zalo.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "avatar_url" TEXT;

-- Status 4-state 2026-05-27: track last login để derive Im lặng (>3d) vs Hoạt động.
-- null = chưa từng login → Chưa kích hoạt khi kết hợp với passwordChangedAt=null.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP(3);
