#!/usr/bin/env bash
# =============================================================================
# migrate-storage-urls.sh — đổi public URL của media trong database sang nơi lưu mới
# (sau khi đã copy object — xem migrate-storage-rclone.sh).
#
# HOST-AGNOSTIC: map MỌI URL dạng  <scheme>://<host>/<BUCKET>/<key>  →  <NEW_BASE>/<key>
# Nhờ vậy xử lý được dữ liệu có nhiều host cũ (localhost, fileee, files...) trong 1 lần.
# Cột minio_key lưu key trần → KHÔNG đụng. Xử lý cả URL nhúng trong JSON/content (regexp 'g').
#
# Mặc định DRY-RUN (chỉ đếm). Thêm CONFIRM=1 để áp thật.
#
# Ví dụ (gộp mọi host về domain R2 mới):
#   BUCKET=zalocrm-attachments NEW_BASE="https://files.your-domain.com" \
#   ./scripts/migrate-storage-urls.sh                 # dry-run
#   ... CONFIRM=1 ./scripts/migrate-storage-urls.sh   # áp thật
# =============================================================================
set -euo pipefail

BUCKET="${BUCKET:-zalocrm-attachments}"                       # tên bucket cũ trong path URL
NEW_BASE="${NEW_BASE:?Đặt NEW_BASE (domain mới, KHÔNG dấu / ở cuối)}"
NEW_BASE="${NEW_BASE%/}"                                      # bỏ / thừa cuối nếu có

DB_USER="${DB_USER:-crmuser}"
DB_NAME="${DB_NAME:-zalocrm}"
PSQL="${PSQL:-docker compose exec -T db psql -v ON_ERROR_STOP=1 -U $DB_USER -d $DB_NAME}"
run_sql() { echo "$1" | $PSQL; }

esc() { printf '%s' "$1" | sed "s/'/''/g"; }
B="$(esc "$BUCKET")"; N="$(esc "$NEW_BASE")"

# Pattern khớp host bất kỳ + bucket: https?://<host>/<bucket>/
PAT="https?://[^/]+/${B}/"
RPL="${N}/"

echo "BUCKET (cũ):  $BUCKET"
echo "NEW_BASE:     $NEW_BASE"
echo "Pattern:      $PAT  ->  $RPL"
echo "CONFIRM:      ${CONFIRM:-0} (0 = dry-run)"
echo "----------------------------------------"

# Đếm số dòng dính (dry-run luôn chạy)
run_sql "
SELECT 'media_blobs.public_url'    AS col, count(*) FROM media_blobs   WHERE public_url    ~ '${PAT}'
UNION ALL SELECT 'media_assets.thumbnail_url',  count(*) FROM media_assets  WHERE thumbnail_url ~ '${PAT}'
UNION ALL SELECT 'messages.attachments',        count(*) FROM messages      WHERE attachments::text ~ '${PAT}'
UNION ALL SELECT 'messages.content',            count(*) FROM messages      WHERE content ~ '${PAT}'
UNION ALL SELECT 'messages.metadata',           count(*) FROM messages      WHERE metadata::text ~ '${PAT}'
UNION ALL SELECT 'organizations.welcome_image_url', count(*) FROM organizations WHERE welcome_image_url ~ '${PAT}'
UNION ALL SELECT 'organizations.logo_url',      count(*) FROM organizations WHERE logo_url ~ '${PAT}';
"

if [ "${CONFIRM:-0}" != "1" ]; then
  echo ""
  echo ">> DRY-RUN. Thêm CONFIRM=1 để áp thật. (Backup DB trước: docker compose exec -T db pg_dump -U $DB_USER $DB_NAME > backup.sql)"
  exit 0
fi

echo ">> Đang áp (regexp_replace, global)..."
run_sql "
BEGIN;
UPDATE media_blobs   SET public_url    = regexp_replace(public_url,    '${PAT}', '${RPL}', 'g') WHERE public_url    ~ '${PAT}';
UPDATE media_assets  SET thumbnail_url = regexp_replace(thumbnail_url, '${PAT}', '${RPL}', 'g') WHERE thumbnail_url ~ '${PAT}';
UPDATE messages      SET attachments  = regexp_replace(attachments::text, '${PAT}', '${RPL}', 'g')::jsonb WHERE attachments::text ~ '${PAT}';
UPDATE messages      SET content       = regexp_replace(content,       '${PAT}', '${RPL}', 'g') WHERE content       ~ '${PAT}';
UPDATE messages      SET metadata     = regexp_replace(metadata::text, '${PAT}', '${RPL}', 'g')::jsonb WHERE metadata::text ~ '${PAT}';
UPDATE organizations SET welcome_image_url = regexp_replace(welcome_image_url, '${PAT}', '${RPL}', 'g') WHERE welcome_image_url ~ '${PAT}';
UPDATE organizations SET logo_url      = regexp_replace(logo_url,      '${PAT}', '${RPL}', 'g') WHERE logo_url      ~ '${PAT}';
COMMIT;
"
echo ">> Xong. Kiểm tra ảnh cũ hiển thị OK rồi mới tắt MinIO."
