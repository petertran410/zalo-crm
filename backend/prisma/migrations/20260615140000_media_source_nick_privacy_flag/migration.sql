-- 2026-06-15: Media — hiện "ảnh từ nick nào" cho MỌI ảnh + tách cờ enforce privacy.
--
-- Bối cảnh: saveOneMessageToMedia trước đây CHỈ ghi source_zalo_account_id khi nick Riêng
-- tư (privacyMode='main'). Nay ghi cho MỌI ảnh lưu từ chat (cả nick thường) để hiện nguồn.
-- Hệ quả: code cũ suy cờ privacy từ `!!source_zalo_account_id` sẽ BẬT NHẦM cho ảnh nick
-- thường. Tách 1 cột riêng `source_is_private_nick` làm cờ ENFORCE privacy.
--
-- Cột mới + index (chống N+1 khi join nick nguồn cho list 60-200 ảnh).
ALTER TABLE "media_assets"
  ADD COLUMN "source_is_private_nick" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "media_assets_source_zalo_account_id_idx"
  ON "media_assets" ("source_zalo_account_id");

-- BACKFILL ẢNH CŨ (CRITICAL privacy): trước giờ source_zalo_account_id CHỈ có giá trị khi
-- nick Riêng tư → set cờ = (đã có id). Đúng 100% cho dữ liệu cũ, giữ nguyên bảo vệ ảnh
-- Riêng tư đã lưu (không mất gate confirmShare / cảnh báo D11 khi public).
UPDATE "media_assets"
  SET "source_is_private_nick" = true
  WHERE "source_zalo_account_id" IS NOT NULL;
