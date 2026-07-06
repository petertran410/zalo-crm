#!/usr/bin/env bash
# =============================================================================
# migrate-storage-rclone.sh — copy object cũ từ MinIO sang đích mới (đĩa VPS hoặc R2).
# Chạy khi BẠN SẴN SÀNG migrate dữ liệu cũ. Không cần chạy nếu bắt đầu trắng.
#
# Bước này CHỈ copy bytes. Sau khi copy xong PHẢI chạy migrate-storage-urls.sh
# để đổi URL trong database, rồi mới tắt MinIO.
#
# Yêu cầu: rclone (apt install rclone). MinIO đang chạy (có endpoint + key).
# =============================================================================
set -euo pipefail

# --- Cấu hình (sửa cho khớp môi trường) ---
MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://localhost:9000}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-minioadmin}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:?Đặt MINIO_SECRET_KEY}"
MINIO_BUCKET="${MINIO_BUCKET:-zalocrm-attachments}"

# Đích: 'disk' (ổ VPS) hoặc 'r2'.
DEST="${DEST:-disk}"

# [disk] thư mục đích = UPLOAD_DIR. CHÚ Ý: nếu UPLOAD_DIR nằm trong docker volume,
# trỏ vào host-path của volume, vd: /var/lib/docker/volumes/zalocrm_file_storage/_data
DEST_DIR="${DEST_DIR:-/var/lib/zalo-crm/files}"

# [r2] config R2
R2_ENDPOINT="${R2_ENDPOINT:-}"
R2_ACCESS_KEY="${R2_ACCESS_KEY:-}"
R2_SECRET_KEY="${R2_SECRET_KEY:-}"
R2_BUCKET="${R2_BUCKET:-}"

SRC="minio_src:${MINIO_BUCKET}"

# remote nguồn MinIO (S3-compatible)
export RCLONE_CONFIG_MINIO_SRC_TYPE=s3
export RCLONE_CONFIG_MINIO_SRC_PROVIDER=Minio
export RCLONE_CONFIG_MINIO_SRC_ENV_AUTH=false
export RCLONE_CONFIG_MINIO_SRC_ACCESS_KEY_ID="$MINIO_ACCESS_KEY"
export RCLONE_CONFIG_MINIO_SRC_SECRET_ACCESS_KEY="$MINIO_SECRET_KEY"
export RCLONE_CONFIG_MINIO_SRC_ENDPOINT="$MINIO_ENDPOINT"

if [ "$DEST" = "disk" ]; then
  echo ">> Copy MinIO ($SRC) → ĐĨA: $DEST_DIR"
  mkdir -p "$DEST_DIR"
  rclone copy "$SRC" "$DEST_DIR" --progress --transfers 8 --checkers 16
  echo ">> Xong. Tổng file: $(find "$DEST_DIR" -type f | wc -l)"
elif [ "$DEST" = "r2" ]; then
  : "${R2_ENDPOINT:?Đặt R2_ENDPOINT}" "${R2_ACCESS_KEY:?}" "${R2_SECRET_KEY:?}" "${R2_BUCKET:?}"
  export RCLONE_CONFIG_R2_DST_TYPE=s3
  export RCLONE_CONFIG_R2_DST_PROVIDER=Cloudflare
  export RCLONE_CONFIG_R2_DST_ENV_AUTH=false
  export RCLONE_CONFIG_R2_DST_ACCESS_KEY_ID="$R2_ACCESS_KEY"
  export RCLONE_CONFIG_R2_DST_SECRET_ACCESS_KEY="$R2_SECRET_KEY"
  export RCLONE_CONFIG_R2_DST_ENDPOINT="$R2_ENDPOINT"
  export RCLONE_CONFIG_R2_DST_REGION=auto
  echo ">> Copy MinIO ($SRC) → R2 (r2_dst:${R2_BUCKET})"
  rclone copy "$SRC" "r2_dst:${R2_BUCKET}" --progress --transfers 8 --checkers 16 --s3-no-check-bucket
  echo ">> Xong."
else
  echo "DEST phải là 'disk' hoặc 'r2'" >&2; exit 1
fi

echo ""
echo ">> TIẾP THEO: chạy scripts/migrate-storage-urls.sh để đổi URL trong database."
