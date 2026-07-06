-- CreateTable
CREATE TABLE "facebook_page_connections" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "page_name" TEXT NOT NULL,
    "access_token_enc" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3),
    "subscribed_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'connected',
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facebook_page_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facebook_form_mappings" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "page_connection_id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "form_name" TEXT NOT NULL,
    "customer_list_id" TEXT NOT NULL,
    "field_map" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facebook_form_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facebook_lead_events" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "leadgen_id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3),
    "contact_id" TEXT,
    "list_entry_id" TEXT,
    "error" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facebook_lead_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_list_sale_assignments" (
    "id" TEXT NOT NULL,
    "customer_list_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_list_sale_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_assignment_states" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "customer_list_id" TEXT NOT NULL,
    "last_assigned_user_id" TEXT,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_assignment_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "facebook_page_connections_org_id_page_id_key" ON "facebook_page_connections"("org_id", "page_id");

-- CreateIndex
CREATE UNIQUE INDEX "facebook_form_mappings_org_id_form_id_key" ON "facebook_form_mappings"("org_id", "form_id");

-- CreateIndex
CREATE UNIQUE INDEX "facebook_lead_events_leadgen_id_key" ON "facebook_lead_events"("leadgen_id");

-- CreateIndex
CREATE INDEX "facebook_lead_events_org_id_form_id_idx" ON "facebook_lead_events"("org_id", "form_id");

-- CreateIndex
CREATE INDEX "facebook_lead_events_created_at_idx" ON "facebook_lead_events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "customer_list_sale_assignments_customer_list_id_user_id_key" ON "customer_list_sale_assignments"("customer_list_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_assignment_states_customer_list_id_key" ON "sale_assignment_states"("customer_list_id");

-- AddForeignKey
ALTER TABLE "facebook_page_connections" ADD CONSTRAINT "facebook_page_connections_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facebook_form_mappings" ADD CONSTRAINT "facebook_form_mappings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facebook_form_mappings" ADD CONSTRAINT "facebook_form_mappings_page_connection_id_fkey" FOREIGN KEY ("page_connection_id") REFERENCES "facebook_page_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facebook_form_mappings" ADD CONSTRAINT "facebook_form_mappings_customer_list_id_fkey" FOREIGN KEY ("customer_list_id") REFERENCES "customer_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_list_sale_assignments" ADD CONSTRAINT "customer_list_sale_assignments_customer_list_id_fkey" FOREIGN KEY ("customer_list_id") REFERENCES "customer_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_list_sale_assignments" ADD CONSTRAINT "customer_list_sale_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_assignment_states" ADD CONSTRAINT "sale_assignment_states_customer_list_id_fkey" FOREIGN KEY ("customer_list_id") REFERENCES "customer_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FB Lead Ads "Form" metadata columns on customer_list_entries (port từ main)
ALTER TABLE "customer_list_entries"
  ADD COLUMN "fb_leadgen_id" TEXT,
  ADD COLUMN "fb_ad_id" TEXT,
  ADD COLUMN "fb_ad_name" TEXT,
  ADD COLUMN "fb_adset_id" TEXT,
  ADD COLUMN "fb_adset_name" TEXT,
  ADD COLUMN "fb_campaign_id" TEXT,
  ADD COLUMN "fb_campaign_name" TEXT,
  ADD COLUMN "fb_form_id" TEXT,
  ADD COLUMN "fb_form_name" TEXT,
  ADD COLUMN "fb_inbox_url" TEXT,
  ADD COLUMN "fb_platform" TEXT,
  ADD COLUMN "fb_is_organic" BOOLEAN,
  ADD COLUMN "fb_custom_answers" JSONB;

-- CreateIndex
CREATE INDEX "customer_list_entries_customer_list_id_fb_campaign_id_idx" ON "customer_list_entries"("customer_list_id", "fb_campaign_id");

-- CreateIndex
CREATE INDEX "customer_list_entries_customer_list_id_fb_form_id_idx" ON "customer_list_entries"("customer_list_id", "fb_form_id");
