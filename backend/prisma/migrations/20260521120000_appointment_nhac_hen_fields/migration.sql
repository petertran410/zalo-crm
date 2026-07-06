-- 2026-05-21 "Nhắc hẹn" refactor — anh chốt 1 modal unified cho create+edit:
--   title       — tiêu đề (default = "Gọi nhắc KH X" from context)
--   durationMin — dự kiến dành thời gian (phút), endAt tính ngầm = startAt + duration
--   location    — địa điểm (5 preset + smart suggest regex từ title)
ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "title" TEXT,
  ADD COLUMN IF NOT EXISTS "duration_min" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS "location" TEXT;

-- Migrate type values từ legacy healthcare → BĐS sales context:
--   reminder / tai_kham / other → follow_up (Theo dõi, catchall)
--   new_visit                   → meeting (Gặp mặt)
--   consultation                → call (Gọi điện)
-- Đã chạy production-DB 2026-05-21 (6 rows migrated).
UPDATE "appointments" SET "type" = 'follow_up' WHERE "type" IN ('reminder', 'tai_kham', 'other');
UPDATE "appointments" SET "type" = 'call' WHERE "type" = 'consultation';
UPDATE "appointments" SET "type" = 'meeting' WHERE "type" = 'new_visit';
