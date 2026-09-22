-- ==============================================================================
-- TÍNH NĂNG: Customer Journey - Sản phẩm đang quan tâm (Product Interests)
-- MỤC ĐÍCH: Bảng độc lập lưu trữ các sản phẩm khách hàng đang quan tâm được
--          trích xuất từ nội dung hội thoại chat Zalo thông qua Gemini AI API.
-- ĐẶC ĐIỂM: KHÔNG ràng buộc khóa ngoại (foreign key) với các bảng khác để phục vụ
--          giai đoạn thử nghiệm, dễ chỉnh sửa, xóa và audit lịch sử quét.
-- NGÀY TẠO: 2026-09-03
-- ==============================================================================

CREATE TABLE IF NOT EXISTS "customer_product_interests" (
  "id" VARCHAR(36) PRIMARY KEY,
  "org_id" VARCHAR(36),
  "contact_id" VARCHAR(36) NOT NULL,
  "customer_name" VARCHAR(255),
  "scanned_by_user_id" VARCHAR(36),
  "scanned_by_name" VARCHAR(255),
  "product_name" VARCHAR(255) NOT NULL,
  "intent" VARCHAR(100),
  "notes" TEXT,
  "status" VARCHAR(50) DEFAULT 'inquiring',
  "is_deleted" BOOLEAN DEFAULT FALSE,
  "sales_delete_note" TEXT,
  "scanned_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_cpi_contact_deleted" ON "customer_product_interests"("contact_id", "is_deleted");
CREATE INDEX IF NOT EXISTS "idx_cpi_scanned_at" ON "customer_product_interests"("scanned_at");

COMMENT ON TABLE "customer_product_interests" IS 'Bảng độc lập lưu sản phẩm khách hàng quan tâm bóc tách từ chat Zalo qua Gemini AI';
COMMENT ON COLUMN "customer_product_interests"."customer_name" IS 'Tên khách hàng tại thời điểm quét';
COMMENT ON COLUMN "customer_product_interests"."scanned_by_name" IS 'Tên nhân viên Sale đã bấm nút quét';
COMMENT ON COLUMN "customer_product_interests"."sales_delete_note" IS 'Ghi chú giải trình của Sale khi bấm xóa sản phẩm';
