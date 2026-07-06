-- ════════════════════════════════════════════════════════════════════════
-- RBAC Phase Phân Quyền 2026-05-21 (anh chốt M2 Getfly Clone)
-- Reference: ~/.gstack/projects/zalocrm/thanh-rbac-m2-design-20260521.md
-- ════════════════════════════════════════════════════════════════════════

-- 1. DEPARTMENTS — tree shape, materialized path, max 5 level
CREATE TABLE "departments" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "org_id"        TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "parent_id"     TEXT,
  "path"          TEXT NOT NULL DEFAULT '',
  "depth"         INTEGER NOT NULL DEFAULT 0,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "archived_at"   TIMESTAMP(3),
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "departments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "departments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "departments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "chk_dept_depth_max" CHECK ("depth" >= 0 AND "depth" <= 4),
  CONSTRAINT "chk_dept_no_self_parent" CHECK ("id" != "parent_id")
);
CREATE INDEX "departments_org_id_path_idx" ON "departments"("org_id", "path");
CREATE INDEX "departments_parent_id_idx" ON "departments"("parent_id");

-- 2. DEPARTMENT_MEMBERS — 1 user ∈ 1 dept, partial unique cho leader/deputy
CREATE TABLE "department_members" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "department_id" TEXT NOT NULL,
  "user_id"       TEXT NOT NULL,
  "dept_role"     TEXT NOT NULL DEFAULT 'member',
  "joined_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "department_members_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "department_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "chk_dept_role" CHECK ("dept_role" IN ('leader', 'deputy', 'member'))
);
CREATE UNIQUE INDEX "department_members_user_id_key" ON "department_members"("user_id");
CREATE INDEX "department_members_department_id_dept_role_idx" ON "department_members"("department_id", "dept_role");

-- FIX eng-review: partial unique index thay EXCLUDE (idiomatic Postgres)
CREATE UNIQUE INDEX "uniq_one_leader_per_dept" ON "department_members"("department_id")
  WHERE "dept_role" = 'leader';
CREATE UNIQUE INDEX "uniq_one_deputy_per_dept" ON "department_members"("department_id")
  WHERE "dept_role" = 'deputy';

-- 3. PERMISSION_GROUPS — tree shape, grants JSONB blob
CREATE TABLE "permission_groups" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "org_id"        TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "parent_id"     TEXT,
  "is_system"     BOOLEAN NOT NULL DEFAULT false,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "grants"        JSONB NOT NULL DEFAULT '{}'::jsonb,
  "archived_at"   TIMESTAMP(3),
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "permission_groups_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "permission_groups_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "permission_groups"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "permission_groups_org_id_idx" ON "permission_groups"("org_id");
CREATE INDEX "permission_groups_grants_idx" ON "permission_groups" USING GIN ("grants");

-- 4. USER → PERMISSION_GROUP relation
ALTER TABLE "users" ADD COLUMN "permission_group_id" TEXT;
ALTER TABLE "users" ADD CONSTRAINT "users_permission_group_id_fkey"
  FOREIGN KEY ("permission_group_id") REFERENCES "permission_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "users_permission_group_id_idx" ON "users"("permission_group_id");

-- ════════════════════════════════════════════════════════════════════════
-- 5. TRIGGER: recompute_department_path()
-- FIX eng-review Issue 2: khi move dept (đổi parent_id), path + depth phải
-- recompute cho dept đó + TẤT CẢ subdepts atomic. Tránh tree inconsistent.
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION recompute_department_path() RETURNS TRIGGER AS $$
DECLARE
  new_path TEXT;
  new_depth INTEGER;
  old_path TEXT;
  old_depth INTEGER;
BEGIN
  -- INSERT path: cố định ngay từ đầu
  IF TG_OP = 'INSERT' THEN
    IF NEW.parent_id IS NULL THEN
      NEW.path := '/' || NEW.id || '/';
      NEW.depth := 0;
    ELSE
      SELECT path || NEW.id || '/', depth + 1
        INTO new_path, new_depth
        FROM departments WHERE id = NEW.parent_id;
      IF new_depth > 4 THEN
        RAISE EXCEPTION 'Department depth limit (5 levels) exceeded for dept %', NEW.name;
      END IF;
      NEW.path := new_path;
      NEW.depth := new_depth;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: chỉ recompute khi parent_id đổi
  IF TG_OP = 'UPDATE' AND OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
    old_path := OLD.path;
    old_depth := OLD.depth;
    -- Compute new path từ new parent
    IF NEW.parent_id IS NULL THEN
      NEW.path := '/' || NEW.id || '/';
      NEW.depth := 0;
    ELSE
      SELECT path || NEW.id || '/', depth + 1
        INTO new_path, new_depth
        FROM departments WHERE id = NEW.parent_id;
      -- Anti-cycle: new parent không được nằm trong subtree của old dept
      IF new_path LIKE old_path || '%' THEN
        RAISE EXCEPTION 'Cannot move department into its own subtree';
      END IF;
      IF new_depth > 4 THEN
        RAISE EXCEPTION 'Department depth limit (5 levels) exceeded';
      END IF;
      NEW.path := new_path;
      NEW.depth := new_depth;
    END IF;
    -- Cascade update mọi subdept
    UPDATE departments
      SET path = NEW.path || substring(path FROM length(old_path) + 1),
          depth = depth + (NEW.depth - old_depth),
          updated_at = CURRENT_TIMESTAMP
      WHERE path LIKE old_path || '%' AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_dept_recompute_path
  BEFORE INSERT OR UPDATE OF parent_id ON departments
  FOR EACH ROW EXECUTE FUNCTION recompute_department_path();

-- Sau migration:
-- - existing users vẫn dùng cột `role` (legacy)
-- - permission_group_id NULL → fallback `role` trong code dual-read window
-- - D13 sẽ chạy seed 7 default permission groups + map existing users
