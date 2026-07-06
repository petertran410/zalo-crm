# ☁️ Hướng dẫn cấu hình Cloudflare R2 cho Hi-CRM

> Hướng dẫn từng bước chuyển nơi lưu ảnh/file (chat attachments, Kho media) sang **Cloudflare R2**.
> Viết cho người không chuyên kỹ thuật làm theo cũng được. Mọi thao tác dashboard + dòng lệnh đều có mẫu.
>
> **Cập nhật:** 2026-06-20 — Hi-CRM hỗ trợ 2 nơi lưu (`STORAGE_DRIVER`): `local` (ổ đĩa VPS, mặc định)
> và `r2` (Cloudflare R2). Tài liệu này hướng dẫn bật `r2`.

---

## 0. Khi nào nên dùng R2?

| | **local** (mặc định) | **r2** |
|---|---|---|
| Lưu ở đâu | Ổ đĩa VPS | Cloudflare R2 (đám mây) |
| Chi phí | Miễn phí (tốn dung lượng ổ) | Có phí, **nhưng egress miễn phí** |
| Độ bền | Tự lo backup, ổ hỏng = mất | 11 số 9, tự nhân bản |
| Khi nào chọn | Dữ liệu nhỏ-vừa, 1 server | Dữ liệu lớn, cần bền, nhiều traffic |

→ Nếu đang chạy ổn với `local` và chưa cần, **không bắt buộc** đổi. Tài liệu này dành cho khi bạn quyết định dùng R2.

**Bạn sẽ cần ~15 phút** và một tài khoản Cloudflare (miễn phí để tạo).

---

## 1. Tạo bucket R2

1. Đăng nhập [dash.cloudflare.com](https://dash.cloudflare.com) → menu trái chọn **R2**.
2. Lần đầu dùng R2: bấm **Purchase R2** / **Enable R2** (màn hình hiện **Total Due Now = $0.00** — không trừ tiền ngay, chỉ tính khi dùng vượt free tier).
3. Bấm **Create bucket**.
4. **Bucket name**: đặt tên (ví dụ `hdgroup`). ⚠️ **Tên là vĩnh viễn, không đổi được.**
5. **Location**: để **Automatic** (Cloudflare tự chọn, ví dụ Asia-Pacific).
6. **Default Storage Class**: chọn **Standard** (ảnh khách xem thường xuyên — xem giải thích cuối tài liệu).
7. Bấm **Create bucket**.

📝 Ghi lại **tên bucket** vừa tạo.

---

## 2. Bật truy cập công khai cho bucket (BẮT BUỘC)

R2 **không** cho tải file công khai qua endpoint S3 API — phải có domain công khai thì trình duyệt + Zalo CDN mới tải được ảnh. Chọn **1 trong 2**:

### Cách A — Public Development URL (nhanh, để test)
1. Vào bucket → tab **Settings**.
2. Mục **Public access** → **R2.dev subdomain** → bấm **Enable**.
3. Cloudflare cho 1 domain dạng `https://pub-xxxxxxxx.r2.dev`.

📝 Ghi lại domain `pub-....r2.dev` này.

> ⚠️ r2.dev có giới hạn tốc độ, **không khuyên cho production lâu dài**. Dùng tạm để test thì OK.

### Cách B — Custom Domain (khuyên cho production)
1. Domain của bạn phải đang quản lý DNS trên Cloudflare.
2. Bucket → **Settings** → **Custom Domains** → **Connect Domain**.
3. Nhập subdomain, ví dụ `file2.your-domain.com` → Cloudflare tự thêm bản ghi DNS + bật CDN.
4. Domain công khai của bạn giờ là `https://file2.your-domain.com`.

📝 Ghi lại domain công khai.

> 💡 Dù chọn cách nào, domain công khai **trỏ thẳng vào bucket** — đường dẫn file là `https://<domain>/media/...`, **KHÔNG kèm tên bucket**.

---

## 3. Tạo API Token (lấy Access Key + Secret)

Đây là "chìa khóa" để backend ghi/đọc file. Account ID hay endpoint **chưa đủ** — phải có cặp key này.

1. Trong trang **R2** (overview), bấm **Manage R2 API Tokens** (góc trên phải).
2. **Create API token**.
3. **Permissions**: chọn **Object Read & Write**.
4. **Specify bucket(s)**: giới hạn vào đúng bucket vừa tạo (`hdgroup`) — an toàn hơn cấp toàn account.
5. Bấm **Create API Token**. Cloudflare hiện ra (👀 **chỉ 1 lần**):
   - **Access Key ID** — chuỗi ~32 ký tự
   - **Secret Access Key** — chuỗi dài → **copy ngay**, đóng trang là mất.
   - **Endpoint** dạng `https://<account_id>.r2.cloudflarestorage.com`

📝 Ghi lại cả 3: Access Key ID, Secret Access Key, Endpoint.

> 🔒 Secret Access Key là bí mật như mật khẩu. Không gửi qua chat, không commit lên git.

---

## 4. Điền vào file `.env`

Mở file `.env` (cùng thư mục `docker-compose.yml`). Tìm khối **Object/File Storage** và sửa thành:

```bash
# Đổi driver sang R2
STORAGE_DRIVER=r2

# 5 biến R2 — điền từ Bước 2 + 3
S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com   # Endpoint từ Bước 3
S3_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev                    # Domain công khai từ Bước 2 (KHÔNG kèm tên bucket, KHÔNG dấu / cuối)
S3_BUCKET=hdgroup                                           # Tên bucket từ Bước 1
S3_REGION=auto                                             # R2 LUÔN dùng "auto"
S3_ACCESS_KEY=<Access Key ID từ Bước 3>
S3_SECRET_KEY=<Secret Access Key từ Bước 3>
```

✅ Checklist dễ sai:
- `STORAGE_DRIVER=r2` (không phải `local`).
- `S3_REGION=auto` (KHÔNG để `us-east-1`).
- `S3_PUBLIC_URL` **không** có tên bucket, **không** có `/` ở cuối.
- `S3_ENDPOINT` là domain `*.r2.cloudflarestorage.com`, **khác** với `S3_PUBLIC_URL`.

---

## 5. Khởi động lại + kiểm tra

```bash
cd /root/0project/hicrm
docker compose up -d --force-recreate app
docker compose logs -f app | grep -i storage   # xem log storage lúc boot
```

- Nếu log báo `[storage:r2] Không truy cập được bucket...` → sai key/bucket/endpoint, xem lại Bước 3-4.
- Không có cảnh báo → R2 OK.

**Test thực tế:** vào CRM, gửi 1 ảnh trong chat (hoặc tải 1 ảnh lên Kho media). Ảnh hiển thị được = thành công. Mở DevTools (F12) xem URL ảnh phải có dạng `https://<domain-công-khai>/media/....`

---

## 6. (Tùy chọn) Chuyển ảnh CŨ sang R2

Bước 1-5 chỉ áp dụng cho **ảnh mới**. Ảnh cũ (đang ở MinIO hoặc ổ đĩa local) cần migrate riêng. **Bỏ qua nếu bắt đầu trắng / chưa có dữ liệu cũ.**

> 💾 **Backup database trước** khi chạy bước rewrite URL: `docker compose exec -T db pg_dump -U crmuser zalocrm > backup-truoc-migrate.sql`

### 6a. Copy file sang R2

Dùng script có sẵn [scripts/migrate-storage-rclone.sh](../scripts/migrate-storage-rclone.sh) (cần cài `rclone`: `apt install rclone`):

```bash
cd /root/0project/hicrm

# Nếu ảnh cũ đang ở MinIO:
DEST=r2 \
MINIO_ENDPOINT=http://localhost:9000 \
MINIO_ACCESS_KEY=minioadmin MINIO_SECRET_KEY=<mật khẩu MinIO cũ> \
MINIO_BUCKET=zalocrm-attachments \
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com \
R2_ACCESS_KEY=<r2 access key> R2_SECRET_KEY=<r2 secret> R2_BUCKET=hdgroup \
bash scripts/migrate-storage-rclone.sh
```

(Nếu ảnh cũ đang ở **ổ đĩa local**, có thể `rclone copy /var/lib/zalo-crm/files r2_dst:hdgroup` — hoặc dùng script với nguồn là thư mục.)

### 6b. Đổi URL trong database

Script [scripts/migrate-storage-urls.sh](../scripts/migrate-storage-urls.sh) đổi URL cũ → domain mới. Nó **host-agnostic**: map MỌI URL dạng `<host>/<BUCKET>/<key>` → `<NEW_BASE>/<key>`, nên xử lý được dữ liệu có nhiều host cũ (localhost, fileee, files...) trong **1 lần**. **Mặc định DRY-RUN (chỉ đếm)**, thêm `CONFIRM=1` mới áp thật:

```bash
# Xem trước có bao nhiêu dòng sẽ đổi (an toàn, không sửa gì):
BUCKET=zalocrm-attachments \
NEW_BASE="https://files.your-domain.com" \
bash scripts/migrate-storage-urls.sh

# Đúng rồi thì áp thật:
BUCKET=zalocrm-attachments \
NEW_BASE="https://files.your-domain.com" \
CONFIRM=1 bash scripts/migrate-storage-urls.sh
```

> `BUCKET` = tên bucket CŨ xuất hiện trong path URL cũ (thường `zalocrm-attachments`).
> `NEW_BASE` = domain công khai mới (KHÔNG dấu `/` cuối, KHÔNG kèm tên bucket).
>
> Script đổi trên: `media_blobs.public_url`, `media_assets.thumbnail_url`,
> `messages.attachments/content/metadata`, `organizations.welcome_image_url/logo_url`.
> Cột `minio_key` lưu key trần → không đụng.

> ⚠️ **Lưu ý ảnh mồ côi:** nếu DB có URL trỏ host KHÔNG còn bytes (vd `localhost:9100`
> của một MinIO dev cũ), rewrite vẫn đổi host nhưng object không tồn tại trên R2 → ảnh đó
> 404. Đây là ảnh **đã chết từ trước** (host dev không serve công khai), không cứu được vì
> bytes không còn nguồn. Không ảnh hưởng ảnh đang sống (đã có trong MinIO production).

### 6c. Kiểm tra rồi mới tắt MinIO

Vào CRM xem **ảnh cũ** hiển thị OK. Xong xuôi mới tắt MinIO:
```bash
docker compose stop minio
```
(Giữ MinIO chạy tới khi chắc chắn — đừng tắt vội.)

---

## 7. Quay lại lưu ổ đĩa (rollback)

Có sự cố với R2? Đổi lại 1 dòng trong `.env` rồi restart:
```bash
STORAGE_DRIVER=local
```
```bash
docker compose up -d --force-recreate app
```
Ảnh mới lại lưu vào ổ VPS. (Ảnh đã đẩy lên R2 vẫn còn trên R2.)

---

## 8. Xử lý sự cố thường gặp

| Triệu chứng | Nguyên nhân & cách sửa |
|---|---|
| Ảnh mới upload nhưng **không hiển thị** | `S3_PUBLIC_URL` sai. Phải là domain công khai (Bước 2), KHÔNG kèm tên bucket, KHÔNG `/` cuối. |
| Log `[storage:r2] Không truy cập được bucket` | Sai `S3_ACCESS_KEY/S3_SECRET_KEY/S3_BUCKET/S3_ENDPOINT`. Tạo lại token (Bước 3). |
| Lỗi ký/region khi upload | `S3_REGION` phải là `auto`. |
| Ảnh CŨ hỏng sau khi tắt MinIO | Chưa chạy bước 6b (đổi URL trong DB), hoặc `BUCKET`/`NEW_BASE` sai. |
| Một số ảnh cũ 404 dù đã migrate | Ảnh mồ côi — URL trỏ host không còn bytes (vd `localhost:9100` dev cũ). Đã chết từ trước, không cứu được. Xem ghi chú 6b. |
| URL ảnh có `/hdgroup/` ở giữa và 404 | Bạn để tên bucket trong `S3_PUBLIC_URL` — bỏ ra, domain công khai trỏ thẳng bucket root. |

---

## Phụ lục: Standard vs Infrequent Access

Khi tạo bucket có chọn **Default Storage Class**:

- **Standard** ($0.015/GB-tháng) — cho file **đọc ≥ 1 lần/tháng**. Có free tier 10GB. **Chọn cái này** cho CRM (ảnh khách xem thường xuyên).
- **Infrequent Access** ($0.01/GB-tháng) — cho file gần như không đọc lại (backup/lưu trữ). Lưu rẻ hơn nhưng **phạt phí khi đọc** + phí truy xuất + ràng buộc lưu tối thiểu 30 ngày. KHÔNG hợp ảnh chat.

Điểm chung của R2: **chuyển dữ liệu ra Internet (egress) miễn phí** — đây là lợi thế lớn nhất so với AWS S3.

---

## Tóm tắt nhanh

1. Tạo bucket R2 (Standard).
2. Bật public domain (r2.dev hoặc custom domain).
3. Tạo API Token → Access Key + Secret + Endpoint.
4. Điền 6 biến vào `.env` (`STORAGE_DRIVER=r2`, `S3_REGION=auto`...).
5. `docker compose up -d --force-recreate app` → test gửi ảnh.
6. (nếu có ảnh cũ) chạy 2 script migrate, kiểm tra, rồi tắt MinIO.

---

## Nhật ký migration thực tế (2026-06-20)

Bản ghi lần migrate đã chạy trên instance này, để tham chiếu:

| Thông số | Giá trị |
|---|---|
| Endpoint | `https://7240cfbbc9decde905802403e1f6051c.r2.cloudflarestorage.com` |
| Bucket R2 | `your-bucket` |
| Domain công khai | `https://files.your-domain.com` (custom domain, đã verify HTTP 200) |
| `STORAGE_DRIVER` | `r2` |

Các bước đã làm:
1. Cập nhật `.env` (driver=r2, endpoint/bucket/public/keys) + `docker compose build app`.
2. Test kết nối R2 (upload + read-back OK) + `curl` domain công khai (200).
3. **rclone copy** MinIO `zalocrm-attachments` → R2 `your-bucket`: **101 object, 18.4 MiB**.
4. **Backup DB** (`backup-truoc-migrate-r2-*.sql`) → dry-run → `CONFIRM=1` rewrite host-agnostic
   `NEW_BASE=https://files.your-domain.com`: **694 dòng** (8 media_blobs + 1 thumbnail + 684 content + 1 logo).
5. `docker compose up -d --force-recreate app` → app chạy, không lỗi storage, Zalo listener connected.
6. Verify: object thật trên R2 serve qua fileee2 = 200; ảnh gốc-fileee đang sống = 200.

**Còn lại / lưu ý:**
- Một phần URL cũ là `localhost:9100/...` (MinIO dev cũ) — ảnh mồ côi, đã chết từ trước, bytes không còn nguồn. Không ảnh hưởng ảnh đang sống.
- **MinIO vẫn đang chạy** nhưng DB không còn trỏ vào nữa. Khi đã yên tâm: `docker compose stop minio`, gỡ service `minio`/`minio-init` khỏi compose, xóa `MINIO_ROOT_*` khỏi `.env`, và gỡ Public Hostname `files.your-domain.com` khỏi Cloudflare Tunnel.
- Giữ file backup DB tới khi chắc chắn ổn.
