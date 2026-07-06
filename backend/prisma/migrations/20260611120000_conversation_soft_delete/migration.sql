-- 2026-06-11 — Xóa mềm hội thoại từ cột 2 (anh chốt: ẩn đi, khôi phục được).
-- Thêm cột deleted_at nullable + index lookup. KHÔNG đụng data hiện có.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "conversations_org_id_deleted_at_idx" ON "conversations" ("org_id", "deleted_at");
