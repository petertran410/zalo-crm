-- Migration 2026-06-04: Khối nội dung Phase 1 MVP
-- Anh chốt Office Hours + 4 Mockup approved.
-- Approach B+C Hybrid Wedge Z — tách SequenceStep table + Folder visibility + Block.tagIds[].
--
-- Steps:
--   1. ALTER block_folders: + visibility column (default 'public')
--   2. ALTER blocks: + tag_ids String[] (default empty)
--   3. CREATE sequence_steps table
--   4. BACKFILL sequence_steps from automation_sequences.steps JSON (filter blockId NOT NULL)
--   5. KEEP automation_sequences.steps JSON 2 weeks (dual-read window) → drop in next migration after 2026-06-18
--
-- Reviewer concerns addressed:
--   R1: dual-read worker — sequence_steps primary, steps JSON fallback (worker code D2)
--   R6: pre-migration check parentId != NULL → flatten (no folder uses parentId today since UI flat)

-- ========================================
-- 1. ALTER block_folders: add visibility
-- ========================================
ALTER TABLE "block_folders"
  ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'public';

CREATE INDEX "block_folders_org_id_visibility_idx" ON "block_folders"("org_id", "visibility");

-- Pre-check: flatten any folder with parent_id != NULL (Phase 1 enforces 1 cấp)
-- Safe: no UI uses nested folders today; if seed data has them, log warning before NULL.
DO $$
DECLARE
  nested_count INT;
BEGIN
  SELECT count(*) INTO nested_count FROM "block_folders" WHERE "parent_id" IS NOT NULL;
  IF nested_count > 0 THEN
    RAISE NOTICE 'Migration 2026-06-04: Flattening % nested folder(s) to NULL parent_id', nested_count;
    UPDATE "block_folders" SET "parent_id" = NULL WHERE "parent_id" IS NOT NULL;
  END IF;
END $$;

-- Backfill visibility from existing block.is_shared aggregate (best-effort heuristic):
-- If ALL blocks in a folder are isShared=false → folder = private + ownerUserId from createdBy
-- Else → folder = public (default)
-- For Phase 1, just keep all default 'public' — Anh phân loại lại từ UI sau.

-- ========================================
-- 2. ALTER blocks: add tag_ids
-- ========================================
ALTER TABLE "blocks"
  ADD COLUMN "tag_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- GIN index để filter `WHERE tag_ids @> ARRAY['#SunshineQ7']` nhanh
CREATE INDEX "blocks_org_id_tag_ids_idx" ON "blocks" USING GIN ("tag_ids");

-- ========================================
-- 3. CREATE sequence_steps table
-- ========================================
CREATE TABLE "sequence_steps" (
  "id"              TEXT NOT NULL,
  "sequence_id"     TEXT NOT NULL,
  "block_id"        TEXT,
  "step_order"      INT NOT NULL,
  "delay_minutes"   INT NOT NULL DEFAULT 0,
  "exit_condition"  JSONB,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sequence_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sequence_steps_sequence_id_step_order_key"
  ON "sequence_steps"("sequence_id", "step_order");

CREATE INDEX "sequence_steps_block_id_idx"
  ON "sequence_steps"("block_id");

ALTER TABLE "sequence_steps"
  ADD CONSTRAINT "sequence_steps_sequence_id_fkey"
  FOREIGN KEY ("sequence_id") REFERENCES "automation_sequences"("id") ON DELETE CASCADE;

ALTER TABLE "sequence_steps"
  ADD CONSTRAINT "sequence_steps_block_id_fkey"
  FOREIGN KEY ("block_id") REFERENCES "blocks"("id") ON DELETE SET NULL;

-- ========================================
-- 4. BACKFILL sequence_steps from automation_sequences.steps JSON
-- ========================================
-- Shape JSON cũ: [{ stepId?, blockId?, delayMinutes?, exitCondition?, ... }]
-- Filter step ?'blockId' AND blockId NOT NULL → tránh cast UUID throw (Reviewer R-backfill)
-- Step không có blockId (delay-only / condition-only) → giữ trong JSON, KHÔNG backfill (rare edge case)

INSERT INTO "sequence_steps" (
  "id",
  "sequence_id",
  "block_id",
  "step_order",
  "delay_minutes",
  "exit_condition",
  "updated_at"
)
SELECT
  gen_random_uuid()::TEXT,
  s.id,
  (step->>'blockId'),
  (ord - 1)::INT,
  COALESCE((step->>'delayMinutes')::INT, 0),
  step->'exitCondition',
  CURRENT_TIMESTAMP
FROM "automation_sequences" s,
     LATERAL jsonb_array_elements(s."steps") WITH ORDINALITY AS arr(step, ord)
WHERE
  s."steps" IS NOT NULL
  AND jsonb_typeof(s."steps") = 'array'
  AND step ? 'blockId'
  AND step->>'blockId' IS NOT NULL
  AND step->>'blockId' != ''
  -- Optional: skip if blockId references non-existing Block (orphan from cũ)
  AND EXISTS (SELECT 1 FROM "blocks" b WHERE b.id = (step->>'blockId'));

-- Log backfill count
DO $$
DECLARE
  backfilled_count INT;
  total_seqs INT;
BEGIN
  SELECT count(*) INTO backfilled_count FROM "sequence_steps";
  SELECT count(*) INTO total_seqs FROM "automation_sequences";
  RAISE NOTICE 'Migration 2026-06-04: Backfilled % sequence_steps from % sequences', backfilled_count, total_seqs;
END $$;
