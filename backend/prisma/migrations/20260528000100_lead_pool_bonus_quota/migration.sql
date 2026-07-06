-- Phase Lead Pool admin reset 2026-05-28
CREATE TABLE "lead_pool_bonus_quotas" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "date_key" TEXT NOT NULL,
  "bonus_count" INTEGER NOT NULL,
  "granted_by_user_id" TEXT NOT NULL,
  "reviewed_lead_ids" JSONB NOT NULL DEFAULT '[]',
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_pool_bonus_quotas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "lead_pool_bonus_quotas_org_id_user_id_date_key_idx" ON "lead_pool_bonus_quotas"("org_id", "user_id", "date_key");
CREATE INDEX "lead_pool_bonus_quotas_org_id_date_key_idx" ON "lead_pool_bonus_quotas"("org_id", "date_key");
ALTER TABLE "lead_pool_bonus_quotas" ADD CONSTRAINT "lead_pool_bonus_quotas_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_pool_bonus_quotas" ADD CONSTRAINT "lead_pool_bonus_quotas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "lead_pool_bonus_quotas" ADD CONSTRAINT "lead_pool_bonus_quotas_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
