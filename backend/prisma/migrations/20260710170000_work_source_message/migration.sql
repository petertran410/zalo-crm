-- Group chat "tạo công việc/khiếu nại từ tin nhắn" (2026-07-10): provenance link (additive, nullable).

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "source_message_id" TEXT;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "source_message_id" TEXT;
