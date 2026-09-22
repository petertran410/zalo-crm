-- ==============================================================================
-- TÍNH NĂNG: Thẻ Nhãn CRM Công khai / Riêng tư (Public vs Private CRM Tags)
-- MỤC ĐÍCH: Bổ sung 2 cột is_private và created_by_id cho bảng tags để phân quyền
--          và lưu trữ thẻ nhãn dùng chung (public) hoặc cá nhân (private).
-- NGÀY TẠO: 2026-09-10
-- ==============================================================================

ALTER TABLE tags ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS created_by_id VARCHAR(36);

CREATE INDEX IF NOT EXISTS idx_tags_org_private_creator ON tags(org_id, is_private, created_by_id);

COMMENT ON COLUMN tags.is_private IS 'Đánh dấu tag riêng tư (chỉ người tạo và quản lý nhìn thấy)';
COMMENT ON COLUMN tags.created_by_id IS 'ID người tạo tag (User.id)';