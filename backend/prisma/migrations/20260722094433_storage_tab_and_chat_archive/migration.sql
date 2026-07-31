-- AlterTable
ALTER TABLE "media_albums" ADD COLUMN     "disk_slug" TEXT;

-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "folder_link_name" TEXT,
ADD COLUMN     "storage_scope" TEXT NOT NULL DEFAULT 'catalog';

-- CreateTable
CREATE TABLE "media_shares" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "media_asset_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "shared_by_id" TEXT NOT NULL,
    "shared_with_user_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "last_viewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_archives" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'both',
    "contact_name" TEXT,
    "contact_id" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'zalo',
    "zalo_account_id" TEXT,
    "nick_name" TEXT,
    "summary_text" TEXT,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "media_count" INTEGER NOT NULL DEFAULT 0,
    "first_message_at" TIMESTAMP(3),
    "last_message_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_archives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_archive_messages" (
    "id" TEXT NOT NULL,
    "archive_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "source_message_id" TEXT,
    "sender_type" TEXT NOT NULL,
    "sender_name" TEXT,
    "content" TEXT,
    "content_type" TEXT NOT NULL DEFAULT 'text',
    "media_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "media_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sent_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_archive_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_shares_token_key" ON "media_shares"("token");

-- CreateIndex
CREATE INDEX "media_shares_org_id_shared_with_user_id_revoked_at_idx" ON "media_shares"("org_id", "shared_with_user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "media_shares_media_asset_id_idx" ON "media_shares"("media_asset_id");

-- CreateIndex
CREATE INDEX "media_shares_token_idx" ON "media_shares"("token");

-- CreateIndex
CREATE UNIQUE INDEX "media_shares_media_asset_id_shared_with_user_id_key" ON "media_shares"("media_asset_id", "shared_with_user_id");

-- CreateIndex
CREATE INDEX "chat_archives_org_id_created_at_idx" ON "chat_archives"("org_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "chat_archives_org_id_conversation_id_created_at_idx" ON "chat_archives"("org_id", "conversation_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "chat_archives_org_id_contact_id_idx" ON "chat_archives"("org_id", "contact_id");

-- CreateIndex
CREATE INDEX "chat_archive_messages_archive_id_seq_idx" ON "chat_archive_messages"("archive_id", "seq");

-- CreateIndex
CREATE INDEX "media_assets_org_id_storage_scope_owner_user_id_idx" ON "media_assets"("org_id", "storage_scope", "owner_user_id");

-- AddForeignKey
ALTER TABLE "media_shares" ADD CONSTRAINT "media_shares_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_shares" ADD CONSTRAINT "media_shares_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_shares" ADD CONSTRAINT "media_shares_shared_by_id_fkey" FOREIGN KEY ("shared_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_shares" ADD CONSTRAINT "media_shares_shared_with_user_id_fkey" FOREIGN KEY ("shared_with_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_archives" ADD CONSTRAINT "chat_archives_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_archives" ADD CONSTRAINT "chat_archives_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_archive_messages" ADD CONSTRAINT "chat_archive_messages_archive_id_fkey" FOREIGN KEY ("archive_id") REFERENCES "chat_archives"("id") ON DELETE CASCADE ON UPDATE CASCADE;
