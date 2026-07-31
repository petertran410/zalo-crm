-- Migration: add_pos_webhook_logs
-- Tạo table pos_webhook_logs để lưu POS webhook events với retry logic.

CREATE TABLE "pos_webhook_logs" (
    "id"           TEXT NOT NULL,
    "org_id"       TEXT NOT NULL,
    "event_type"   TEXT NOT NULL,
    "payload"      JSONB NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'PENDING',
    "attempts"     INTEGER NOT NULL DEFAULT 0,
    "last_error"   TEXT,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "pos_webhook_logs_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "pos_webhook_logs_org_id_status_idx"        ON "pos_webhook_logs" ("org_id", "status");
CREATE INDEX "pos_webhook_logs_status_attempts_created_idx" ON "pos_webhook_logs" ("status", "attempts", "created_at");
CREATE INDEX "pos_webhook_logs_org_id_event_type_idx"    ON "pos_webhook_logs" ("org_id", "event_type");

-- Foreign key
ALTER TABLE "pos_webhook_logs"
  ADD CONSTRAINT "pos_webhook_logs_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
