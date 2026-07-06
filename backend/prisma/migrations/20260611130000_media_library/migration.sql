-- CreateTable
CREATE TABLE "media_blobs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "variant_type" TEXT NOT NULL DEFAULT 'original',
    "minio_key" TEXT NOT NULL,
    "public_url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration_sec" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_blobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner_user_id" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "source" TEXT NOT NULL DEFAULT 'upload',
    "source_zalo_account_id" TEXT,
    "folder_id" TEXT,
    "tag_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "original_filename" TEXT,
    "thumbnail_url" TEXT,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_albums" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'folder',
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "owner_user_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_album_items" (
    "id" TEXT NOT NULL,
    "album_id" TEXT NOT NULL,
    "media_asset_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "caption" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_album_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_upload_refs" (
    "id" TEXT NOT NULL,
    "zalo_account_id" TEXT NOT NULL,
    "blob_id" TEXT NOT NULL,
    "zalo_msg_id" TEXT NOT NULL,
    "ts" BIGINT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_upload_refs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_blobs_asset_id_idx" ON "media_blobs"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_blobs_org_id_content_hash_key" ON "media_blobs"("org_id", "content_hash");

-- CreateIndex
CREATE INDEX "media_assets_org_id_kind_idx" ON "media_assets"("org_id", "kind");

-- CreateIndex
CREATE INDEX "media_assets_org_id_visibility_idx" ON "media_assets"("org_id", "visibility");

-- CreateIndex
CREATE INDEX "media_assets_org_id_owner_user_id_idx" ON "media_assets"("org_id", "owner_user_id");

-- CreateIndex
CREATE INDEX "media_assets_org_id_archived_at_idx" ON "media_assets"("org_id", "archived_at");

-- CreateIndex
CREATE INDEX "media_assets_folder_id_idx" ON "media_assets"("folder_id");

-- CreateIndex
CREATE INDEX "media_assets_tag_ids_idx" ON "media_assets" USING GIN ("tag_ids");

-- CreateIndex
CREATE INDEX "media_albums_org_id_visibility_idx" ON "media_albums"("org_id", "visibility");

-- CreateIndex
CREATE INDEX "media_albums_org_id_owner_user_id_idx" ON "media_albums"("org_id", "owner_user_id");

-- CreateIndex
CREATE INDEX "media_albums_org_id_kind_idx" ON "media_albums"("org_id", "kind");

-- CreateIndex
CREATE INDEX "media_album_items_media_asset_id_idx" ON "media_album_items"("media_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_album_items_album_id_media_asset_id_key" ON "media_album_items"("album_id", "media_asset_id");

-- CreateIndex
CREATE INDEX "media_upload_refs_blob_id_idx" ON "media_upload_refs"("blob_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_upload_refs_zalo_account_id_blob_id_key" ON "media_upload_refs"("zalo_account_id", "blob_id");

-- AddForeignKey

-- AddForeignKey
ALTER TABLE "media_blobs" ADD CONSTRAINT "media_blobs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_blobs" ADD CONSTRAINT "media_blobs_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "media_albums"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_albums" ADD CONSTRAINT "media_albums_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_albums" ADD CONSTRAINT "media_albums_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_albums" ADD CONSTRAINT "media_albums_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_album_items" ADD CONSTRAINT "media_album_items_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "media_albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_album_items" ADD CONSTRAINT "media_album_items_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_upload_refs" ADD CONSTRAINT "media_upload_refs_zalo_account_id_fkey" FOREIGN KEY ("zalo_account_id") REFERENCES "zalo_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_upload_refs" ADD CONSTRAINT "media_upload_refs_blob_id_fkey" FOREIGN KEY ("blob_id") REFERENCES "media_blobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "care_sessions_nick_thread_idx" RENAME TO "care_sessions_nick_id_external_thread_id_idx";

