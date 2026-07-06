-- Phase Lead Pool FIFO 2026-06-15 — vòng tua công bằng (thay điểm số + random).
-- Design: docs/DESIGN-LEAD-POOL-FIFO-VONG-TUA-20260615.md
-- Idempotent với IF NOT EXISTS.

-- 1. Contact: 2 cột vòng tua
ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "last_pooled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pooled_count" INTEGER NOT NULL DEFAULT 0;

-- 2. Index phục vụ ORDER BY vòng tua. Khai NULLS FIRST đúng hướng sort
--    (pooled_count ASC, last_pooled_at ASC NULLS FIRST). Prisma @@index không khai
--    được NULLS FIRST nên tự thêm tay ở đây + thêm created_at để index phủ tie-break.
DROP INDEX IF EXISTS "contacts_org_id_pooled_count_last_pooled_at_idx";
CREATE INDEX IF NOT EXISTS "contacts_pool_robin_idx"
  ON "contacts" ("org_id", "pooled_count" ASC, "last_pooled_at" ASC NULLS FIRST, "created_at" ASC);

-- 3. Backfill từ lịch sử lead_requests. Mỗi LeadRequest = 1 lần đã chia.
--    CAP LEAST(count, 3): bug chia-trùng CŨ (chính bệnh đang fix) khiến vài lead có
--    count cao bất thường → không cap sẽ bị CHÔN đáy vĩnh viễn dù là lỗi hệ thống.
UPDATE "contacts" c SET
  "pooled_count" = LEAST(sub.cnt, 3),
  "last_pooled_at" = sub.last_at
FROM (
  SELECT "contact_id", COUNT(*)::int AS cnt, MAX("requested_at") AS last_at
  FROM "lead_requests" GROUP BY "contact_id"
) sub
WHERE c."id" = sub."contact_id";

-- 4. Bảng sổ phát lead (view Nhật ký chia + đếm số lần)
CREATE TABLE IF NOT EXISTS "lead_pool_distributions" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "contact_id" TEXT,
  "phone_normalized" TEXT,
  "assigned_to_user_id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "round" INTEGER NOT NULL,
  "lead_request_id" TEXT,
  "distributed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_pool_distributions_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "lead_pool_distributions"
    ADD CONSTRAINT "lead_pool_distributions_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "lead_pool_distributions"
    ADD CONSTRAINT "lead_pool_distributions_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "lead_pool_distributions"
    ADD CONSTRAINT "lead_pool_distributions_assigned_to_user_id_fkey"
    FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "lead_pool_distributions_org_id_distributed_at_idx"
  ON "lead_pool_distributions" ("org_id", "distributed_at" DESC);
CREATE INDEX IF NOT EXISTS "lead_pool_distributions_org_id_assigned_to_user_id_distributed_at_idx"
  ON "lead_pool_distributions" ("org_id", "assigned_to_user_id", "distributed_at" DESC);
CREATE INDEX IF NOT EXISTS "lead_pool_distributions_contact_id_distributed_at_idx"
  ON "lead_pool_distributions" ("contact_id", "distributed_at" DESC);
