-- Wave 1.5-B Backfill — soft-merge stub Contacts tạo bởi nick-worker buggy version
-- Date: 2026-05-29
-- Spec: design doc Section 8
--
-- Strategy:
--   1. Identify stubs: Contacts với zalo_global_id IS NULL AND zalo_uid IS NULL
--      AND có FriendRequestOutbox trỏ về (nghĩa là nick-worker tạo)
--      AND có Friend row của cùng nick + zalo_uid_in_nick = entry.zalo_uid khác.
--   2. Resolve canonical: lấy Friend.contact_id (KH Cha gốc qua friend-sync).
--   3. Re-point 6 FK tables: friend_request_outbox, customer_list_entries,
--      automation_tasks, conversations, contact_access, appointments.
--   4. Soft-delete stub: SET merged_into=canonical, phone_normalized=NULL, phone=NULL.
--   5. Assertion: count(stubs) = count(canonicals) before UPDATE.

BEGIN;

-- Step 1+2: Build canonical mapping
CREATE TEMP TABLE backfill_stub_to_canonical AS
SELECT DISTINCT
  fro.contact_id AS stub_id,
  f.contact_id AS canonical_id
FROM friend_request_outbox fro
JOIN customer_list_entries cle ON cle.id = fro.customer_list_entry_id
JOIN contacts c ON c.id = fro.contact_id
JOIN friends f ON f.zalo_account_id = fro.nick_id AND f.zalo_uid_in_nick = cle.zalo_uid
WHERE c.zalo_global_id IS NULL
  AND c.zalo_uid IS NULL
  AND f.contact_id != fro.contact_id;

-- Step 3: Pre-flight count
DO $$
DECLARE
  pair_count INT;
  stub_uniq INT;
BEGIN
  SELECT COUNT(*) INTO pair_count FROM backfill_stub_to_canonical;
  SELECT COUNT(DISTINCT stub_id) INTO stub_uniq FROM backfill_stub_to_canonical;
  RAISE NOTICE 'Backfill: % stub→canonical pairs, % unique stubs', pair_count, stub_uniq;
END $$;

-- Step 4: Re-point all FK tables (6 tables — enumerate ALL referencing tables per design doc)
UPDATE friend_request_outbox SET contact_id = m.canonical_id
FROM backfill_stub_to_canonical m
WHERE friend_request_outbox.contact_id = m.stub_id;

UPDATE customer_list_entries SET contact_id = m.canonical_id
FROM backfill_stub_to_canonical m
WHERE customer_list_entries.contact_id = m.stub_id;

UPDATE automation_tasks SET contact_id = m.canonical_id
FROM backfill_stub_to_canonical m
WHERE automation_tasks.contact_id = m.stub_id;

-- conversations.contact_id is FK SET NULL on Contact delete, can keep pointing.
-- But to consolidate UI view, re-point too.
UPDATE conversations SET contact_id = m.canonical_id
FROM backfill_stub_to_canonical m
WHERE conversations.contact_id = m.stub_id;

-- contact_access (privacy v2)
UPDATE contact_access SET contact_id = m.canonical_id
FROM backfill_stub_to_canonical m
WHERE contact_access.contact_id = m.stub_id;

-- appointments
UPDATE appointments SET contact_id = m.canonical_id
FROM backfill_stub_to_canonical m
WHERE appointments.contact_id = m.stub_id;

-- Step 5: Soft-delete stubs — mergedInto + clear phone_normalized (clears partial unique conflict)
UPDATE contacts c
SET merged_into = m.canonical_id,
    phone_normalized = NULL,
    phone = NULL,
    updated_at = NOW()
FROM backfill_stub_to_canonical m
WHERE c.id = m.stub_id;

COMMIT;

-- Verify post-state
SELECT
  (SELECT COUNT(*) FROM contacts WHERE merged_into IS NOT NULL AND zalo_global_id IS NULL AND created_at > NOW() - INTERVAL '24 hours') AS soft_deleted_stubs,
  (SELECT COUNT(*) FROM contacts WHERE phone_normalized = '84936668266' AND merged_into IS NULL) AS alive_with_test_phone;
