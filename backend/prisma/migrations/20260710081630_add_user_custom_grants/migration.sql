-- DropForeignKey
ALTER TABLE "contacts" DROP CONSTRAINT "contacts_archived_by_id_fkey";

-- DropIndex
DROP INDEX "contacts_pool_robin_idx";

-- DropIndex
DROP INDEX "zalo_accounts_org_id_archived_at_idx";

-- AlterTable
ALTER TABLE "automation_triggers" ALTER COLUMN "welcome_delay_seconds" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "lead_notify_acks" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "custom_grants" JSONB;

-- CreateIndex
CREATE INDEX "contacts_org_id_pooled_count_last_pooled_at_idx" ON "contacts"("org_id", "pooled_count", "last_pooled_at");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_archived_by_id_fkey" FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_source_zalo_account_id_fkey" FOREIGN KEY ("source_zalo_account_id") REFERENCES "zalo_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "lead_pool_distributions_org_id_assigned_to_user_id_distributed_" RENAME TO "lead_pool_distributions_org_id_assigned_to_user_id_distribu_idx";
