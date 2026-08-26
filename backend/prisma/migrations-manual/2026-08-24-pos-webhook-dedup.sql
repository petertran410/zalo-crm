-- ============================================================================
-- 2026-08-24-pos-webhook-dedup.sql — Chống xử lý trùng POS webhook
-- ============================================================================
-- Dự án dùng `prisma db push` (không có thư mục migrations). `db push` sẽ FAIL
-- hoặc đòi reset khi thêm cột NOT NULL vào bảng đã có dữ liệu, nên chạy file
-- này TRƯỚC, sau đó `db push` chỉ còn việc xác nhận schema đã khớp.
--
-- Thay đổi:
--   1. pos_webhook_logs.payload_hash — SHA-256 của raw body, chặn xử lý lại
--      cùng một lô dữ liệu khi POS gửi trùng (tài liệu POS xác nhận có thể
--      gửi lại: PUBLIC-API.md §8 "Quy tắc gửi lại").
--   2. UNIQUE (org_id, payload_hash) — hash scope theo tenant, không toàn cục.
--   3. RLS cho pos_webhook_logs — bảng có org_id nhưng bị sót ở tenant-rls.sql.
--
-- Cách chạy (staging trước, rồi production):
--   psql "$DATABASE_URL" -f prisma/migrations-manual/2026-08-24-pos-webhook-dedup.sql
--   npm run db:push
--
-- Biến môi trường bắt buộc kèm theo (receiver fail-closed nếu thiếu):
--   POS_WEBHOOK_SECRET=<đúng chuỗi đã khai khi đăng ký webhook bên POS, 16-255 ký tự>
--   POS_WEBHOOK_ORG_ID=<uuid organization nhận dữ liệu>
-- Không lấy orgId từ payload/header: payload public của POS không có trường này
-- và client không được phép tự chọn tenant.
--
-- Idempotent: chạy lại nhiều lần không lỗi.
-- ============================================================================

BEGIN;

-- ── 1. Thêm cột dạng nullable trước ─────────────────────────────────────────
ALTER TABLE "pos_webhook_logs"
  ADD COLUMN IF NOT EXISTS "payload_hash" TEXT;

-- ── 2. Backfill bản ghi cũ ──────────────────────────────────────────────────
-- Log cũ không còn raw body (chỉ còn payload đã parse) nên không thể tính lại
-- đúng hash mà receiver sinh ra. Dùng giá trị theo id để:
--   - thoả NOT NULL + UNIQUE,
--   - KHÔNG vô tình khớp với hash thật của webhook tương lai (tiền tố khác).
-- Hệ quả: một webhook cũ nếu POS gửi lại sẽ được xử lý một lần nữa. Chấp nhận
-- được vì batch upsert theo id là idempotent.
UPDATE "pos_webhook_logs"
   SET "payload_hash" = 'legacy:' || "id"
 WHERE "payload_hash" IS NULL;

-- ── 3. Siết NOT NULL ────────────────────────────────────────────────────────
ALTER TABLE "pos_webhook_logs"
  ALTER COLUMN "payload_hash" SET NOT NULL;

-- ── 4. Unique theo tenant ───────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "pos_webhook_logs_org_id_payload_hash_key"
  ON "pos_webhook_logs" ("org_id", "payload_hash");

-- ── 5. Index tra cứu theo loại resource ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS "pos_webhook_logs_org_id_event_type_idx"
  ON "pos_webhook_logs" ("org_id", "event_type");

-- ── 6. RLS — đồng bộ với prisma/rls/tenant-rls.sql ──────────────────────────
ALTER TABLE "pos_webhook_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_webhook_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "pos_webhook_logs";
CREATE POLICY tenant_isolation ON "pos_webhook_logs"
  USING ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on');

COMMIT;

-- ── Rollback ────────────────────────────────────────────────────────────────
-- BEGIN;
--   DROP INDEX IF EXISTS "pos_webhook_logs_org_id_payload_hash_key";
--   DROP INDEX IF EXISTS "pos_webhook_logs_org_id_event_type_idx";
--   ALTER TABLE "pos_webhook_logs" DROP COLUMN IF EXISTS "payload_hash";
--   DROP POLICY IF EXISTS tenant_isolation ON "pos_webhook_logs";
--   ALTER TABLE "pos_webhook_logs" DISABLE ROW LEVEL SECURITY;
-- COMMIT;
