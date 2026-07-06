-- Edit audit 2026-05-21: zca-js không support edit message thật → CRM edit chỉ local.
-- Lưu original_content (lần sửa đầu) + edited_at để UI hiển thị badge "(đã sửa)".
ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "original_content" TEXT,
  ADD COLUMN IF NOT EXISTS "edited_at" TIMESTAMP(3);
