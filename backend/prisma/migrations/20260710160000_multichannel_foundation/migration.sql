-- Multi-channel V1 foundation (2026-07-10): additive channel-awareness on messaging tables.
-- Toàn bộ ADDITIVE: cột channel backfill 'zalo' cho row cũ; cột FB/externalMsgId nullable (all-null
-- → unique index KHÔNG va chạm). zaloAccountId GIỮ non-null ở phase này (nới nullable ở phase 2).

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'zalo',
ADD COLUMN     "facebook_page_account_id" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "external_msg_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "conversations_facebook_page_account_id_external_thread_id_key" ON "conversations"("facebook_page_account_id", "external_thread_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversation_id_external_msg_id_key" ON "messages"("conversation_id", "external_msg_id");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_facebook_page_account_id_fkey" FOREIGN KEY ("facebook_page_account_id") REFERENCES "facebook_page_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
