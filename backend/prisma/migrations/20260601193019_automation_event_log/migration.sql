-- Luồng Mục Tiêu M3 — automation_event_log table (outbox sweeper)
-- Date: 2026-06-01
-- Scope: append-only event log cho chain recovery + stats query

CREATE TABLE IF NOT EXISTS "automation_event_log" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "org_id"      TEXT NOT NULL,
  "trigger_id"  TEXT,
  "contact_id"  TEXT,
  "nick_id"     TEXT,
  -- Event type enum:
  --   sequence_step_enqueued | sequence_step_sent | sequence_step_failed
  --   friend_request_sent | friend_accepted | friend_rejected | friend_blocked
  --   customer_reply | customer_block | customer_reaction_negative
  --   manual_pause | manual_stop | manual_resume | manual_enroll
  --   no_zalo | send_error | nick_disconnected
  "event_type"  TEXT NOT NULL,
  "detail"      TEXT,
  "metadata"    JSONB,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "automation_event_log_pkey" PRIMARY KEY ("id")
);

-- Hot indexes cho outbox sweeper (M3) + Stats Dashboard (M10)
CREATE INDEX "idx_automation_event_log_trigger_contact_type"
  ON "automation_event_log" ("trigger_id", "contact_id", "event_type");

-- Stats sweeper: query event sequence_step_sent gần đây để check chain
CREATE INDEX "idx_automation_event_log_type_created"
  ON "automation_event_log" ("event_type", "created_at" DESC);

-- M10 Stats outcomes: count event by type per trigger
CREATE INDEX "idx_automation_event_log_org_type_created"
  ON "automation_event_log" ("org_id", "event_type", "created_at" DESC);

-- M5 pause/resume hot query: latest event per (trigger, contact)
CREATE INDEX "idx_automation_event_log_contact_created"
  ON "automation_event_log" ("contact_id", "created_at" DESC)
  WHERE "contact_id" IS NOT NULL;

-- FK constraints (CASCADE on org delete, SET NULL trigger/contact để giữ audit history)
ALTER TABLE "automation_event_log"
  ADD CONSTRAINT "automation_event_log_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON UPDATE CASCADE ON DELETE CASCADE;
