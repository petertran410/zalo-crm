-- CreateTable
CREATE TABLE "facebook_app_configs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "app_id" TEXT,
    "app_secret_enc" TEXT,
    "webhook_verify_token" TEXT,
    "token_enc_key_enc" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facebook_app_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "facebook_app_configs_org_id_key" ON "facebook_app_configs"("org_id");

-- AddForeignKey
ALTER TABLE "facebook_app_configs" ADD CONSTRAINT "facebook_app_configs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

