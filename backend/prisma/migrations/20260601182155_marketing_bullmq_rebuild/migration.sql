-- Migration: Marketing BullMQ Rebuild — Dự án Luồng Mục Tiêu (M0 big-bang)
-- Date: 2026-06-01
-- Branch: private-hs (fork locphamnguyen/ZaloCRM)
-- Decisions:
--   D14 + D15 anh chốt: cancel triggers + drop AutomationTask không backup (DB chưa production)
--   M9 D19-D25: system trigger "Bám đuổi thủ công" + entry overrides
--   M10: 5 migration Stats Dashboard (counters, FK, index)
--   M11: sentVia enum mở rộng + automationTaskId FK
-- Scope: Migration big-bang gộp 7 việc:
--   1. DROP automation_tasks (D15)
--   2. Cancel toàn bộ trigger active (D14)
--   3. ALTER automation_triggers ADD 8 cols (P1, P2, P6, D12, recency, hour, multi-nick, system flag)
--   4. ALTER customer_list_entries ADD 6 cols (M9 overrides)
--   5. ALTER automation_sequences ADD 5 cached counters (M10 hồi sinh dead writer)
--   6. ALTER messages ADD automation_task_id (M10 reaction/reply attribution; sentVia đã có)
--   7. CREATE INDEX × 5 (stats query)
--   8. Seed system trigger "Bám đuổi khách hàng thủ công" per org
-- Reverse: KHÔNG (D15 — không cần rollback per anh chốt)

-- ════════════════════════════════════════════════════════════════════
-- STEP 1: Cancel toàn bộ trigger active hiện tại (D14)
-- ════════════════════════════════════════════════════════════════════
UPDATE automation_triggers
SET state = 'cancelled', updated_at = NOW()
WHERE state IN ('active', 'paused', 'draft');

-- Cascade cancel campaigns đang chạy (không drop, chỉ mark)
UPDATE automation_campaigns
SET state = 'cancelled', completed_at = NOW(), updated_at = NOW()
WHERE state IN ('active', 'paused');

-- ════════════════════════════════════════════════════════════════════
-- STEP 2: DROP automation_tasks (D15)
-- ════════════════════════════════════════════════════════════════════
-- AutomationTask thay bằng BullMQ jobs (Redis). Backup KHÔNG cần.
DROP TABLE IF EXISTS "automation_tasks" CASCADE;

-- ════════════════════════════════════════════════════════════════════
-- STEP 3: ALTER automation_triggers — 8 cột mới
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE "automation_triggers"
  ADD COLUMN "sequence_start_delay_minutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "pause_on_activity_hours"      INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "multi_nick_threshold"         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "concurrency_per_nick_per_minute" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "send_hour_start"              INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN "send_hour_end"                INTEGER NOT NULL DEFAULT 22,
  ADD COLUMN "recency_skip_days"            INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "min_friend_req_gap_ms"        INTEGER NOT NULL DEFAULT 60000,
  ADD COLUMN "filter_thread_type"           TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN "is_system_trigger"            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "system_kind"                  TEXT;

CREATE INDEX "idx_triggers_system_kind" ON "automation_triggers" ("system_kind") WHERE "system_kind" IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════
-- STEP 4: ALTER customer_list_entries — 6 cột mới (M9 overrides)
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE "customer_list_entries"
  ADD COLUMN "sequence_id_override" TEXT,
  ADD COLUMN "nick_id_override"     TEXT,
  ADD COLUMN "enrolled_by"          TEXT,
  ADD COLUMN "enroll_reason"        TEXT,
  ADD COLUMN "enrolled_at"          TIMESTAMPTZ,
  ADD COLUMN "manual_enroll_meta"   JSONB;

CREATE INDEX "idx_entries_nick_override" ON "customer_list_entries" ("nick_id_override") WHERE "nick_id_override" IS NOT NULL;
CREATE INDEX "idx_entries_enrolled_by" ON "customer_list_entries" ("enrolled_by", "enrolled_at" DESC) WHERE "enrolled_by" IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════
-- STEP 5: ALTER automation_sequences — 5 cached counters (M10 hồi sinh dead writer)
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE "automation_sequences"
  ADD COLUMN "block_count_cached"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "enrolled_count_cached"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "completed_count_cached"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reply_count_cached"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "counters_last_synced_at" TIMESTAMPTZ;

-- ════════════════════════════════════════════════════════════════════
-- STEP 6: ALTER messages — automation_task_id FK + index (M10 attribution)
-- (sent_via đã có sẵn từ phase metrics 2026-05-22)
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE "messages"
  ADD COLUMN "automation_task_id"     TEXT,
  ADD COLUMN "automation_step_index"  INTEGER;
-- KHÔNG add FK constraint vì automation_tasks bị drop; column này lưu BullMQ jobId (string)
-- Pattern jobId: ${triggerId}-${contactId}-${stepIdx} (DASH, verified POC 2026-06-01)

CREATE INDEX "idx_messages_automation_task" ON "messages" ("automation_task_id", "sent_at") WHERE "automation_task_id" IS NOT NULL;
CREATE INDEX "idx_messages_sent_via_conv" ON "messages" ("sent_via", "conversation_id");

-- ════════════════════════════════════════════════════════════════════
-- STEP 7: Cleanup AutomationCampaign — Drop FK sequence_id (Stats query đi qua sequence trực tiếp)
-- Giữ AutomationCampaign table cho audit history, không drop
-- ════════════════════════════════════════════════════════════════════
-- (no-op, just documenting reasoning)

-- ════════════════════════════════════════════════════════════════════
-- STEP 8: Seed system trigger "Bám đuổi khách hàng thủ công" per org (M9)
-- Idempotent: chỉ insert nếu chưa có
-- ════════════════════════════════════════════════════════════════════
-- Note: Organization model KHÔNG có owner_user_id cột.
-- Resolve created_by_id qua subquery: tìm User role='owner' đầu tiên trong org,
-- fallback bất kỳ User nào trong org nếu chưa có owner role.
INSERT INTO "automation_triggers" (
  id, org_id, name, category, event_type, binding_kind,
  segment_spec, state, created_by_id,
  is_system_trigger, system_kind,
  send_hour_start, send_hour_end,
  filter_thread_type, multi_nick_threshold,
  recency_skip_days, sequence_start_delay_minutes, pause_on_activity_hours,
  min_friend_req_gap_ms, concurrency_per_nick_per_minute,
  created_at, updated_at
)
SELECT
  gen_random_uuid(),
  o.id,
  'Bám đuổi khách hàng thủ công',
  'manual',
  'manual_chat_followup',
  'sequence',
  jsonb_build_object(
    'kind', 'manual',
    'nickIds', '[]'::jsonb,
    'skipRules', jsonb_build_object(
      'recencyDays', 0,
      'friendCap', 0,
      'entryStatuses', '[]'::jsonb
    )
  ),
  'active',
  COALESCE(
    (SELECT id FROM users WHERE org_id = o.id AND role = 'owner' ORDER BY created_at ASC LIMIT 1),
    (SELECT id FROM users WHERE org_id = o.id ORDER BY created_at ASC LIMIT 1)
  ),
  true,
  'manual_chat_followup',
  6, 22,
  'user',
  0,
  0,    -- system trigger bypass recency
  0,    -- KHÔNG delay (sale enroll → gửi ngay sequence step 1)
  24,   -- pause 24h khi KH reply
  60000,
  1,
  NOW(),
  NOW()
FROM organizations o
WHERE EXISTS (
  -- Chỉ seed nếu org có ít nhất 1 user (tránh insert created_by_id=NULL)
  SELECT 1 FROM users WHERE org_id = o.id
)
AND NOT EXISTS (
  SELECT 1 FROM automation_triggers t
  WHERE t.org_id = o.id
    AND t.is_system_trigger = true
    AND t.system_kind = 'manual_chat_followup'
);

-- ════════════════════════════════════════════════════════════════════
-- DONE — Marketing BullMQ Rebuild M0 migration
-- Next: M1 Redis container + bullmq npm install
-- ════════════════════════════════════════════════════════════════════
