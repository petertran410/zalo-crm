-- CreateTable: Workspace Session — Sales multi-session workspace
CREATE TABLE "workspace_sessions" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "contact_name" TEXT NOT NULL,
    "session_data" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique per user per contact
CREATE UNIQUE INDEX "workspace_sessions_user_id_contact_id_key" ON "workspace_sessions"("user_id", "contact_id");

-- CreateIndex
CREATE INDEX "workspace_sessions_user_id_is_active_idx" ON "workspace_sessions"("user_id", "is_active");

-- CreateIndex
CREATE INDEX "workspace_sessions_org_id_user_id_idx" ON "workspace_sessions"("org_id", "user_id");

-- AddForeignKey
ALTER TABLE "workspace_sessions" ADD CONSTRAINT "workspace_sessions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_sessions" ADD CONSTRAINT "workspace_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
