-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "pos_customer_code" TEXT,
ADD COLUMN     "pos_customer_id" INTEGER,
ADD COLUMN     "pos_synced_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "contacts_org_id_pos_customer_code_idx" ON "contacts"("org_id", "pos_customer_code");

-- RenameIndex
ALTER INDEX "work_item_attachments_org_id_work_item_type_work_item_id_positi" RENAME TO "work_item_attachments_org_id_work_item_type_work_item_id_po_idx";

-- RenameIndex
ALTER INDEX "work_item_attachments_work_item_type_work_item_id_media_asset_i" RENAME TO "work_item_attachments_work_item_type_work_item_id_media_ass_key";
