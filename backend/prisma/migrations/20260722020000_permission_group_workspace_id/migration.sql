-- ════════════════════════════════════════════════════════════════════════
-- Workspace ID on Permission Groups 2026-07-22
-- Mục đích: Gắn workspace_id trực tiếp vào permission_groups thay vì
--   đoán bằng string matching trên name.
--
-- Giá trị hợp lệ (phải khớp WorkspaceId trong frontend/src/workspaces/types.ts):
--   sales | customer-care | manager | admin |
--   marketing | finance | director | warehouse | call-center
--
-- NULL = chưa xác định → resolver.ts fallback về string matching (backward compat).
-- ════════════════════════════════════════════════════════════════════════

-- Step 1: Thêm cột workspace_id (nullable, không có FK — đây là string enum)
ALTER TABLE "permission_groups"
  ADD COLUMN "workspace_id" TEXT DEFAULT NULL;

-- Step 2: Thêm CHECK constraint để tránh typo khi update thủ công
ALTER TABLE "permission_groups"
  ADD CONSTRAINT "chk_permission_group_workspace_id"
  CHECK (
    "workspace_id" IS NULL OR
    "workspace_id" IN (
      'sales',
      'customer-care',
      'manager',
      'admin',
      'marketing',
      'finance',
      'director',
      'warehouse',
      'call-center'
    )
  );

-- Step 3: Index để resolver query nhanh khi cần lookup ngược (workspace → groups)
CREATE INDEX "permission_groups_workspace_id_idx"
  ON "permission_groups"("workspace_id")
  WHERE "workspace_id" IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════
-- Step 4: Backfill 7 default system groups (is_system = true)
-- Dùng UPDATE ... WHERE name = ... để đúng ngôn ngữ (tên đã seed sẵn).
-- Các org custom group (is_system = false) để NULL → admin tự gán sau.
-- ════════════════════════════════════════════════════════════════════════

UPDATE "permission_groups"
  SET "workspace_id" = 'admin'
  WHERE "is_system" = true AND "name" = 'Admin';

UPDATE "permission_groups"
  SET "workspace_id" = 'admin'
  WHERE "is_system" = true AND "name" = 'CEO';

UPDATE "permission_groups"
  SET "workspace_id" = 'manager'
  WHERE "is_system" = true AND "name" = 'Trưởng phòng';

UPDATE "permission_groups"
  SET "workspace_id" = 'sales'
  WHERE "is_system" = true AND "name" = 'Sale Senior';

UPDATE "permission_groups"
  SET "workspace_id" = 'sales'
  WHERE "is_system" = true AND "name" = 'Sale';

UPDATE "permission_groups"
  SET "workspace_id" = 'marketing'
  WHERE "is_system" = true AND "name" = 'Marketing';

UPDATE "permission_groups"
  SET "workspace_id" = 'admin'
  WHERE "is_system" = true AND "name" = 'Hành chính - Nhân sự';

-- ════════════════════════════════════════════════════════════════════════
-- Ghi chú:
-- - Sau migration, chạy lại seed-default-groups.ts nếu cần tạo groups cho
--   org mới (seed đã được update để kèm workspace_id).
-- - Để gán workspace cho custom group: UPDATE permission_groups SET
--   workspace_id = '<id>' WHERE id = '<group_id>';
-- - Frontend resolver.ts sẽ đọc user.workspaceId (từ profile API) thay
--   vì string matching permissionGroupName.
-- ════════════════════════════════════════════════════════════════════════
