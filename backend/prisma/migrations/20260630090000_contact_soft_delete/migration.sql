-- Soft delete (Thùng rác) cho Contact — 2026-06-30
-- archivedAt IS NULL = active; != NULL = archived (ẩn khỏi danh sách chính).
-- Hard-delete chỉ qua endpoint purge từ Thùng rác (owner/admin).

ALTER TABLE "contacts"
  ADD COLUMN "archived_at" TIMESTAMP(3),
  ADD COLUMN "archived_by_id" TEXT;

-- FK nhẹ tới users — khi user bị xóa thì set NULL (không cascade xóa contact).
ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_archived_by_id_fkey"
  FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- Index phục vụ: WHERE orgId = ? AND archivedAt IS NULL (list chính) và WHERE archivedAt IS NOT NULL (Thùng rác).
CREATE INDEX "contacts_org_id_archived_at_idx" ON "contacts"("org_id", "archived_at");