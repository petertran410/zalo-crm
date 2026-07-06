CREATE TABLE "system_notify_recipients" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "target_user_id" TEXT NOT NULL,
  "sender_zalo_account_id" TEXT,
  "internal_contact_zalo_account_id" TEXT,
  "conversation_id" TEXT,
  "thread_id_in_sender_view" TEXT,
  "status" TEXT NOT NULL DEFAULT 'invalid',
  "error" TEXT,
  "last_verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "system_notify_recipients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "system_notifications" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "sender_zalo_account_id" TEXT,
  "target_user_id" TEXT NOT NULL,
  "internal_contact_zalo_account_id" TEXT,
  "recipient_id" TEXT,
  "conversation_id" TEXT,
  "channel" TEXT NOT NULL DEFAULT 'crm_panel',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "zalo_msg_id" TEXT,
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" TIMESTAMP(3),

  CONSTRAINT "system_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "system_notify_recipients_target_user_id_sender_zalo_account_id_key"
  ON "system_notify_recipients"("target_user_id", "sender_zalo_account_id");
CREATE INDEX "system_notify_recipients_org_id_status_idx" ON "system_notify_recipients"("org_id", "status");
CREATE INDEX "system_notify_recipients_sender_zalo_account_id_status_idx" ON "system_notify_recipients"("sender_zalo_account_id", "status");
CREATE INDEX "system_notifications_org_id_created_at_idx" ON "system_notifications"("org_id", "created_at" DESC);
CREATE INDEX "system_notifications_target_user_id_created_at_idx" ON "system_notifications"("target_user_id", "created_at" DESC);
CREATE INDEX "system_notifications_org_id_status_created_at_idx" ON "system_notifications"("org_id", "status", "created_at" DESC);

ALTER TABLE "system_notify_recipients" ADD CONSTRAINT "system_notify_recipients_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "system_notify_recipients" ADD CONSTRAINT "system_notify_recipients_target_user_id_fkey"
  FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "system_notify_recipients" ADD CONSTRAINT "system_notify_recipients_sender_zalo_account_id_fkey"
  FOREIGN KEY ("sender_zalo_account_id") REFERENCES "zalo_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "system_notify_recipients" ADD CONSTRAINT "system_notify_recipients_internal_contact_zalo_account_id_fkey"
  FOREIGN KEY ("internal_contact_zalo_account_id") REFERENCES "zalo_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "system_notifications" ADD CONSTRAINT "system_notifications_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "system_notifications" ADD CONSTRAINT "system_notifications_target_user_id_fkey"
  FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "system_notifications" ADD CONSTRAINT "system_notifications_sender_zalo_account_id_fkey"
  FOREIGN KEY ("sender_zalo_account_id") REFERENCES "zalo_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "system_notifications" ADD CONSTRAINT "system_notifications_internal_contact_zalo_account_id_fkey"
  FOREIGN KEY ("internal_contact_zalo_account_id") REFERENCES "zalo_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
