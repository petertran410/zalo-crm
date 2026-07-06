-- CreateTable
CREATE TABLE "zalo_oa_app_configs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "app_id" TEXT,
    "app_secret_enc" TEXT,
    "oauth_redirect_uri" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "zalo_oa_app_configs_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "zalo_oa_connections" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "oa_id" TEXT NOT NULL,
    "oa_name" TEXT,
    "access_token_enc" TEXT NOT NULL,
    "refresh_token_enc" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'connected',
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "zalo_oa_connections_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "zalo_form_mappings" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "oa_connection_id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "form_name" TEXT,
    "customer_list_id" TEXT NOT NULL,
    "field_map" JSONB NOT NULL DEFAULT '{}',
    "question_titles" JSONB NOT NULL DEFAULT '{}',
    "last_synced_to_time" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "zalo_form_mappings_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "zalo_lead_events" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3),
    "contact_id" TEXT,
    "list_entry_id" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "zalo_lead_events_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "zalo_oa_app_configs_org_id_key" ON "zalo_oa_app_configs"("org_id");
-- CreateIndex
CREATE UNIQUE INDEX "zalo_oa_connections_org_id_oa_id_key" ON "zalo_oa_connections"("org_id", "oa_id");
-- CreateIndex
CREATE UNIQUE INDEX "zalo_form_mappings_org_id_form_id_key" ON "zalo_form_mappings"("org_id", "form_id");
-- CreateIndex
CREATE INDEX "zalo_lead_events_org_id_form_id_idx" ON "zalo_lead_events"("org_id", "form_id");
-- CreateIndex
CREATE INDEX "zalo_lead_events_created_at_idx" ON "zalo_lead_events"("created_at");
-- CreateIndex
CREATE UNIQUE INDEX "zalo_lead_events_org_id_dedupe_key_key" ON "zalo_lead_events"("org_id", "dedupe_key");
-- AddForeignKey
ALTER TABLE "zalo_form_mappings" ADD CONSTRAINT "zalo_form_mappings_oa_connection_id_fkey" FOREIGN KEY ("oa_connection_id") REFERENCES "zalo_oa_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
