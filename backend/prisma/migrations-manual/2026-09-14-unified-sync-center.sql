-- ==============================================================================
-- TÍNH NĂNG: Unified Sync Center - Bổ sung các thực thể đồng bộ POS & Workshop
-- NGÀY TẠO: 2026-09-14
-- ==============================================================================

-- 1. Bổ sung cột metadata cho bảng sync_jobs (nếu chưa có)
ALTER TABLE "sync_jobs" ADD COLUMN IF NOT EXISTS "metadata" JSONB DEFAULT '{}';

-- 2. Bảng Chi nhánh POS (pos_branches)
CREATE TABLE IF NOT EXISTS "pos_branches" (
  "id" VARCHAR(36) PRIMARY KEY,
  "org_id" VARCHAR(36) NOT NULL,
  "branch_id" INTEGER NOT NULL,
  "branch_name" VARCHAR(255) NOT NULL,
  "address" TEXT,
  "contact_number" VARCHAR(50),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_pos_branches_org" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "pos_branches_org_id_branch_id_key" ON "pos_branches"("org_id", "branch_id");
CREATE INDEX IF NOT EXISTS "pos_branches_org_id_is_active_idx" ON "pos_branches"("org_id", "is_active");

-- 3. Bảng Danh mục hàng hóa POS (pos_categories)
CREATE TABLE IF NOT EXISTS "pos_categories" (
  "id" VARCHAR(36) PRIMARY KEY,
  "org_id" VARCHAR(36) NOT NULL,
  "category_id" INTEGER NOT NULL,
  "category_name" VARCHAR(255) NOT NULL,
  "parent_id" INTEGER,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_pos_categories_org" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "pos_categories_org_id_category_id_key" ON "pos_categories"("org_id", "category_id");
CREATE INDEX IF NOT EXISTS "pos_categories_org_id_is_active_idx" ON "pos_categories"("org_id", "is_active");

-- 4. Bảng Nhật ký Check-in Workshop (workshop_checkin_logs)
CREATE TABLE IF NOT EXISTS "workshop_checkin_logs" (
  "id" VARCHAR(36) PRIMARY KEY,
  "org_id" VARCHAR(36) NOT NULL,
  "external_log_id" VARCHAR(255) NOT NULL,
  "workshop_id" VARCHAR(36) NOT NULL,
  "guest_id" VARCHAR(255) NOT NULL,
  "scanned_at" TIMESTAMP WITH TIME ZONE NOT NULL,
  "method" VARCHAR(50) DEFAULT 'QR',
  "checked_in_by" VARCHAR(255),
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_workshop_checkin_logs_org" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "workshop_checkin_logs_org_id_external_log_id_key" ON "workshop_checkin_logs"("org_id", "external_log_id");
CREATE INDEX IF NOT EXISTS "workshop_checkin_logs_org_id_workshop_id_idx" ON "workshop_checkin_logs"("org_id", "workshop_id");
CREATE INDEX IF NOT EXISTS "workshop_checkin_logs_org_id_scanned_at_idx" ON "workshop_checkin_logs"("org_id", "scanned_at" DESC);

-- 5. Bảng Biểu mẫu đăng ký Workshop (workshop_registration_forms)
CREATE TABLE IF NOT EXISTS "workshop_registration_forms" (
  "id" VARCHAR(36) PRIMARY KEY,
  "org_id" VARCHAR(36) NOT NULL,
  "token" VARCHAR(255) NOT NULL,
  "workshop_id" VARCHAR(36) NOT NULL,
  "title" VARCHAR(255),
  "description" TEXT,
  "fields" JSONB DEFAULT '[]',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_workshop_registration_forms_org" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "workshop_registration_forms_org_id_token_key" ON "workshop_registration_forms"("org_id", "token");
CREATE INDEX IF NOT EXISTS "workshop_registration_forms_org_id_workshop_id_idx" ON "workshop_registration_forms"("org_id", "workshop_id");
