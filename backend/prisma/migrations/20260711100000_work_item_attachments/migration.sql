-- WorkItemAttachment V1 2026-07-13 — media (ảnh/video/file) đính kèm Task/Ticket.
-- Polymorphic workItemType+workItemId; reuse MediaAsset; optional annotated MediaBlob variant.

CREATE TABLE IF NOT EXISTS "work_item_attachments" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "work_item_type" TEXT NOT NULL,
    "work_item_id" TEXT NOT NULL,
    "media_asset_id" TEXT NOT NULL,
    "source_message_id" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "variant_blob_id" TEXT,
    "added_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_item_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "work_item_attachments_work_item_type_work_item_id_media_asset_id_key"
  ON "work_item_attachments"("work_item_type", "work_item_id", "media_asset_id");

CREATE INDEX IF NOT EXISTS "work_item_attachments_org_id_work_item_type_work_item_id_position_idx"
  ON "work_item_attachments"("org_id", "work_item_type", "work_item_id", "position");

DO $$ BEGIN
  ALTER TABLE "work_item_attachments"
    ADD CONSTRAINT "work_item_attachments_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "work_item_attachments"
    ADD CONSTRAINT "work_item_attachments_media_asset_id_fkey"
    FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "work_item_attachments"
    ADD CONSTRAINT "work_item_attachments_variant_blob_id_fkey"
    FOREIGN KEY ("variant_blob_id") REFERENCES "media_blobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "work_item_attachments"
    ADD CONSTRAINT "work_item_attachments_added_by_user_id_fkey"
    FOREIGN KEY ("added_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
