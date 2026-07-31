-- CreateTable
CREATE TABLE "pos_billing_drafts" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "created_by_user_id" TEXT,
    "pos_customer_id" INTEGER NOT NULL,
    "branch_id" INTEGER NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(14,2),
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "idempotency_key" TEXT NOT NULL,
    "pos_order_id" INTEGER,
    "pos_invoice_id" INTEGER,
    "dispatch_error" TEXT,
    "source_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_billing_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pos_billing_drafts_idempotency_key_key" ON "pos_billing_drafts"("idempotency_key");

-- CreateIndex
CREATE INDEX "pos_billing_drafts_org_id_status_created_at_idx" ON "pos_billing_drafts"("org_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "pos_billing_drafts_org_id_contact_id_idx" ON "pos_billing_drafts"("org_id", "contact_id");

-- AddForeignKey
ALTER TABLE "pos_billing_drafts" ADD CONSTRAINT "pos_billing_drafts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_billing_drafts" ADD CONSTRAINT "pos_billing_drafts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_billing_drafts" ADD CONSTRAINT "pos_billing_drafts_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
