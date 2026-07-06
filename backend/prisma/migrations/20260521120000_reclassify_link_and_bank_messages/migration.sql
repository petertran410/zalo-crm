-- Reclassify 2026-05-21: backfill content_type cho 2 nhóm message bị classify sai.
-- Gắn liền với fix detect rule trong zalo-message-helpers.ts. Idempotent — chạy lại
-- không ảnh hưởng vì WHERE clause filter chính xác nhóm đang sai.

-- G1: 635 row có action='recommened.link' (typo của Zalo) hoặc 'recommended.link'
--     với href hợp lệ — đây là KH/sale share link có preview, KHÔNG phải danh thiếp.
--     Reclassify content_type='contact_card' → 'link'.
UPDATE "messages"
SET "content_type" = 'link'
WHERE "content_type" = 'contact_card'
  AND "is_deleted" = false
  AND "content" IS NOT NULL
  AND (
    "content" ~ '"action":\s*"recommened\.link"'
    OR "content" ~ '"action":\s*"recommended\.link"'
  )
  AND "content" ~ '"href":\s*"https?://';

-- G2: 14 row có action='zinstant.bankcard' nhưng bị fallback vào 'rich' (vì code
--     detect bank rule được add SAU khi mấy row này đã ingest).
--     Reclassify content_type='rich' → 'bank_transfer'.
UPDATE "messages"
SET "content_type" = 'bank_transfer'
WHERE "content_type" = 'rich'
  AND "is_deleted" = false
  AND "content" IS NOT NULL
  AND "content" ~ '"action":\s*"zinstant\.bankcard"';
