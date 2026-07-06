-- 2026-06-06 (Anh chốt) — Trần SDK Zalo cấu hình được (org default + nick override).

CREATE TABLE "sdk_limits" (
  "id"               TEXT NOT NULL,
  "org_id"           TEXT NOT NULL,
  "zalo_account_id"  TEXT,
  "category"         TEXT NOT NULL,
  "daily_limit"      INTEGER NOT NULL,
  "burst_limit"      INTEGER NOT NULL,
  "burst_window_ms"  INTEGER NOT NULL DEFAULT 30000,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sdk_limits_pkey" PRIMARY KEY ("id")
);

-- Partial unique: org default (1 hàng/org/category khi nick NULL).
CREATE UNIQUE INDEX "sdk_limits_org_default_key"
  ON "sdk_limits"("org_id", "category") WHERE "zalo_account_id" IS NULL;
-- Partial unique: nick override (1 hàng/nick/category khi nick NOT NULL).
CREATE UNIQUE INDEX "sdk_limits_nick_override_key"
  ON "sdk_limits"("zalo_account_id", "category") WHERE "zalo_account_id" IS NOT NULL;
CREATE INDEX "sdk_limits_org_id_zalo_account_id_idx"
  ON "sdk_limits"("org_id", "zalo_account_id");

ALTER TABLE "sdk_limits"
  ADD CONSTRAINT "sdk_limits_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sdk_limits"
  ADD CONSTRAINT "sdk_limits_zalo_account_id_fkey"
  FOREIGN KEY ("zalo_account_id") REFERENCES "zalo_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed org default = đúng CATEGORY_LIMITS hardcode hiện tại, cho MỌI org đang có.
-- (zalo_account_id NULL = trần mặc định hệ thống.)
INSERT INTO "sdk_limits" ("id","org_id","zalo_account_id","category","daily_limit","burst_limit","burst_window_ms","created_at","updated_at")
SELECT gen_random_uuid()::text, o."id", NULL, v.category, v.daily, v.burst, v.win, NOW(), NOW()
FROM "organizations" o
CROSS JOIN (VALUES
  ('message',      200,  20, 30000),
  ('reaction',     300,  10, 30000),
  ('chat_action',  500,  15, 30000),
  ('group_admin',  50,   5,  60000),
  ('group_read',   1000, 20, 30000),
  ('friend_action',30,   8,  60000),
  ('friend_read',  500,  10, 30000),
  ('profile',      10,   3,  60000),
  ('query',        2000, 30, 30000)
) AS v(category, daily, burst, win)
ON CONFLICT DO NOTHING;
