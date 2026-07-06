-- Phase AI Format fix 2026-05-28
-- Cho phép ai_suggestions.conversation_id NULL cho AI tasks không gắn conv cụ thể
-- (format-rich, sales-handoff, lead-pool suggestions). Trước fix: code lưu
-- conversationId='system' → FK violated → catch swallow → quota counter sai.
ALTER TABLE "ai_suggestions" ALTER COLUMN "conversation_id" DROP NOT NULL;
