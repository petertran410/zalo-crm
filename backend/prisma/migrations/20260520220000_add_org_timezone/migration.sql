-- Org-level timezone 2026-05-20: lưu offset cố định (vd +07:00) để mọi nơi
-- (UI, log, debug) quy ước cùng 1 múi giờ. Mặc định +07:00 (Việt Nam).
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT '+07:00';
