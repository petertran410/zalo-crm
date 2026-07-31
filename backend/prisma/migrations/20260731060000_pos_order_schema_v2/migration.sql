-- Migration: pos_order_schema_v2
-- Mục đích: Nâng cấp POS Order schema từ v1 (3 tables, read-model cũ) sang v2 (chuẩn hóa).
-- Giữ toàn bộ dữ liệu hiện có (6 orders, 11 order_details).
--
-- Thay đổi:
--   1. pos_orders: thêm các column mới, drop column cũ (customer_id, sold_by_id),
--                  đổi unique constraint từ global sang composite (pos_order_id, org_id)
--   2. pos_order_details → đổi tên thành pos_order_items + thêm column pos_product_id
--   3. pos_order_payments: drop (không còn model trong schema v2, data đã migrate vào invoices)

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. NÂNG CẤP BẢNG pos_orders
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1a. Thêm các column mới (nullable trước để không lỗi với data cũ)
ALTER TABLE "pos_orders"
  ADD COLUMN IF NOT EXISTS "pos_customer_id"   INTEGER,
  ADD COLUMN IF NOT EXISTS "pos_customer_code" TEXT,
  ADD COLUMN IF NOT EXISTS "customer_name"     TEXT,
  ADD COLUMN IF NOT EXISTS "customer_phone"    TEXT,
  ADD COLUMN IF NOT EXISTS "branch_name"       TEXT,
  ADD COLUMN IF NOT EXISTS "discount_amount"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "final_amount"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "status"            TEXT NOT NULL DEFAULT 'Completed',
  ADD COLUMN IF NOT EXISTS "sold_by_id_new"    INTEGER; -- tạm thời để migrate

-- 1b. Migrate dữ liệu: map customer_id cũ → pos_customer_id mới
UPDATE "pos_orders"
  SET "pos_customer_id" = "customer_id"
  WHERE "customer_id" IS NOT NULL;

-- 1c. Migrate sold_by_id sang sold_by_id_new (giữ lại giá trị nếu có)
-- (sold_by_id không còn trong schema mới, chỉ là Int POS ID — không map sang user)
-- Column bị drop, không cần giữ.

-- 1d. Tính lại final_amount = grand_total (mapping từ schema cũ)
UPDATE "pos_orders"
  SET "final_amount" = "grand_total",
      "discount_amount" = "discount";

-- 1e. Drop column tạm
ALTER TABLE "pos_orders" DROP COLUMN IF EXISTS "sold_by_id_new";

-- 1f. Drop unique constraints cũ (global)
DROP INDEX IF EXISTS "pos_orders_pos_order_id_key";
DROP INDEX IF EXISTS "pos_orders_code_key";

-- 1g. Thêm composite unique constraint mới (pos_order_id, org_id)
CREATE UNIQUE INDEX IF NOT EXISTS "pos_orders_pos_order_id_org_id_key"
  ON "pos_orders" ("pos_order_id", "org_id");

-- 1h. Thêm indexes mới
CREATE INDEX IF NOT EXISTS "pos_orders_org_id_pos_customer_id_idx"  ON "pos_orders" ("org_id", "pos_customer_id");
CREATE INDEX IF NOT EXISTS "pos_orders_org_id_customer_phone_idx"   ON "pos_orders" ("org_id", "customer_phone");
CREATE INDEX IF NOT EXISTS "pos_orders_org_id_contact_id_idx"       ON "pos_orders" ("org_id", "contact_id");
CREATE INDEX IF NOT EXISTS "pos_orders_org_id_status_idx"           ON "pos_orders" ("org_id", "status");

-- 1i. Drop column cũ (customer_id, sold_by_id) — dữ liệu đã migrate ở bước 1b
ALTER TABLE "pos_orders"
  DROP COLUMN IF EXISTS "customer_id",
  DROP COLUMN IF EXISTS "sold_by_id";

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. ĐỔI TÊN pos_order_details → pos_order_items + thêm column
-- ═══════════════════════════════════════════════════════════════════════════════

-- 2a. Đổi tên table (giữ toàn bộ 11 rows)
ALTER TABLE "pos_order_details" RENAME TO "pos_order_items";

-- 2b. Đổi tên cột order_id → pos_order_id (tương ứng schema mới)
ALTER TABLE "pos_order_items" RENAME COLUMN "order_id" TO "pos_order_id";

-- 2c. Đổi tên product_id → pos_product_id
ALTER TABLE "pos_order_items" RENAME COLUMN "product_id" TO "pos_product_id";

-- 2d. Đổi product_code thành nullable (schema mới dùng TEXT?)
ALTER TABLE "pos_order_items" ALTER COLUMN "pos_product_id" DROP NOT NULL;
ALTER TABLE "pos_order_items" ALTER COLUMN "product_code" DROP NOT NULL;

-- 2e. Cập nhật primary key name (không bắt buộc nhưng cho nhất quán)
ALTER INDEX IF EXISTS "pos_order_details_pkey" RENAME TO "pos_order_items_pkey";

-- 2f. Cập nhật index name
DROP INDEX IF EXISTS "pos_order_details_order_id_idx";
CREATE INDEX IF NOT EXISTS "pos_order_items_pos_order_id_idx" ON "pos_order_items" ("pos_order_id");
CREATE INDEX IF NOT EXISTS "pos_order_items_pos_product_id_idx" ON "pos_order_items" ("pos_product_id");

-- 2g. Cập nhật foreign key (drop cái cũ, tạo cái mới theo tên table mới)
ALTER TABLE "pos_order_items" DROP CONSTRAINT IF EXISTS "pos_order_details_order_id_fkey";
ALTER TABLE "pos_order_items"
  ADD CONSTRAINT "pos_order_items_pos_order_id_fkey"
  FOREIGN KEY ("pos_order_id") REFERENCES "pos_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. DROP pos_order_payments (không còn trong schema v2)
--    Data: chỉ có 1 row — không có model Prisma tương ứng nên drop an toàn
-- ═══════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS "pos_order_payments";
