-- 2026-06-19 (Anh chốt) — Tự đặt tên gợi nhớ (Zalo alias) per-trigger.
-- Additive, an toàn: 3 cột mới, default false/null = trigger cũ KHÔNG tự đặt tên (không đổi behavior).
-- auto_alias_enabled: bật/tắt tự đặt tên cho tệp trong trigger.
-- alias_template: mẫu ghép tên (biến render-template, vd "{zalo_name} {trigger_project} {income} {phone}").
-- project_abbr: viết tắt dự án, map thành biến {trigger_project} (gắn 1 lần cho cả tệp).
ALTER TABLE "automation_triggers"
  ADD COLUMN IF NOT EXISTS "auto_alias_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "alias_template" TEXT,
  ADD COLUMN IF NOT EXISTS "project_abbr" TEXT;
