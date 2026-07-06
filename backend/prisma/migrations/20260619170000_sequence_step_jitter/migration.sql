-- 2026-06-19 — Gộp "Luật 2 giãn cách" vào từng bước Sequence.
-- Additive, an toàn: cột jitter ± phút random quanh delay_minutes mỗi bước (0 = tắt).
ALTER TABLE "sequence_steps"
  ADD COLUMN IF NOT EXISTS "jitter_minutes" INTEGER NOT NULL DEFAULT 0;
