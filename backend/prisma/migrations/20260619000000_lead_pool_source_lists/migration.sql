-- 2026-06-19 (D) — Lead Pool: target tệp khách hàng cụ thể.
-- Additive, an toàn: thêm cột source_list_ids (JSON array customer_list ids).
-- Rỗng "[]" = lấy mọi tệp shareable_to_pool=true (hành vi cũ, không đổi behavior khi deploy).
ALTER TABLE "lead_pool_configs"
  ADD COLUMN IF NOT EXISTS "source_list_ids" JSONB NOT NULL DEFAULT '[]';
