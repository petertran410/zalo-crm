-- 2-axis status refactor 2026-05-20: append-only stack các thông báo hệ thống
-- (trùng tệp X, đã CRM, sale loại, số sai format cụ thể, ...). Newest top.
ALTER TABLE "customer_list_entries"
  ADD COLUMN IF NOT EXISTS "system_messages" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill DUP_IN_LIST messages
UPDATE customer_list_entries e SET system_messages = system_messages || jsonb_build_array(
  jsonb_build_object(
    'type', 'DUP_IN_LIST',
    'text', 'Trùng dòng khác trong tệp này',
    'ts', e.created_at::text,
    'payload', jsonb_build_object('entryId', e.dup_in_list_with_entry_id)
  )
)
WHERE e.dup_in_list_with_entry_id IS NOT NULL;

-- Backfill DUP_CROSS_LIST messages (kèm tên tệp gốc)
UPDATE customer_list_entries e SET system_messages = system_messages || jsonb_build_array(
  jsonb_build_object(
    'type', 'DUP_CROSS_LIST',
    'text', 'Đã có ở tệp "' || COALESCE(l.name, 'khác') || '"',
    'ts', e.created_at::text,
    'payload', jsonb_build_object('listId', e.dup_with_list_id, 'listName', l.name)
  )
)
FROM customer_lists l
WHERE e.dup_with_list_id = l.id AND e.dup_with_list_id IS NOT NULL;

-- Backfill DUP_WITH_CRM messages
UPDATE customer_list_entries e SET system_messages = system_messages || jsonb_build_array(
  jsonb_build_object(
    'type', 'DUP_WITH_CRM',
    'text', 'Đã là khách CRM',
    'ts', e.created_at::text,
    'payload', jsonb_build_object('contactId', e.dup_with_contact_id)
  )
)
WHERE e.dup_with_contact_id IS NOT NULL;

-- Backfill INVALID messages
UPDATE customer_list_entries e SET system_messages = system_messages || jsonb_build_array(
  jsonb_build_object(
    'type', upper(coalesce(e.invalid_reason, 'INVALID_FORMAT')),
    'text', CASE
      WHEN e.invalid_reason = 'too_short' THEN 'Số ngắn quá (< 9 chữ số)'
      WHEN e.invalid_reason = 'too_long'  THEN 'Số dài quá (> 11 chữ số)'
      WHEN e.invalid_reason = 'invalid_prefix' THEN 'Sai prefix (không phải mobile VN 03/05/07/08/09)'
      WHEN e.invalid_reason = 'empty' THEN 'Trống'
      ELSE 'Số không hợp lệ'
    END,
    'ts', e.created_at::text,
    'payload', jsonb_build_object('reason', e.invalid_reason)
  )
)
WHERE e.status = 'invalid';

-- Backfill SKIPPED messages
UPDATE customer_list_entries e SET system_messages = system_messages || jsonb_build_array(
  jsonb_build_object(
    'type', 'SKIPPED_BY_SALE',
    'text', 'Sale loại',
    'ts', e.updated_at::text
  )
)
WHERE e.status = 'skipped';

-- 2026-05-20: dup advisory model. Worker enrich tất cả entries valid (kể cả dup_*).
-- Revert dup_* status về 'validated' để worker pick up & set hasZalo. dup_*_id fields
-- vẫn giữ → systemMessages vẫn hiển thị "Trùng tệp X".
UPDATE customer_list_entries
SET status = 'validated', has_zalo = NULL, enriched_at = NULL
WHERE status IN ('dup_in_list', 'dup_cross_list', 'dup_with_crm');

-- Recompute counters (dup counters đọc từ dup_*_id fields, advisory model)
UPDATE customer_lists l SET
  total_entries = sub.total, valid_entries = sub.valid, invalid_entries = sub.invalid,
  dup_in_list_entries = sub.dup_in_list, dup_cross_list_entries = sub.dup_cross,
  dup_with_contact_entries = sub.dup_crm, has_zalo_entries = sub.has_zalo,
  no_zalo_entries = sub.no_zalo, pending_lookup_entries = sub.pending_lookup,
  status = CASE WHEN sub.pending_lookup = 0 AND l.status <> 'archived' THEN 'done' ELSE 'processing' END
FROM (
  SELECT customer_list_id,
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE phone_valid = true)::int AS valid,
    COUNT(*) FILTER (WHERE status = 'invalid')::int AS invalid,
    COUNT(*) FILTER (WHERE dup_in_list_with_entry_id IS NOT NULL)::int AS dup_in_list,
    COUNT(*) FILTER (WHERE dup_with_list_id IS NOT NULL)::int AS dup_cross,
    COUNT(*) FILTER (WHERE dup_with_contact_id IS NOT NULL)::int AS dup_crm,
    COUNT(*) FILTER (WHERE has_zalo = true)::int AS has_zalo,
    COUNT(*) FILTER (WHERE has_zalo = false)::int AS no_zalo,
    COUNT(*) FILTER (WHERE status = 'validated')::int AS pending_lookup
  FROM customer_list_entries GROUP BY customer_list_id
) sub WHERE l.id = sub.customer_list_id;
