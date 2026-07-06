-- E3 — Vá nợ migration chain (PHẦN A): baseline 30 bảng tạo bằng `db push` (thiếu file CREATE).
--
-- BỐI CẢNH: 30 bảng dưới đây ban đầu tạo bằng `prisma db push` nên KHÔNG có file
-- migration CREATE. Các migration sau chỉ ALTER/INSERT/REFERENCES chúng → replay chuỗi
-- migration từ DB RỖNG (CI / môi trường mới) sẽ LỖI "relation does not exist". DB prod
-- hiện tại đã có sẵn các bảng nên KHÔNG bị ảnh hưởng.
--
-- FIX (2 phần, không sửa migration cũ → an toàn checksum prod):
--   • PHẦN A (file này, đặt TRƯỚC ALTER đầu tiên @ 20260520200000): CREATE 30 bảng ở
--     trạng thái BASE = cột tại thời điểm đó (loại cột do plain ADD COLUMN sau thêm).
--     Chỉ cột + PK; KHÔNG index, KHÔNG FK (tránh phụ thuộc thứ tự bảng).
--   • PHẦN B (migration cuối chuỗi 20260608000100_reconcile_dbpush_constraints): thêm
--     mọi index + FK còn thiếu (idempotent) khi đã đủ bảng — sinh bằng `prisma migrate diff`.
--
-- IDEMPOTENT (CREATE TABLE IF NOT EXISTS): prod đã có bảng → no-op; DB rỗng → tạo mới.
-- SQL gốc sinh bằng `prisma migrate diff --from-empty --to-schema` (Prisma default naming
-- khớp db push), đã loại các cột thêm-sau ở: ai_configs(3), customer_lists(3), customer_list_entries(4).


-- CreateTable: account_folder_members
CREATE TABLE IF NOT EXISTS "account_folder_members" (
    "id" TEXT NOT NULL,
    "folder_id" TEXT NOT NULL,
    "zalo_account_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_folder_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable: account_folders
CREATE TABLE IF NOT EXISTS "account_folders" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT DEFAULT '#6366F1',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ai_configs
CREATE TABLE IF NOT EXISTS "ai_configs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'anthropic',
    "model" TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
    "max_daily" INTEGER NOT NULL DEFAULT 500,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ai_suggestions
CREATE TABLE IF NOT EXISTS "ai_suggestions" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "message_id" TEXT,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: automation_rules
CREATE TABLE IF NOT EXISTS "automation_rules" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger" TEXT NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "run_count" INTEGER NOT NULL DEFAULT 0,
    "last_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable: contact_engagement_daily
CREATE TABLE IF NOT EXISTS "contact_engagement_daily" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "inbound_msg_count" INTEGER NOT NULL DEFAULT 0,
    "outbound_msg_count" INTEGER NOT NULL DEFAULT 0,
    "reaction_count" INTEGER NOT NULL DEFAULT 0,
    "media_share_count" INTEGER NOT NULL DEFAULT 0,
    "voice_msg_count" INTEGER NOT NULL DEFAULT 0,
    "call_count" INTEGER NOT NULL DEFAULT 0,
    "missed_call_count" INTEGER NOT NULL DEFAULT 0,
    "quote_reply_count" INTEGER NOT NULL DEFAULT 0,
    "customer_initiated" BOOLEAN NOT NULL DEFAULT false,
    "daily_intensity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_engagement_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable: crm_tag_groups
CREATE TABLE IF NOT EXISTS "crm_tag_groups" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "managed_by" TEXT,
    "zalo_account_id" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_tag_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable: crm_tags
CREATE TABLE IF NOT EXISTS "crm_tags" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#90A4AE',
    "emoji" TEXT,
    "description" TEXT,
    "category" TEXT,
    "group_id" TEXT,
    "managed_by" TEXT,
    "source_zalo_label_id" INTEGER,
    "archived_at" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable: customer_list_entries
CREATE TABLE IF NOT EXISTS "customer_list_entries" (
    "id" TEXT NOT NULL,
    "customer_list_id" TEXT NOT NULL,
    "row_index" INTEGER NOT NULL,
    "phone_raw" TEXT NOT NULL,
    "name_raw" TEXT,
    "phone_e164" TEXT,
    "phone_local" TEXT,
    "phone_valid" BOOLEAN NOT NULL DEFAULT false,
    "invalid_reason" TEXT,
    "contact_id" TEXT,
    "zalo_uid" TEXT,
    "zalo_global_id" TEXT,
    "zalo_name" TEXT,
    "resolved_by_nick_id" TEXT,
    "multi_nick_count" INTEGER NOT NULL DEFAULT 0,
    "has_zalo" BOOLEAN,
    "dup_in_list_with_entry_id" TEXT,
    "dup_with_list_id" TEXT,
    "dup_with_list_entry_id" TEXT,
    "dup_with_contact_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "enriched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_list_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable: customer_lists
CREATE TABLE IF NOT EXISTS "customer_lists" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon_emoji" TEXT,
    "source_type" TEXT NOT NULL,
    "raw_text" TEXT,
    "total_entries" INTEGER NOT NULL DEFAULT 0,
    "valid_entries" INTEGER NOT NULL DEFAULT 0,
    "invalid_entries" INTEGER NOT NULL DEFAULT 0,
    "dup_in_list_entries" INTEGER NOT NULL DEFAULT 0,
    "dup_cross_list_entries" INTEGER NOT NULL DEFAULT 0,
    "dup_with_contact_entries" INTEGER NOT NULL DEFAULT 0,
    "has_zalo_entries" INTEGER NOT NULL DEFAULT 0,
    "no_zalo_entries" INTEGER NOT NULL DEFAULT 0,
    "pending_lookup_entries" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable: friends
CREATE TABLE IF NOT EXISTS "friends" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "zalo_account_id" TEXT NOT NULL,
    "zalo_uid_in_nick" TEXT NOT NULL,
    "friendship_status" TEXT NOT NULL DEFAULT 'none',
    "has_conversation" BOOLEAN NOT NULL DEFAULT false,
    "relationship_kind" TEXT NOT NULL DEFAULT 'none',
    "alias_in_nick" TEXT,
    "zalo_display_name" TEXT,
    "zalo_avatar_url" TEXT,
    "zalo_global_id" TEXT,
    "zalo_username" TEXT,
    "zalo_labels" JSONB NOT NULL DEFAULT '[]',
    "zalo_labels_synced_at" TIMESTAMP(3),
    "crm_tags_per_nick" JSONB NOT NULL DEFAULT '[]',
    "became_friend_at" TIMESTAMP(3),
    "removed_at" TIMESTAMP(3),
    "first_message_at" TIMESTAMP(3),
    "last_inbound_at" TIMESTAMP(3),
    "last_outbound_at" TIMESTAMP(3),
    "last_interaction_at" TIMESTAMP(3),
    "total_inbound" INTEGER NOT NULL DEFAULT 0,
    "total_outbound" INTEGER NOT NULL DEFAULT 0,
    "last_inbound_preview" TEXT,
    "last_inbound_type" TEXT,
    "last_inbound_message_id" TEXT,
    "last_outbound_preview" TEXT,
    "last_outbound_type" TEXT,
    "last_outbound_message_id" TEXT,
    "status_id" TEXT,
    "lead_score" INTEGER NOT NULL DEFAULT 0,
    "score_breakdown" JSONB NOT NULL DEFAULT '{}',
    "score_updated_at" TIMESTAMP(3),
    "stuck_since" TIMESTAMP(3),
    "auto_tags" JSONB NOT NULL DEFAULT '[]',
    "stage_entered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "friends_pkey" PRIMARY KEY ("id")
);

-- CreateTable: friendship_attempts
CREATE TABLE IF NOT EXISTS "friendship_attempts" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "zalo_account_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "zalo_uid_found" TEXT,
    "request_msg" TEXT,
    "error_code" TEXT,
    "error_detail" TEXT,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "looked_up_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "friendship_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: group_polls
CREATE TABLE IF NOT EXISTS "group_polls" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "zalo_account_id" TEXT NOT NULL,
    "group_external_id" TEXT NOT NULL,
    "zalo_poll_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "is_multi_choice" BOOLEAN NOT NULL DEFAULT false,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable: integrations
CREATE TABLE IF NOT EXISTS "integrations" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "config" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: message_reactions
CREATE TABLE IF NOT EXISTS "message_reactions" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "reactor_id" TEXT NOT NULL,
    "reactor_source" TEXT NOT NULL DEFAULT 'crm',
    "reactor_name" TEXT,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: message_templates
CREATE TABLE IF NOT EXISTS "message_templates" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "owner_user_id" TEXT,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable: nba_templates
CREATE TABLE IF NOT EXISTS "nba_templates" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "content_template" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nba_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable: note_reactions
CREATE TABLE IF NOT EXISTS "note_reactions" (
    "id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: notes
CREATE TABLE IF NOT EXISTS "notes" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "parent_note_id" TEXT,
    "author_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "suggested_appointment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: parent_candidates
CREATE TABLE IF NOT EXISTS "parent_candidates" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "contact_ids" TEXT[],
    "match_type" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable: phone_search_events
CREATE TABLE IF NOT EXISTS "phone_search_events" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT,
    "phone_hash" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "found_uid" TEXT,
    "error_code" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_search_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable: pinned_conversations
CREATE TABLE IF NOT EXISTS "pinned_conversations" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "zalo_account_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "pinned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pinned_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: saved_filter_presets
CREATE TABLE IF NOT EXISTS "saved_filter_presets" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT DEFAULT '⭐',
    "filter_json" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_filter_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable: saved_reports
CREATE TABLE IF NOT EXISTS "saved_reports" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable: score_signal_rules
CREATE TABLE IF NOT EXISTS "score_signal_rules" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "signal_key" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "rule_type" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "cap_per_day" INTEGER,
    "cap_total" INTEGER,
    "keywords" JSONB NOT NULL DEFAULT '[]',
    "label" TEXT NOT NULL,
    "applicable_stages" JSONB NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "score_signal_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable: scoring_configs
CREATE TABLE IF NOT EXISTS "scoring_configs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "weight_engagement" INTEGER NOT NULL DEFAULT 35,
    "weight_intent" INTEGER NOT NULL DEFAULT 30,
    "weight_fit" INTEGER NOT NULL DEFAULT 15,
    "weight_velocity" INTEGER NOT NULL DEFAULT 20,
    "decay_day_3_7" INTEGER NOT NULL DEFAULT -1,
    "decay_day_7_14" INTEGER NOT NULL DEFAULT -3,
    "decay_day_14_30" INTEGER NOT NULL DEFAULT -5,
    "decay_day_30_60" INTEGER NOT NULL DEFAULT -8,
    "auto_promote" BOOLEAN NOT NULL DEFAULT true,
    "stuck_detection_enabled" BOOLEAN NOT NULL DEFAULT true,
    "explainability_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scoring_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: stage_transition_rules
CREATE TABLE IF NOT EXISTS "stage_transition_rules" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "from_stage" TEXT NOT NULL,
    "to_stage" TEXT NOT NULL,
    "criteria" JSONB NOT NULL DEFAULT '{}',
    "requires_manual_confirm" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stage_transition_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable: statuses
CREATE TABLE IF NOT EXISTS "statuses" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "is_terminal" BOOLEAN NOT NULL DEFAULT false,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable: stuck_thresholds
CREATE TABLE IF NOT EXISTS "stuck_thresholds" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "threshold_days" INTEGER NOT NULL,
    "extra_decay_per_day" INTEGER NOT NULL DEFAULT 0,
    "nba_template_key" TEXT,
    "alert_label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stuck_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateTable: sync_logs
CREATE TABLE IF NOT EXISTS "sync_logs" (
    "id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "record_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: user_preferences
CREATE TABLE IF NOT EXISTS "user_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL DEFAULT 'null',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable: zalo_labels
CREATE TABLE IF NOT EXISTS "zalo_labels" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "zalo_account_id" TEXT NOT NULL,
    "zalo_label_id" INTEGER NOT NULL,
    "text_key" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "emoji" TEXT,
    "offset" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "conversations" JSONB NOT NULL DEFAULT '[]',
    "create_time" BIGINT,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zalo_labels_pkey" PRIMARY KEY ("id")
);


-- ===========================================================================
-- PHẦN A2: cột db-push thuần bị migration ĐỌC trước khi tồn tại (ordering blocker).
-- Các cột này không migration nào tạo (chỉ có qua db push) nhưng bị UPDATE/WHERE ở
-- migration sau tham chiếu → fresh replay fail. Thêm idempotent tại baseline (bảng đã
-- tồn tại từ init). Prod đã có cột → no-op. (Phát hiện bằng fresh-DB replay.)
-- ===========================================================================
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "internal_contact_zalo_account_id" TEXT;


-- ===========================================================================
-- PHẦN A2: cột db-push thiếu trên bảng tạo TRƯỚC/TẠI 190000 (idempotent ADD COLUMN).
-- Không migration nào tạo các cột này (chỉ có qua db push) → fresh replay thiếu chúng.
-- Bảng đã tồn tại từ init/automation nên thêm an toàn tại baseline. Prod: IF NOT EXISTS no-op.
-- ===========================================================================

ALTER TABLE "activity_logs"
  ADD COLUMN IF NOT EXISTS "actor_type" TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS "bot_name" TEXT,
  ADD COLUMN IF NOT EXISTS "category" TEXT,
  ADD COLUMN IF NOT EXISTS "system_source" TEXT;

ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "emoji" TEXT,
  ADD COLUMN IF NOT EXISTS "external_ref" TEXT,
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "status_changed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "status_changed_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "zalo_message_id" TEXT;

ALTER TABLE "automation_broadcasts"
  ADD COLUMN IF NOT EXISTS "ab_test_stats" JSONB,
  ADD COLUMN IF NOT EXISTS "resume_cursor" TEXT,
  ADD COLUMN IF NOT EXISTS "variant_spec" JSONB,
  ADD COLUMN IF NOT EXISTS "worker_stats" JSONB;

ALTER TABLE "automation_triggers"
  ADD COLUMN IF NOT EXISTS "enable_rejected_follow_up" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "enable_remind" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "enable_thank_you" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "enable_welcome" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notify_channels" JSONB,
  ADD COLUMN IF NOT EXISTS "rejected_template" TEXT,
  ADD COLUMN IF NOT EXISTS "remind_delay_days" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "remind_template" TEXT,
  ADD COLUMN IF NOT EXISTS "thank_you_delay_seconds" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS "thank_you_template" TEXT;

ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "accepted_nicks_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "address_line" TEXT,
  ADD COLUMN IF NOT EXISTS "aggregate_breakdown" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "aggregate_score_updated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "auto_tags" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "birth_date" DATE,
  ADD COLUMN IF NOT EXISTS "birth_year" INTEGER,
  ADD COLUMN IF NOT EXISTS "chatting_nicks_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "consent_revoked_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "consent_source" TEXT,
  ADD COLUMN IF NOT EXISTS "consent_status" TEXT NOT NULL DEFAULT 'implicit',
  ADD COLUMN IF NOT EXISTS "district" TEXT,
  ADD COLUMN IF NOT EXISTS "engagement_pattern" TEXT,
  ADD COLUMN IF NOT EXISTS "engagement_score" INTEGER,
  ADD COLUMN IF NOT EXISTS "engagement_trend" INTEGER,
  ADD COLUMN IF NOT EXISTS "engagement_updated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "gender" TEXT,
  ADD COLUMN IF NOT EXISTS "has_zalo" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "import_batch_id" TEXT,
  ADD COLUMN IF NOT EXISTS "income_range" TEXT,
  ADD COLUMN IF NOT EXISTS "last_inbound_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_inbound_message_id" TEXT,
  ADD COLUMN IF NOT EXISTS "last_inbound_preview" TEXT,
  ADD COLUMN IF NOT EXISTS "last_inbound_type" TEXT,
  ADD COLUMN IF NOT EXISTS "last_interaction_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_interaction_payload" JSONB,
  ADD COLUMN IF NOT EXISTS "last_interaction_type" TEXT,
  ADD COLUMN IF NOT EXISTS "last_outbound_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_outbound_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "last_outbound_by_zalo_account_id" TEXT,
  ADD COLUMN IF NOT EXISTS "last_outbound_message_id" TEXT,
  ADD COLUMN IF NOT EXISTS "last_outbound_preview" TEXT,
  ADD COLUMN IF NOT EXISTS "last_outbound_type" TEXT,
  ADD COLUMN IF NOT EXISTS "occupation" TEXT,
  ADD COLUMN IF NOT EXISTS "owner_friend_id" TEXT,
  ADD COLUMN IF NOT EXISTS "parent_contact_id" TEXT,
  ADD COLUMN IF NOT EXISTS "pending_nicks_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "phone_2" TEXT,
  ADD COLUMN IF NOT EXISTS "phone_3" TEXT,
  ADD COLUMN IF NOT EXISTS "phone_normalized" TEXT,
  ADD COLUMN IF NOT EXISTS "phones_extra" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "preferred_lang" TEXT DEFAULT 'vi',
  ADD COLUMN IF NOT EXISTS "priority_score" INTEGER,
  ADD COLUMN IF NOT EXISTS "priority_updated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "province" TEXT,
  ADD COLUMN IF NOT EXISTS "social_facebook" TEXT,
  ADD COLUMN IF NOT EXISTS "social_tiktok" TEXT,
  ADD COLUMN IF NOT EXISTS "status_id" TEXT,
  ADD COLUMN IF NOT EXISTS "stuck_since_aggregate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "total_appointments" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "total_inbound" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "total_outbound" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ward" TEXT,
  ADD COLUMN IF NOT EXISTS "zalo_global_id" TEXT,
  ADD COLUMN IF NOT EXISTS "zalo_lookup_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "zalo_lookup_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "zalo_username" TEXT;

ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "group_avatar_url" TEXT,
  ADD COLUMN IF NOT EXISTS "group_members_count" INTEGER,
  ADD COLUMN IF NOT EXISTS "group_name" TEXT;

ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "album_index" INTEGER,
  ADD COLUMN IF NOT EXISTS "album_key" TEXT,
  ADD COLUMN IF NOT EXISTS "album_total" INTEGER,
  ADD COLUMN IF NOT EXISTS "quote" JSONB,
  ADD COLUMN IF NOT EXISTS "sent_via" TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS "zalo_msg_id_num" BIGINT;

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "system_notify_zalo_account_id" TEXT;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "max_privacy_nicks" INTEGER NOT NULL DEFAULT 2;
