-- 2026-06-06 (Anh chốt) — tách friend_read thành friend_lookup (tìm SĐT→UID) +
-- contact_sync (đồng bộ danh bạ). Seed org default cho 2 category mới ở mọi org.
-- friend_read cũ giữ nguyên (cho online/recommendations/sent-requests còn lại).
INSERT INTO "sdk_limits" ("id","org_id","zalo_account_id","category","daily_limit","burst_limit","burst_window_ms","created_at","updated_at")
SELECT gen_random_uuid()::text, o."id", NULL, v.category, v.daily, v.burst, v.win, NOW(), NOW()
FROM "organizations" o
CROSS JOIN (VALUES
  ('friend_lookup', 1000, 15, 30000),
  ('contact_sync',  100,  5,  60000)
) AS v(category, daily, burst, win)
WHERE NOT EXISTS (
  SELECT 1 FROM "sdk_limits" s
  WHERE s."org_id" = o."id" AND s."zalo_account_id" IS NULL AND s."category" = v.category
);
