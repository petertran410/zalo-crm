-- Migration: fix_pos_composite_unique
-- Mục đích: Đổi unique constraint từ global (pos_id) sang composite (pos_id, org_id)
-- để mỗi org có bản ghi sản phẩm/khách hàng riêng biệt, không bị conflict với org khác.

-- ─── 1. pos_products ──────────────────────────────────────────────────────────

-- Xóa data cũ bị gán sai org (sẽ đồng bộ lại qua Sync UI)
TRUNCATE TABLE pos_products;

-- Xóa unique constraints cũ (global)
ALTER TABLE pos_products DROP CONSTRAINT IF EXISTS pos_products_pos_id_key;
ALTER TABLE pos_products DROP CONSTRAINT IF EXISTS pos_products_code_key;

-- Thêm composite unique constraints mới (theo org)
ALTER TABLE pos_products ADD CONSTRAINT pos_products_pos_id_org_id_key  UNIQUE (pos_id, org_id);
ALTER TABLE pos_products ADD CONSTRAINT pos_products_code_org_id_key    UNIQUE (code,   org_id);

-- ─── 2. pos_customers ─────────────────────────────────────────────────────────

-- Xóa data cũ bị gán sai org (sẽ đồng bộ lại qua Sync UI)
TRUNCATE TABLE pos_customers;

-- Xóa unique constraint cũ (global)
ALTER TABLE pos_customers DROP CONSTRAINT IF EXISTS pos_customers_pos_id_key;

-- Thêm composite unique constraint mới (theo org)
ALTER TABLE pos_customers ADD CONSTRAINT pos_customers_pos_id_org_id_key UNIQUE (pos_id, org_id);
