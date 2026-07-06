-- Phase ZaloAccounts redesign 2026-05-22 — uptime hybrid event log + checkpoint
-- Xem design doc: ~/.gstack/projects/zalocrm/EVO-THANH-private-hs-design-20260522-184345.md

CREATE TABLE "zalo_account_status_log" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zalo_account_status_log_pkey" PRIMARY KEY ("id")
);

-- Index window queries: WHERE accountId=? AND (endedAt IS NULL OR endedAt > since)
CREATE INDEX "zalo_account_status_log_account_id_started_at_idx" ON "zalo_account_status_log"("account_id", "started_at");

-- Org-wide aggregate (team uptime)
CREATE INDEX "zalo_account_status_log_org_id_started_at_idx" ON "zalo_account_status_log"("org_id", "started_at");

-- Find open record per account (endedAt IS NULL is the hot path for writer)
CREATE INDEX "zalo_account_status_log_account_id_ended_at_idx" ON "zalo_account_status_log"("account_id", "ended_at");

-- Partial unique: enforce ĐÚNG 1 record có endedAt IS NULL per account (defensive guard).
-- Nếu writer race condition tạo 2 open records cùng account → constraint violation,
-- transaction rollback → caller retry/fix.
CREATE UNIQUE INDEX "zalo_account_status_log_one_open_per_account_idx" ON "zalo_account_status_log"("account_id") WHERE "ended_at" IS NULL;

ALTER TABLE "zalo_account_status_log"
  ADD CONSTRAINT "zalo_account_status_log_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "zalo_account_status_log"
  ADD CONSTRAINT "zalo_account_status_log_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "zalo_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
