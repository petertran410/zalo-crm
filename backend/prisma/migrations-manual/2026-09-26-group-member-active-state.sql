ALTER TABLE "group_members"
  ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "left_at" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "group_members_zalo_account_id_member_uid_is_active_idx"
  ON "group_members" ("zalo_account_id", "member_uid", "is_active");
