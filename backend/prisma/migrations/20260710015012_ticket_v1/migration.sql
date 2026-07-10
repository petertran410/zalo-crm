-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "ticket_id" TEXT;

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "assignee_user_id" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "resolved_by_user_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "contact_id" TEXT,
    "conversation_id" TEXT,
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tickets_org_id_assignee_user_id_status_idx" ON "tickets"("org_id", "assignee_user_id", "status");

-- CreateIndex
CREATE INDEX "tickets_org_id_contact_id_idx" ON "tickets"("org_id", "contact_id");

-- CreateIndex
CREATE INDEX "tickets_org_id_status_priority_idx" ON "tickets"("org_id", "status", "priority");

-- CreateIndex
CREATE INDEX "tasks_org_id_ticket_id_idx" ON "tasks"("org_id", "ticket_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
