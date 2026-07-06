-- ════════════════════════════════════════════════════════════════════════════
-- Phase 7 — Automation Framework
--
-- Adds 7 new tables for the authoring + runtime layers:
--   Authoring: block_folders, blocks, automation_sequences,
--              automation_triggers, automation_broadcasts
--   Runtime:   automation_campaigns, automation_tasks
--
-- Also adds 4 columns to zalo_accounts for per-nick rate limit configuration
-- and cross-campaign throttle gate state.
--
-- All idempotent via IF NOT EXISTS — safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── ZaloAccount: per-nick caps + throttle gate state ───────────────────────
ALTER TABLE "zalo_accounts" ADD COLUMN IF NOT EXISTS "daily_friend_add_cap"   INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "zalo_accounts" ADD COLUMN IF NOT EXISTS "daily_message_cap"      INTEGER NOT NULL DEFAULT 300;
ALTER TABLE "zalo_accounts" ADD COLUMN IF NOT EXISTS "last_friend_req_sent_at" TIMESTAMP(3);
ALTER TABLE "zalo_accounts" ADD COLUMN IF NOT EXISTS "last_message_sent_at"    TIMESTAMP(3);

-- ── BlockFolder ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "block_folders" (
    "id"            TEXT NOT NULL,
    "org_id"        TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "parent_id"     TEXT,
    "owner_nick_id" TEXT,
    "owner_user_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "block_folders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "block_folders_org_id_owner_nick_id_idx" ON "block_folders"("org_id", "owner_nick_id");
CREATE INDEX IF NOT EXISTS "block_folders_org_id_owner_user_id_idx" ON "block_folders"("org_id", "owner_user_id");
CREATE INDEX IF NOT EXISTS "block_folders_parent_id_idx"            ON "block_folders"("parent_id");

ALTER TABLE "block_folders" ADD CONSTRAINT "block_folders_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "block_folders" ADD CONSTRAINT "block_folders_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "block_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "block_folders" ADD CONSTRAINT "block_folders_owner_nick_id_fkey"
    FOREIGN KEY ("owner_nick_id") REFERENCES "zalo_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "block_folders" ADD CONSTRAINT "block_folders_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "block_folders" ADD CONSTRAINT "block_folders_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ── Block ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "blocks" (
    "id"            TEXT NOT NULL,
    "org_id"        TEXT NOT NULL,
    "folder_id"     TEXT,
    "name"          TEXT NOT NULL,
    "channel"       TEXT NOT NULL DEFAULT 'zalo_user',
    "action_type"   TEXT NOT NULL,
    "content"       JSONB NOT NULL DEFAULT '{}',
    "owner_nick_id" TEXT,
    "is_shared"     BOOLEAN NOT NULL DEFAULT true,
    "usage_count"   INTEGER NOT NULL DEFAULT 0,
    "last_used_at"  TIMESTAMP(3),
    "archived_at"   TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "blocks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "blocks_org_id_channel_action_type_idx" ON "blocks"("org_id", "channel", "action_type");
CREATE INDEX IF NOT EXISTS "blocks_org_id_archived_at_idx"         ON "blocks"("org_id", "archived_at");
CREATE INDEX IF NOT EXISTS "blocks_folder_id_idx"                  ON "blocks"("folder_id");

ALTER TABLE "blocks" ADD CONSTRAINT "blocks_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_folder_id_fkey"
    FOREIGN KEY ("folder_id") REFERENCES "block_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_owner_nick_id_fkey"
    FOREIGN KEY ("owner_nick_id") REFERENCES "zalo_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ── AutomationSequence ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "automation_sequences" (
    "id"              TEXT NOT NULL,
    "org_id"          TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "description"     TEXT,
    "channel"         TEXT NOT NULL DEFAULT 'zalo_user',
    "steps"           JSONB NOT NULL DEFAULT '[]',
    "runtime_rules"   JSONB NOT NULL DEFAULT '{}',
    "enrolled_count"  INTEGER NOT NULL DEFAULT 0,
    "completed_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count"    INTEGER NOT NULL DEFAULT 0,
    "enabled"         BOOLEAN NOT NULL DEFAULT true,
    "created_by_id"   TEXT NOT NULL,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "automation_sequences_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "automation_sequences_org_id_channel_enabled_idx" ON "automation_sequences"("org_id", "channel", "enabled");

ALTER TABLE "automation_sequences" ADD CONSTRAINT "automation_sequences_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_sequences" ADD CONSTRAINT "automation_sequences_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ── AutomationBroadcast ────────────────────────────────────────────────────
-- (Create BEFORE AutomationTrigger because Trigger references Broadcast.)
CREATE TABLE IF NOT EXISTS "automation_broadcasts" (
    "id"               TEXT NOT NULL,
    "org_id"           TEXT NOT NULL,
    "name"             TEXT NOT NULL,
    "description"      TEXT,
    "channel"          TEXT NOT NULL DEFAULT 'zalo_user',
    "block_id"         TEXT NOT NULL,
    "segment_spec"     JSONB NOT NULL,
    "schedule_kind"    TEXT NOT NULL DEFAULT 'now',
    "scheduled_at"     TIMESTAMP(3),
    "recurring_spec"   JSONB,
    "pacing"           JSONB NOT NULL DEFAULT '{}',
    "state"            TEXT NOT NULL DEFAULT 'draft',
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "sent_count"       INTEGER NOT NULL DEFAULT 0,
    "delivered_count"  INTEGER NOT NULL DEFAULT 0,
    "failed_count"     INTEGER NOT NULL DEFAULT 0,
    "started_at"       TIMESTAMP(3),
    "completed_at"     TIMESTAMP(3),
    "created_by_id"    TEXT NOT NULL,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "automation_broadcasts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "automation_broadcasts_org_id_channel_state_idx" ON "automation_broadcasts"("org_id", "channel", "state");
CREATE INDEX IF NOT EXISTS "automation_broadcasts_scheduled_at_idx"         ON "automation_broadcasts"("scheduled_at");

ALTER TABLE "automation_broadcasts" ADD CONSTRAINT "automation_broadcasts_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_broadcasts" ADD CONSTRAINT "automation_broadcasts_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
-- block FK added at end (Block table needs to exist; both already created above)
ALTER TABLE "automation_broadcasts" ADD CONSTRAINT "automation_broadcasts_block_id_fkey"
    FOREIGN KEY ("block_id") REFERENCES "blocks"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ── AutomationTrigger ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "automation_triggers" (
    "id"             TEXT NOT NULL,
    "org_id"         TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "category"       TEXT NOT NULL DEFAULT 'general',
    "event_type"     TEXT NOT NULL,
    "event_filter"   JSONB,
    "binding_kind"   TEXT NOT NULL,
    "sequence_id"    TEXT,
    "block_id"       TEXT,
    "broadcast_id"   TEXT,
    "segment_spec"   JSONB,
    "rule_overrides" JSONB,
    "enabled"        BOOLEAN NOT NULL DEFAULT true,
    "created_by_id"  TEXT NOT NULL,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "automation_triggers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "automation_triggers_org_id_event_type_enabled_idx" ON "automation_triggers"("org_id", "event_type", "enabled");
CREATE INDEX IF NOT EXISTS "automation_triggers_org_id_category_idx"           ON "automation_triggers"("org_id", "category");

ALTER TABLE "automation_triggers" ADD CONSTRAINT "automation_triggers_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_triggers" ADD CONSTRAINT "automation_triggers_sequence_id_fkey"
    FOREIGN KEY ("sequence_id") REFERENCES "automation_sequences"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "automation_triggers" ADD CONSTRAINT "automation_triggers_broadcast_id_fkey"
    FOREIGN KEY ("broadcast_id") REFERENCES "automation_broadcasts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "automation_triggers" ADD CONSTRAINT "automation_triggers_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
-- Note: trigger.block_id intentionally has NO FK constraint to keep polymorphic
-- binding (sequence | block | broadcast) flexible without strict referential lock.
-- Engine validates at runtime when binding_kind = 'block'.

-- ── AutomationCampaign ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "automation_campaigns" (
    "id"               TEXT NOT NULL,
    "org_id"           TEXT NOT NULL,
    "trigger_id"       TEXT,
    "broadcast_id"     TEXT,
    "execution_kind"   TEXT NOT NULL,
    "sequence_id"      TEXT,
    "block_id"         TEXT,
    "segment_snapshot" JSONB NOT NULL,
    "rules_snapshot"   JSONB NOT NULL,
    "state"            TEXT NOT NULL DEFAULT 'active',
    "activated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at"     TIMESTAMP(3),
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "automation_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "automation_campaigns_org_id_state_idx"      ON "automation_campaigns"("org_id", "state");
CREATE INDEX IF NOT EXISTS "automation_campaigns_trigger_id_state_idx"  ON "automation_campaigns"("trigger_id", "state");
CREATE INDEX IF NOT EXISTS "automation_campaigns_broadcast_id_state_idx" ON "automation_campaigns"("broadcast_id", "state");

ALTER TABLE "automation_campaigns" ADD CONSTRAINT "automation_campaigns_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_campaigns" ADD CONSTRAINT "automation_campaigns_trigger_id_fkey"
    FOREIGN KEY ("trigger_id") REFERENCES "automation_triggers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "automation_campaigns" ADD CONSTRAINT "automation_campaigns_broadcast_id_fkey"
    FOREIGN KEY ("broadcast_id") REFERENCES "automation_broadcasts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "automation_campaigns" ADD CONSTRAINT "automation_campaigns_sequence_id_fkey"
    FOREIGN KEY ("sequence_id") REFERENCES "automation_sequences"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- block_id has NO FK constraint (soft reference, schema parallel to trigger.block_id).

-- ── AutomationTask ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "automation_tasks" (
    "id"                TEXT NOT NULL,
    "org_id"            TEXT NOT NULL,
    "campaign_id"       TEXT NOT NULL,
    "contact_id"        TEXT NOT NULL,
    "sequence_id"       TEXT,
    "current_step_idx"  INTEGER,
    "current_block_id"  TEXT,
    "block_snapshot"    JSONB NOT NULL,
    "scheduled_at"      TIMESTAMP(3) NOT NULL,
    "assigned_nick_id"  TEXT,
    "state"             TEXT NOT NULL DEFAULT 'queued',
    "attempt_count"     INTEGER NOT NULL DEFAULT 0,
    "outcome"           JSONB,
    "skip_reason"       TEXT,
    "error_message"     TEXT,
    "executed_at"       TIMESTAMP(3),
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "automation_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "automation_tasks_state_scheduled_at_idx"          ON "automation_tasks"("state", "scheduled_at");
CREATE INDEX IF NOT EXISTS "automation_tasks_campaign_id_contact_id_idx"      ON "automation_tasks"("campaign_id", "contact_id");
CREATE INDEX IF NOT EXISTS "automation_tasks_assigned_nick_id_executed_at_idx" ON "automation_tasks"("assigned_nick_id", "executed_at");
CREATE INDEX IF NOT EXISTS "automation_tasks_contact_id_state_idx"            ON "automation_tasks"("contact_id", "state");

ALTER TABLE "automation_tasks" ADD CONSTRAINT "automation_tasks_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_tasks" ADD CONSTRAINT "automation_tasks_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "automation_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_tasks" ADD CONSTRAINT "automation_tasks_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_tasks" ADD CONSTRAINT "automation_tasks_current_block_id_fkey"
    FOREIGN KEY ("current_block_id") REFERENCES "blocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "automation_tasks" ADD CONSTRAINT "automation_tasks_assigned_nick_id_fkey"
    FOREIGN KEY ("assigned_nick_id") REFERENCES "zalo_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
