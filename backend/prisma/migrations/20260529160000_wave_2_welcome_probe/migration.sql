ALTER TABLE friend_request_outbox ADD COLUMN kind TEXT NOT NULL DEFAULT 'FRIEND_REQUEST';
ALTER TABLE friend_request_outbox ADD COLUMN parent_task_id TEXT;
ALTER TABLE friend_request_outbox ADD COLUMN allow_stranger_message BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE friend_request_outbox ADD COLUMN welcome_outcome TEXT;
ALTER TABLE friend_request_outbox ADD COLUMN welcome_sent_at TIMESTAMP(3);
ALTER TABLE friend_request_outbox ADD COLUMN welcome_retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE friend_request_outbox ADD COLUMN welcome_last_error TEXT;

ALTER TABLE contacts ADD COLUMN welcome_sent_at TIMESTAMP(3);
ALTER TABLE contacts ADD COLUMN welcome_channel TEXT;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS welcome_message_template TEXT;
ALTER TABLE organizations ADD COLUMN welcome_delay_after_friend_req_sec INTEGER NOT NULL DEFAULT 60;
ALTER TABLE organizations ADD COLUMN welcome_stranger_inbox_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE organizations ADD COLUMN welcome_max_retries INTEGER NOT NULL DEFAULT 2;
ALTER TABLE organizations ADD COLUMN welcome_hard_fail_stops BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX idx_outbox_kind_send_status_run_at ON friend_request_outbox(kind, send_status);
CREATE INDEX idx_outbox_welcome_outcome ON friend_request_outbox(welcome_outcome) WHERE welcome_outcome IS NOT NULL;
