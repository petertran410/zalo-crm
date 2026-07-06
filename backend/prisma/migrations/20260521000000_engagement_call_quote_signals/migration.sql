-- Engagement signals expansion 2026-05-21: anh chốt 6 nhóm hiển thị
--   1. ❤️ Thả tim, 2. 💬 Trả lời (%), 3. 📞 Cuộc gọi (NEW),
--   4. 📎 Ảnh/file/video, 5. ⚡ KH chủ động, 6. ↩️ Reply (NEW)
ALTER TABLE "contact_engagement_daily"
  ADD COLUMN IF NOT EXISTS "call_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "quote_reply_count" INTEGER NOT NULL DEFAULT 0;
