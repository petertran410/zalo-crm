-- Wave 1.5-B — Contact parent-child dedup hardening
-- Date: 2026-05-29
-- Spec: ~/.gstack/projects/zalocrm/EVO-THANH-private-hs-design-friend-invite-flow-review-20260529.md
--
-- Anh chốt 2026-05-29: "UID không khớp được. Chỉ khớp duy nhất 2 tham số global_id và phone."
--
-- Single transaction = safety: nếu bất kỳ step nào fail (backfill, pre-flight dup, index
-- creation, verification) → toàn bộ rollback. Không bao giờ rơi vào trạng thái nửa vời
-- (stubs còn nhưng index đã có, hoặc index có nhưng còn dup ẩn).
--
-- Steps:
--   0. Inline backfill (từ scripts/wave_1_5_backfill.sql) — soft-merge nick-worker stubs.
--      GROUP BY stub_id với MIN(canonical_id) tiebreaker → 1 stub map về đúng 1 canonical
--      kể cả khi cùng phone xuất hiện ở nhiều friend rows.
--   1. Pre-flight: DO $$ block đếm dup (org_id, phone_normalized) trên rows alive.
--      Nếu > 0 → RAISE EXCEPTION → rollback toàn bộ migration.
--   2. CREATE UNIQUE INDEX partial (alive only, phone_normalized NOT NULL).
--   3. Verification: SELECT count = 0 → must succeed (defense in depth).
--
-- Online-safe note: CREATE INDEX CONCURRENTLY không dùng được trong transaction.
-- Tradeoff: small table per org, lock window vài trăm ms acceptable.

BEGIN;

-- =====================================================================
-- Step 0: Inline backfill (soft-merge stubs từ nick-worker buggy version)
-- =====================================================================

-- Step 0.1: Build canonical mapping với MIN(canonical_id) tiebreaker
-- Nếu 1 stub_id matches nhiều friend rows → pick canonical_id nhỏ nhất (stable, deterministic).
CREATE TEMP TABLE backfill_stub_to_canonical AS
SELECT
  stub_id,
  MIN(canonical_id) AS canonical_id
FROM (
  SELECT DISTINCT
    fro.contact_id AS stub_id,
    f.contact_id AS canonical_id
  FROM friend_request_outbox fro
  JOIN customer_list_entries cle ON cle.id = fro.customer_list_entry_id
  JOIN contacts c ON c.id = fro.contact_id
  JOIN friends f ON f.zalo_account_id = fro.nick_id AND f.zalo_uid_in_nick = cle.zalo_uid
  WHERE c.zalo_global_id IS NULL
    AND c.zalo_uid IS NULL
    AND f.contact_id != fro.contact_id
) pairs
GROUP BY stub_id;

-- Step 0.2: Log mapping size (informational, không gate)
DO $$
DECLARE
  pair_count INT;
BEGIN
  SELECT COUNT(*) INTO pair_count FROM backfill_stub_to_canonical;
  RAISE NOTICE 'Wave 1.5-B backfill: % stub→canonical pairs', pair_count;
END $$;

-- Step 0.3: Re-point 6 FK tables về canonical
UPDATE friend_request_outbox SET contact_id = m.canonical_id
FROM backfill_stub_to_canonical m
WHERE friend_request_outbox.contact_id = m.stub_id;

UPDATE customer_list_entries SET contact_id = m.canonical_id
FROM backfill_stub_to_canonical m
WHERE customer_list_entries.contact_id = m.stub_id;

UPDATE automation_tasks SET contact_id = m.canonical_id
FROM backfill_stub_to_canonical m
WHERE automation_tasks.contact_id = m.stub_id;

UPDATE conversations SET contact_id = m.canonical_id
FROM backfill_stub_to_canonical m
WHERE conversations.contact_id = m.stub_id;

UPDATE contact_access SET contact_id = m.canonical_id
FROM backfill_stub_to_canonical m
WHERE contact_access.contact_id = m.stub_id;

UPDATE appointments SET contact_id = m.canonical_id
FROM backfill_stub_to_canonical m
WHERE appointments.contact_id = m.stub_id;

-- Step 0.4: Soft-delete stubs — set merged_into + null phone (clears partial unique conflict)
UPDATE contacts c
SET merged_into = m.canonical_id,
    phone_normalized = NULL,
    phone = NULL,
    updated_at = NOW()
FROM backfill_stub_to_canonical m
WHERE c.id = m.stub_id;

-- =====================================================================
-- Step 1: Pre-flight dup check — gate index creation
-- =====================================================================
-- Nếu vẫn còn duplicate (org_id, phone_normalized) trên rows alive sau backfill →
-- CREATE UNIQUE INDEX sẽ fail giữa chừng. Detect sớm + RAISE để rollback sạch.
DO $$
DECLARE
  dup_count INT;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT org_id, phone_normalized
    FROM contacts
    WHERE merged_into IS NULL
      AND phone_normalized IS NOT NULL
    GROUP BY org_id, phone_normalized
    HAVING COUNT(*) > 1
  ) dups;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Wave 1.5-B pre-flight FAILED: % duplicate (org_id, phone_normalized) groups remain after backfill. Inspect with: SELECT org_id, phone_normalized, COUNT(*) FROM contacts WHERE merged_into IS NULL AND phone_normalized IS NOT NULL GROUP BY 1,2 HAVING COUNT(*) > 1;', dup_count;
  END IF;

  RAISE NOTICE 'Wave 1.5-B pre-flight OK: 0 duplicate groups, safe to create unique index';
END $$;

-- =====================================================================
-- Step 2: Partial unique index on alive Contacts only
-- =====================================================================
-- Prevents race: 2 nick workers parallel resolve same phone → 2 stubs.
-- "Alive" = merged_into IS NULL (soft-deleted stubs reuse phone via mergedInto chain).
-- Allows phone_normalized = NULL on stubs after merge (cleanup pattern in resolve-contact.ts).
CREATE UNIQUE INDEX IF NOT EXISTS "contacts_org_phone_normalized_alive_unique"
ON "contacts"("org_id", "phone_normalized")
WHERE "merged_into" IS NULL AND "phone_normalized" IS NOT NULL;

-- =====================================================================
-- Step 3: Verification — defense in depth
-- =====================================================================
-- Index creation đã enforce uniqueness, nhưng explicit verify để future readers
-- thấy contract rõ ràng. Nếu count != 0 → RAISE → rollback (paranoid mode).
DO $$
DECLARE
  remaining_dups INT;
BEGIN
  SELECT COUNT(*) INTO remaining_dups FROM (
    SELECT org_id, phone_normalized
    FROM contacts
    WHERE merged_into IS NULL
      AND phone_normalized IS NOT NULL
    GROUP BY org_id, phone_normalized
    HAVING COUNT(*) > 1
  ) dups;

  IF remaining_dups != 0 THEN
    RAISE EXCEPTION 'Wave 1.5-B verification FAILED: % dup groups remain post-index (should be impossible). Aborting.', remaining_dups;
  END IF;

  RAISE NOTICE 'Wave 1.5-B verification OK: index live, 0 duplicates remain';
END $$;

COMMIT;
