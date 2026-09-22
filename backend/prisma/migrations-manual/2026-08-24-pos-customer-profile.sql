-- ============================================================================
-- 2026-08-24-pos-customer-profile.sql — Hồ sơ tổ chức + nhóm khách POS
-- ============================================================================
-- Bổ sung 3 cột cho pos_customers (dự án dùng `prisma db push`, bảng đã có
-- dữ liệu nên thêm nullable trước, db push chỉ xác nhận sau):
--
--   organization    — tên công ty từ POS `organization`
--   tax_code        — mã số thuế từ POS `taxCode`
--   is_organization — POS `type` (1 = tổ chức/hộ KD, 0 = cá nhân)
--
-- Verify trên 500 khách thật (2026-08-24): type=1 → 61/61 có đủ organization +
-- taxCode; type=0 → không khách nào có. Hai cột này trả lời trực tiếp câu hỏi
-- "thuộc công ty/quán nào" trong Customer 360 — KHÔNG cần sale nhập tay.
--
-- Nhóm khách hàng (Khách buôn/lẻ…) + mã sale tách từ `groups` tái sử dụng cột
-- sẵn có customer_type / assigned_sale_name → không cần cột mới.
--
-- Chạy:
--   psql "$DATABASE_URL" -f prisma/migrations-manual/2026-08-24-pos-customer-profile.sql
--   npm run db:push
--
-- Idempotent. RLS: bảng đã bật tenant_isolation từ đợt 2026-08-24 trước.
-- ============================================================================

BEGIN;

ALTER TABLE "pos_customers" ADD COLUMN IF NOT EXISTS "organization" TEXT;
ALTER TABLE "pos_customers" ADD COLUMN IF NOT EXISTS "tax_code" TEXT;
ALTER TABLE "pos_customers" ADD COLUMN IF NOT EXISTS "is_organization" BOOLEAN;

COMMIT;

-- ── Rollback ────────────────────────────────────────────────────────────────
-- BEGIN;
--   ALTER TABLE "pos_customers"
--     DROP COLUMN IF EXISTS "organization",
--     DROP COLUMN IF EXISTS "tax_code",
--     DROP COLUMN IF EXISTS "is_organization";
-- COMMIT;
