# report_khang — trạng thái tới 2026-08-11

Tổng hợp lại từ `git log origin/main..report_khang` (25 commit, từ `c111213` tới `db0c206`) và các
session Claude Code gần đây, vì `CLAUDE.md`/`claude_todo/` bị mất trên máy (cả hai đều gitignore) và
phải dựng lại. Đọc file này trước khi làm tiếp trên nhánh `report_khang`.

## Đã xong

**Kho lưu trữ (Media/Storage) — đợt lớn nhất, 5 commit 07/08 → 10/08:**
- Hạn mức mới: 10MB/tệp · 100MB/lượt · 25 tệp/lượt (route kho, KHÔNG đụng chat attachment — chat vẫn
  100MB ảnh / 500MB video).
- Bỏ ép ảnh sang WebP, bỏ downscale MAX_EDGE — giữ nguyên định dạng + kích thước gốc, chỉ nén trong
  cùng định dạng (JPEG q80 mozjpeg, WebP q80, PNG lossless).
- Thư mục lồng nhau (MediaAlbum.parentId, sâu tối đa 10 cấp), chặn trùng tên thư mục anh em (409
  FOLDER_NAME_TAKEN) thay vì đẻ bản sao dùng chung 1 thư mục đĩa.
- Nhận thêm SVG/ICO: SVG bắt buộc làm sạch qua DOMPurify+jsdom, fail-closed (lỗi thì KHÔNG lưu, không
  fallback lưu bản gốc như ảnh thường).
- Vá tên tệp tải về khớp nội dung thật (đuôi lấy theo mimeType thật, không theo tên tệp cũ).
- Dọn thư mục rỗng khi tải lên hỏng toàn bộ.
- Rút gọn chú thích trong các tệp đã đụng ở đợt này (xem "Cần làm tiếp" — chưa xong hết).

**RBAC — vá bảo mật + thu gọn vai trò (commit `7936be3`, 06/08):**
- Vá lỗ hổng leo thang quyền: user không còn tự sửa quyền chính mình hoặc cấp quyền mình không có.
- Bump `jwtTokenVersion` khi đổi role/isActive để hạ quyền có hiệu lực ngay (trước đó JWT cũ sống tới 15').
- `setup()` seed đủ 7 nhóm quyền cho org mới; script backfill cho org cũ.
- `customGrants` chuyển 3 trạng thái (cho phép/từ chối/kế thừa) thay vì chỉ đọc `true`.
- Còn 4 vai trò dùng thực tế: Admin, CEO, Sale, Chăm sóc khách hàng (nhóm mới). 4 nhóm cũ (Trưởng
  phòng, Sale Senior, Marketing, HC-NS) giữ code, ngừng seed cho org mới.
- 2 màn mới: So sánh nhóm quyền, Quyền theo người (lưới người × chức năng).

**Giao diện admin nav (commit `4944f10`, 05/08):**
- Vỏ nav 2 chế độ: ≥1440px thanh ngang, <1440px rail dọc + dải tiện ích. Bảng màu slate tối + indigo.
- `--smax-topnav-h` thành nguồn duy nhất cho chiều cao chrome (gỡ số cứng ở 13 file).
- SalesLayout không đụng — ghim biến CSS để chặn override rò từ DefaultLayout.

**Lịch hẹn (commit `6db9b02`, `51af1c9`, 05/08):**
- Revamp theo design "Rail": bỏ sidebar trái + chip lọc trùng lặp, bảng 7 cột → agenda view, popover
  chi tiết thay cột 380px cố định.
- Sửa hàng loạt bug: giờ tràn nửa đêm hiển thị sai, dò trùng giờ chạy trên tập đã lọc, FE không gửi
  `limit` nên tuần >50 lịch bị cắt âm thầm, dò trùng giờ O(n²) → tuyến tính.
- Quyền: sale chỉ CRUD lịch của chính mình (trừ owner/admin), chặn thật ở backend.
- Form nhanh tại ô giờ (AppointmentQuickCreate) + tách `use-contact-search` dùng chung.

**Merge POS + dọn hồi quy (commit `9f6d875`, `57ab9bd`, `e8a0112`, `83dd5af`, 31/07 → 01/08):**
- Merge `test_feature` (POS integration: sync tồn kho, webhook, order builder) vào `report_khang`.
- Sửa 5 hồi quy do merge im lặng gây ra: mất `--env-file` trong `package.json`, mất 8 dòng
  `app.register(...)` (kể cả route webhook/inbox Facebook), mất field `posSyncedAt` trong schema, thiếu
  `prisma generate`, thiếu cửa sổ worker BullMQ trong `run.bat`.
- Sửa `vite build` chết do prefetch trỏ `ContactsView`/`FriendsView` đã xoá (git không phát hiện được
  vì `PeopleView` không phải rename — 0 dòng chung).
- Khôi phục route `/fb-inbox` (bug có sẵn, object route thiếu dấu phẩy làm 2 route trùng key).
- `link-pos` giờ gắn `ContactAccess.collaborator` (trước thiếu, 2 sale liên kết cùng 1 KH thì người
  sau bị 403).

**Tab Khách hàng (commit `065bf06`, `3a424b9`, 31/07):**
- Gộp Bạn bè + Khách hàng thành PeopleView duy nhất tại `/contacts`.
- Xoá KH giờ chỉ owner (trước đây `contact.delete` grant làm được).
- Modal "Thêm khách hàng": ô SĐT thành tìm kiếm, bắt buộc chọn dòng khớp trước khi liên kết/tạo mới —
  tránh tạo bản ghi trùng với dữ liệu POS.
- Xoá `ContactProfileView.vue` stub (render mock, backend chưa từng implement).

**Khác:**
- Gửi tin offline: lưu `pending` + hàng đợi BullMQ gửi lại khi nick reconnect, thay vì trả lỗi 400 mất tin.
- Sửa `mcp-client.ts` đọc sai biến env → POS sandbox sync auth luôn rỗng.
- Chuẩn hoá CRLF cho `.bat`/`.cmd` trong `.gitattributes` (LF làm `run.bat` chạy sai lệnh).

## Cần làm tiếp

1. **Rút gọn chú thích — còn 11/23 tệp, 369 dòng.** `schema.prisma` chiếm 311 dòng (84%), là tài liệu
   cột DB, cố ý để riêng một đợt. 10 tệp còn lại chỉ ~58 dòng: `router/index.ts` (22),
   `MediaTabPanel.vue` (12), `permission-meta.ts` (7), `DefaultLayout.vue` (5), `storage/types.ts` (4),
   `MediaPickerPopover.vue` (3), 4 tệp còn lại 1-2 dòng mỗi tệp. `media-access.ts` và `minio-client.ts`
   chưa đụng tới ở đợt này.
2. **Kho lưu trữ chưa hỗ trợ video thật sự** — trần 10MB/tệp chỉ đủ vài giây quay điện thoại. Cần
   trần riêng cho `kind='video'` nếu muốn dùng được. Có `TODO(video)` marker sẵn tại chỗ đặt hạn mức.
3. **Chuyển chế độ nav ở mốc 1440px chưa verify bằng tay** — trình duyệt điều khiển qua CDP không bắn
   resize/ResizeObserver/matchMedia change khi ép đổi kích thước cửa sổ, nên chỉ verify được 2 chế độ
   tĩnh (1920/1440/960...), chưa verify được hành vi khi KÉO TAY qua mốc 1440px.
4. **`Trưởng phòng` role: `view_all` đang company-wide thay vì department-wide.** Nhóm này đang ngừng
   dùng (0 user) nên chưa gây hại, nhưng code chưa sửa — nếu ai bật lại nhóm này thì bug này sống lại.
5. **Test suite backend: baseline ~81 ca fail** do mock chưa cập nhật theo `tenantTransaction` — không
   phải lỗi do các commit trên gây ra, verify bằng cách so baseline (stash diff, chạy lại) chứ đừng cố
   sửa hết nếu không được yêu cầu.
6. **`contact:updated` socket event chưa có consumer ở FE** (toast "Sale X vừa sửa SĐT KH Y" trong thiết
   kế M55 chưa từng được build) — không phải bug khẩn, nhưng là rò rỉ tiềm ẩn nếu ai thêm listener mà
   quên kiểm tra payload có chứa dữ liệu nhạy cảm không.
7. **5 workspace stub (marketing, finance, director, warehouse, call-center) còn menu rỗng** — có TODO
   trong code (`frontend/src/workspaces/marketing/menu.ts`: "TODO: Thiết kế menu cho bộ phận Marketing").

## Ghi chú

- `CLAUDE.md` và `claude_todo/` đều nằm trong `.gitignore` — không commit, chỉ tồn tại local. Nếu máy
  khác/checkout mới không thấy 2 thứ này thì đó là bình thường, không phải ai đó xoá nhầm; dựng lại từ
  `git log` + các session trước (dùng `mcp__ccd_session_mgmt__search_session_transcripts` nếu cần soát
  lại quyết định cũ).
- `backend/prisma/create-sale-user.ts` có mật khẩu cứng `SaleTest123`, đã public trên remote — đúng quy
  ước seed script sẵn có (`AdminTest123` trong `seed.ts`), cố ý để vậy, không phải rò rỉ cần vá gấp.
- Nhánh `report_khang` hiện sạch, đã đồng bộ với `origin/report_khang`, không có stash treo.
- Session "Database technology" (10/08) là một nhánh việc khác hẳn — dựng thử CRM `ruoyi-vue-pro` dùng
  chung Postgres để tham khảo, KHÔNG đụng gì vào code repo này. Bỏ qua khi tìm hiểu lịch sử report_khang.
