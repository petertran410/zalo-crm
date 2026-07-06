# 🌉 Hướng dẫn cấu hình Telegram Bridge (Cầu Zalo ↔ Telegram)

> Tài liệu kỹ thuật cho **devops / quản trị server**: cấu hình cầu chat 2 chiều Zalo ↔ Telegram
> từ env + sinh session, tới bật cầu cho từng nick.
> Bản dành cho **người dùng** (quản trị CRM, thao tác UI) xem ở
> [user-guide/07i-telegram-bridge.md](user-guide/07i-telegram-bridge.md).
>
> **Cập nhật:** 2026-06-20.

---

## 0. Cầu Telegram là gì

Cho phép **sale đọc & trả lời chat khách Zalo ngay trong Telegram**. Mỗi nick Zalo được cấp **1 group Telegram riêng** (bật forum/topics), **mỗi hội thoại khách = 1 topic**. Tin mirror **2 chiều**:

- **Zalo → Telegram**: khách nhắn vào nick → tin hiện trong topic tương ứng (kèm nhãn người gửi + giờ; media tải từ R2/đĩa lên Telegram).
- **Telegram → Zalo**: sale gõ trong topic → khách Zalo nhận (qua pool Zalo sẵn có). Hiện hỗ trợ **text** (media Telegram→Zalo là phase sau).

### 2 "tài khoản Telegram" cần phân biệt

| Thành phần | Dùng để | Lấy từ |
|---|---|---|
| **Bot** (`TELEGRAM_BRIDGE_BOT_TOKEN`) | Đăng tin vào group + đọc tin sale gõ | @BotFather |
| **Tài khoản provisioner** (`TELEGRAM_PROVISIONER_*`) | **Tạo group** + bật topics + thêm bot làm admin (Bot API không tạo group được) | tài khoản Telegram công ty (MTProto) |

---

## 1. Biến môi trường

```bash
# Bot — bắt buộc để bật cầu ở mức hệ thống
TELEGRAM_BRIDGE_BOT_TOKEN=<token từ @BotFather>
TELEGRAM_BRIDGE_BOT_USERNAME=<username bot, KHÔNG dấu @>

# Provisioner — cần để TỰ TẠO group cho nick
TELEGRAM_PROVISIONER_API_ID=<api_id số>
TELEGRAM_PROVISIONER_API_HASH=<api_hash>
TELEGRAM_PROVISIONER_SESSION=<chuỗi session sinh ở Mục 4>
```

> Chỉ có **bot token** → cầu bật ở mức hệ thống nhưng chưa tự tạo group được (nút "Bật cầu" trong UI bị khóa). Cần đủ cả 3 biến `TELEGRAM_PROVISIONER_*` để provision nick.

---

## 2. Tạo Bot Telegram (@BotFather)

1. Mở Telegram, chat với **@BotFather** → gửi `/newbot`.
2. Đặt **tên** + **username** (username phải kết thúc bằng `bot`, vd `hs_crm_bridge_bot`).
3. BotFather trả về **token** dạng `8637568596:AAH...`.
4. Điền: `TELEGRAM_BRIDGE_BOT_TOKEN=<token>`, `TELEGRAM_BRIDGE_BOT_USERNAME=<username không @>`.

---

## 3. Lấy API ID + API Hash (my.telegram.org)

Cần cho tài khoản provisioner (MTProto). Xem ảnh từng bước trong
[user-guide/07i-telegram-bridge.md](user-guide/07i-telegram-bridge.md) — tóm tắt:

1. Vào [my.telegram.org](https://my.telegram.org) → đăng nhập bằng **số điện thoại** tài khoản công ty (nhập mã xác nhận Telegram gửi).
2. Chọn **API development tools** → tạo app (App title/Short name tuỳ ý, vd `zalocrmbridge`).
3. Ghi lại **App api_id** (số) + **App api_hash** (chuỗi) → điền `TELEGRAM_PROVISIONER_API_ID` / `TELEGRAM_PROVISIONER_API_HASH`.

---

## 4. Sinh `TELEGRAM_PROVISIONER_SESSION`

Session = chuỗi đăng nhập sẵn của tài khoản provisioner (để CRM thao tác thay tài khoản đó). Sinh **1 lần** bằng [backend/scripts/tg-provisioner-login.mjs](../backend/scripts/tg-provisioner-login.mjs), chạy **trong container app** (có GramJS). Luồng **2 bước có OTP**:

> ⚠️ Số điện thoại provisioner phải đang **đăng nhập 1 phiên Telegram** ở đâu đó để nhận OTP. Nên dùng tài khoản **chuyên dụng cho CRM**, không phải Telegram cá nhân.

**Bước 1 — gửi OTP:**
```bash
cd /root/0project/hicrm
set -a; . ./.env; set +a   # nạp API_ID/API_HASH từ .env
docker compose exec -T \
  -e API_ID="$TELEGRAM_PROVISIONER_API_ID" \
  -e API_HASH="$TELEGRAM_PROVISIONER_API_HASH" \
  -e PHONE="+84xxxxxxxxx" \
  app node /app/scripts/tg-provisioner-login.mjs
```
→ In ra `SESSION=...` và `PHONE_CODE_HASH=...`, và **gửi OTP** vào app Telegram của số đó.

**Bước 2 — nhập OTP** (dùng `SESSION` + `PHONE_CODE_HASH` từ Bước 1):
```bash
docker compose exec -T \
  -e API_ID="$TELEGRAM_PROVISIONER_API_ID" \
  -e API_HASH="$TELEGRAM_PROVISIONER_API_HASH" \
  -e PHONE="+84xxxxxxxxx" \
  -e SESSION="<SESSION từ Bước 1>" \
  -e PHONE_CODE_HASH="<PHONE_CODE_HASH từ Bước 1>" \
  -e CODE="<mã OTP>" \
  -e PASSWORD="<mật khẩu 2FA — nếu tài khoản bật bảo mật 2 lớp>" \
  app node /app/scripts/tg-provisioner-login.mjs
```
→ In ra `FINAL_SESSION=...`.

> 💡 Nếu tài khoản bật **2FA**, Bước 2 sẽ báo `Tài khoản bật mật khẩu 2FA` nếu thiếu `PASSWORD` — chạy lại kèm `-e PASSWORD=...` (làm nhanh trong thời hạn OTP; nếu báo mã hết hạn thì làm lại Bước 1).

**Lưu kết quả:**
```bash
TELEGRAM_PROVISIONER_SESSION=<FINAL_SESSION>
```

---

## 5. Restart + kiểm tra

```bash
cd /root/0project/hicrm
docker compose up -d --force-recreate app
docker compose logs app | grep -i telegram-bridge
```

Log kỳ vọng khi cấu hình đúng:
```
[telegram-bridge] receiver BẬT — long-poll getUpdates (chiều ra).
[telegram-bridge] BẬT — đang lắng nghe message.persisted + nhận chiều ra.
```
Nếu thấy `chưa cấu hình TELEGRAM_BRIDGE_BOT_TOKEN → cầu TẮT` → chưa có bot token.

---

## 6. Bật cầu cho từng nick

### Cách A — UI (khuyên dùng)
Trang **quản lý nick** → click 1 nick → drawer → section **"Cầu Telegram"** → nút **"Bật cầu Telegram"**. Cần quyền `settings:edit`. Xem [user-guide/07i-telegram-bridge.md](user-guide/07i-telegram-bridge.md).

### Cách B — API
```bash
# Bật cầu (tự tạo group + thêm bot admin) cho 1 nick:
POST /api/v1/telegram-bridge/provision/:zaloAccountId      # cần grant settings:edit
# Sale lấy mã liên kết (gõ /link <mã> cho bot trong Telegram):
POST /api/v1/telegram-bridge/link-code
# Trạng thái cầu của 1 nick:
GET  /api/v1/telegram-bridge/:zaloAccountId/status
```
`status` trả: `botConfigured`, `provisionerConfigured`, `enabled`, `telegramChatId`.

---

## 7. Xử lý sự cố

| Triệu chứng | Nguyên nhân & cách sửa |
|---|---|
| Nút "Bật cầu" bị khóa, ghi "chưa cấu hình bot" | Thiếu `TELEGRAM_BRIDGE_BOT_TOKEN`. |
| Nút "Bật cầu" bị khóa, ghi "chưa cấu hình provisioner" | Thiếu `TELEGRAM_PROVISIONER_*` (đặc biệt SESSION). |
| Nút "Bật cầu" bị khóa, ghi "cần quyền settings:edit" | Tài khoản không có grant `settings:edit`. |
| Bước 2 báo `Tài khoản bật mật khẩu 2FA` | Chạy lại kèm `-e PASSWORD=<mật khẩu 2FA>`. |
| Bước 2 báo mã hết hạn (PHONE_CODE_EXPIRED) | OTP quá hạn → làm lại Bước 1 lấy mã mới. |
| Provision lỗi tạo group / thêm bot | Tài khoản provisioner bị giới hạn tạo group, hoặc bot username sai. Kiểm tra `TELEGRAM_BRIDGE_BOT_USERNAME`. |

---

## 8. Vận hành & bảo mật

- `TELEGRAM_PROVISIONER_SESSION` = **toàn quyền** tài khoản Telegram đó → giữ bí mật như mật khẩu (đã gitignore trong `.env`).
- Session bị revoke (đăng xuất phiên trên Telegram) → cầu tạo group lỗi → **sinh lại session** theo Mục 4.
- Telegram giới hạn số group 1 tài khoản tạo/ngày → provision nhiều nick nên giãn nhịp.
- Hiện **1 bot + 1 provisioner / triển khai**. Bot phải được phép thêm vào group (mặc định OK).

---

## Tóm tắt nhanh

1. Tạo bot @BotFather → `TELEGRAM_BRIDGE_BOT_TOKEN` + `_USERNAME`.
2. my.telegram.org → `API_ID` + `API_HASH`.
3. Chạy `tg-provisioner-login.mjs` (2 bước OTP, +2FA) → `TELEGRAM_PROVISIONER_SESSION`.
4. Điền .env → `docker compose up -d --force-recreate app` → log "BẬT".
5. UI: trang quản lý nick → "Bật cầu Telegram" cho từng nick → sale `/link`.
