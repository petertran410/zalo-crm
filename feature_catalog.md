# 📋 Hi-CRM — Tổng Hợp Toàn Bộ Tính Năng Hệ Thống

> Tài liệu liệt kê **tất cả tính năng** của **25 module backend** + giao diện frontend tương ứng.
> Dựa trên phân tích mã nguồn thực tế (route files, services, types, views).

---

## 🏛️ MỤC LỤC TỔNG QUAN

| # | Module | Nhóm | Mô tả ngắn |
|---|--------|------|-------------|
| 1 | **Auth** | Nền tảng | Xác thực, đăng nhập, tổ chức, nhóm |
| 2 | **RBAC** | Nền tảng | Phân quyền chi tiết (Resource × Action matrix) |
| 3 | **Zalo** | Cốt lõi | Quản lý kết nối nick Zalo, đồng bộ bạn bè, nhóm |
| 4 | **Chat** | Cốt lõi | Hội thoại, tin nhắn, tệp đính kèm, thư mục |
| 5 | **Contacts** | Cốt lõi | Hồ sơ khách hàng, phễu sale, lịch hẹn, ghi chú |
| 6 | **AI** | Thông minh | Gợi ý tin nhắn AI, trích xuất thực thể |
| 7 | **Scoring** | Thông minh | Chấm điểm lead 4 chiều (E/I/F/V), auto-promote |
| 8 | **Engagement** | Thông minh | Heatmap tương tác, phân loại mẫu hành vi |
| 9 | **Tags** | Nghiệp vụ | Hệ thống nhãn CRM + đồng bộ nhãn Zalo |
| 10 | **Lists** | Marketing | Tệp khách hàng (paste/CSV/Lead Ads) |
| 11 | **Campaign** | Marketing | Chiến dịch gửi tin hàng loạt |
| 12 | **Media** | Tài nguyên | Kho phương tiện (ảnh/video/file), watermark |
| 13 | **Dashboard** | Báo cáo | Action Hub 3 tầng + KPI thời gian thực |
| 14 | **Analytics** | Báo cáo | Báo cáo tùy chỉnh, saved reports |
| 15 | **Activity** | Nhật ký | Timeline hoạt động khách hàng |
| 16 | **Integrations** | Tích hợp | Telegram Bridge, Google Sheets, Zapier |
| 17 | **System-Notifications** | Tự động hoá | Thông báo hệ thống qua Zalo, tạo user kèm nick |
| 18 | **Notifications** | Giao tiếp | Thông báo in-app cho người dùng |
| 19 | **Push** | Giao tiếp | Firebase Push Notification |
| 20 | **Privacy** | Bảo mật | Chế độ nick riêng tư, OTP, session, redact |
| 21 | **Search** | Tiện ích | Tìm kiếm toàn cục (KH, hội thoại, bạn bè) |
| 22 | **Branding** | Cài đặt | Tuỳ biến giao diện login (logo, slogan) |
| 23 | **Config** | Cài đặt | Cấu hình hệ thống |
| 24 | **Devices** | Cài đặt | Quản lý thiết bị đăng nhập |
| 25 | **API** | Mở rộng | Public API, Webhook, API Key |

---

## 1. 🔐 MODULE AUTH (Xác thực & Tổ chức)

**Files:** [auth-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/auth/auth-routes.ts), [auth-service.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/auth/auth-service.ts), [org-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/auth/org-routes.ts), [team-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/auth/team-routes.ts), [user-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/auth/user-routes.ts)

### 1.1 Xác thực (Authentication)
- ✅ **Đăng nhập** — Email/SĐT + mật khẩu, cấp JWT Access Token (15 phút) + Refresh Token (rotation)
- ✅ **Đăng xuất** — Revoke family refresh token, ghi audit log
- ✅ **Token Refresh** — Xoay refresh token → cấp access + refresh mới (chống reuse attack)
- ✅ **Setup lần đầu** — Tạo Organization + Owner user khi hệ thống chưa có dữ liệu
- ✅ **Kiểm tra trạng thái setup** — Check hệ thống đã được khởi tạo chưa
- ✅ **Lấy hồ sơ người dùng** — Profile hiện tại (kèm passwordChangedAt cho force change)
- ✅ **Bắt buộc đổi mật khẩu** — Force /setup-password lần đầu đăng nhập

### 1.2 Quản lý Tổ chức (Organization)
- ✅ **Xem thông tin tổ chức** — Tên, múi giờ, logo, slogan, copyright, email domain
- ✅ **Cập nhật thông tin tổ chức** — Đổi tên org, múi giờ (+HH:MM format)
- ✅ **Login branding** — Logo URL, slogan, copyright, email domain cho trang đăng nhập
- ✅ **System Notify Nick** — Chọn nick Zalo chuyên gửi thông báo hệ thống cho cả org
- ✅ **Cài đặt kỹ thuật automation** — 8 tham số vận hành (nhịp quét, timeout, ngưỡng kẹt...)

### 1.3 Quản lý Nhóm/Team
- ✅ **CRUD Team** — Tạo, sửa tên, xoá nhóm (gỡ thành viên trước khi xoá)
- ✅ **Danh sách thành viên** — Xem thành viên của nhóm
- ✅ **Gán/Gỡ thành viên** — Thêm/bỏ user khỏi team

### 1.4 Quản lý Người dùng (User Management)
- ✅ **Tạo user mới** — Với email, SĐT, tên, vai trò
- ✅ **Sửa thông tin user** — Tên, email, SĐT, vai trò, trạng thái active
- ✅ **Vô hiệu hoá/Kích hoạt user** — Toggle isActive
- ✅ **Reset mật khẩu user** — Admin reset mật khẩu cho NV
- ✅ **Onboarding** — Quy trình thiết lập lần đầu cho user mới
- ✅ **User Preferences** — Cài đặt cá nhân (ngôn ngữ, theme...)

### 1.5 Bảo mật & Kiểm toán
- ✅ **Security Audit Log** — Ghi nhật ký login, logout, refresh, password change, grant change
- ✅ **Refresh Token Rotation** — Chống tái sử dụng token (RefreshReuseError → revoke family)

---

## 2. 🛡️ MODULE RBAC (Phân Quyền)

**Files:** [permission-types.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/rbac/permission-types.ts), [department-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/rbac/department-routes.ts), [permission-group-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/rbac/permission-group-routes.ts), [user-assignment-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/rbac/user-assignment-routes.ts)

### 2.1 Ma trận Phân quyền (Permission Matrix)
- ✅ **18 Resources** — department, user, permission_group, settings, audit_log, contact, friend, conversation, customer_list, trigger, sequence, broadcast, block, care_session, zalo_account, media, webhook, engagement_score
- ✅ **5 Actions** — access, create, edit, delete, view_all
- ✅ **Resource-Action mapping** — Mỗi resource chỉ cho phép subset actions hợp lệ
- ✅ **Grants JSON** — Lưu dạng `{ resource: { action: boolean } }`
- ✅ **Sanitize grants** — Strip mọi key không nằm trong whitelist (chống injection)

### 2.2 Nhóm quyền mặc định (7 System Groups)
- ✅ **Admin** — Full mọi resource × mọi action
- ✅ **CEO** — Xem mọi resource business, không sửa permission/department/user
- ✅ **Trưởng phòng** — Full CRUD trong scope phòng ban + sub-depts
- ✅ **Sale Senior** — CRUD KH + Conversation, có quyền Xóa
- ✅ **Sale** — CR KH, không xoá Conversation
- ✅ **Marketing** — CRUD Broadcast/Sequence/Trigger/Block, view_all Contact
- ✅ **Hành chính - Nhân sự** — View-only User + report

### 2.3 Quản lý Phòng ban
- ✅ **CRUD Phòng ban** — Tạo, sửa, xoá phòng ban (cây phòng ban)
- ✅ **Phân cấp phòng ban** — Cấu trúc cây cha-con (dept tree)
- ✅ **Gán user vào phòng ban** — Gán vai trò (leader, deputy, member)
- ✅ **Owner Scope** — Scope dữ liệu theo cây phòng ban (dept-subtree)

### 2.4 RBAC Middleware
- ✅ **requireGrant()** — Middleware kiểm tra quyền trên route
- ✅ **getOwnerScope()** — Tính scope visible users cho từng role/dept

---

## 3. 💬 MODULE ZALO (Quản Lý Kết Nối Zalo)

**Files:** [zalo-pool.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/zalo/zalo-pool.ts) (56KB), [zalo-listener-factory.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/zalo/zalo-listener-factory.ts) (47KB), [zalo-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/zalo/zalo-routes.ts), + 35 file khác

### 3.1 Quản lý Nick Zalo
- ✅ **Kết nối nick** — Quét QR đăng nhập Zalo, lưu session/credential
- ✅ **Ngắt kết nối** — Disconnect nick Zalo
- ✅ **Xoá mềm nick** — Archive nick (giữ lịch sử, không gửi tin được)
- ✅ **Pool quản lý** — Quản lý nhiều nick đồng thời (multi-nick pool)
- ✅ **Tự động reconnect** — Kết nối lại khi mất kết nối
- ✅ **Health check** — Kiểm tra sức khỏe nick (connected/disconnected/banned)
- ✅ **Status log** — Ghi log trạng thái kết nối nick theo thời gian
- ✅ **Nick Metrics** — Thống kê gửi/nhận/quota per nick
- ✅ **SDK Rate Limiter** — Giới hạn tần suất gọi API Zalo (chống bị block)
- ✅ **SDK Limit Config** — Cấu hình giới hạn SDK per nick (settings UI)

### 3.2 Đồng bộ Bạn bè (Friend Sync)
- ✅ **Danh sách bạn bè** — Xem tất cả bạn bè Zalo của nick
- ✅ **Đồng bộ bạn bè** — Sync friend list từ Zalo → CRM (cron định kỳ)
- ✅ **Đồng bộ alias** — Sync tên hiển thị (alias) bạn bè
- ✅ **Friend Event Handler** — Xử lý sự kiện bạn bè mới, unfriend
- ✅ **Kết bạn Zalo** — Gửi lời mời kết bạn (friendshipAttempt)
- ✅ **Tìm Zalo theo SĐT** — Tra cứu tài khoản Zalo từ số điện thoại

### 3.3 Quản lý Nhóm Zalo (Group)
- ✅ **Danh sách nhóm** — Xem tất cả nhóm Zalo của nick
- ✅ **Quét thành viên nhóm** — Background scan members qua BullMQ worker
- ✅ **Đồng bộ thông tin nhóm** — Sync info nhóm (tên, avatar, số thành viên)
- ✅ **Kiểm duyệt nhóm** — Quản lý thành viên nhóm, kick/ban
- ✅ **Group Info Refresh** — Cron đồng bộ metadata nhóm định kỳ

### 3.4 Nhãn Zalo (Zalo Labels)
- ✅ **Đồng bộ nhãn Zalo** — Sync labels native từ SDK Zalo
- ✅ **Gán/Gỡ nhãn Zalo** — Thao tác labels trên bạn bè Zalo
- ✅ **Quản lý nhãn** — CRUD nhãn Zalo

### 3.5 Cổng Zalo (Zalo Access)
- ✅ **Phân quyền truy cập nick** — Middleware kiểm tra quyền sử dụng nick
- ✅ **Dashboard nick** — Thống kê chi tiết per nick (33KB route file)
- ✅ **Profile operations** — Đổi avatar, tên hiển thị nick Zalo
- ✅ **Proxy utility** — Hỗ trợ proxy cho kết nối Zalo
- ✅ **History backfill** — Đồng bộ lịch sử tin nhắn cũ
- ✅ **Message sync** — Đồng bộ tin nhắn Zalo ↔ CRM
- ✅ **Presence service** — Theo dõi trạng thái online/offline của nick

---

## 4. 💭 MODULE CHAT (Hội Thoại & Tin Nhắn)

**Files:** [chat-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/chat/chat-routes.ts) (130KB), [chat-operations-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/chat/chat-operations-routes.ts), [message-handler.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/chat/message-handler.ts) (50KB)

### 4.1 Quản lý Hội thoại (Conversation)
- ✅ **Danh sách hội thoại** — Phân trang, lọc theo nick/trạng thái/tag
- ✅ **Chi tiết hội thoại** — Xem thông tin conversation + contact liên kết
- ✅ **Gộp hội thoại** — Gộp nhiều conversation cùng 1 contact
- ✅ **Đánh dấu đã đọc/chưa đọc** — Toggle trạng thái unread
- ✅ **Đánh dấu đã trả lời** — Toggle isReplied
- ✅ **Xoá hội thoại** — Soft delete conversation
- ✅ **Conversation Resolver** — Tự động liên kết conversation → contact

### 4.2 Tin nhắn (Message)
- ✅ **Gửi tin nhắn text** — Gửi tin văn bản qua Zalo
- ✅ **Gửi ảnh** — Gửi ảnh (single/multi) qua Zalo
- ✅ **Gửi video** — Gửi video native (có player + thumbnail)
- ✅ **Gửi file** — Gửi tệp đính kèm (PDF, Excel, Word, ZIP...)
- ✅ **Gửi sticker** — Gửi nhãn dán Zalo
- ✅ **Gửi location** — Gửi vị trí
- ✅ **Gửi contact card** — Gửi danh thiếp
- ✅ **Reaction** — Thả/gỡ cảm xúc trên tin nhắn (echo cache chống loop)
- ✅ **Quote reply** — Trả lời trích dẫn tin nhắn
- ✅ **Thu hồi tin nhắn** — Recall tin đã gửi
- ✅ **Đọc lịch sử tin nhắn** — Phân trang, scroll backward
- ✅ **Tìm kiếm tin nhắn** — Tìm trong cuộc hội thoại
- ✅ **Message metadata** — Lưu sender info, sentVia, contentType

### 4.3 Đính kèm (Attachment)
- ✅ **Upload ảnh/file/video** — Multipart upload qua chat
- ✅ **Download media** — Tải ảnh/video/file từ Zalo về local
- ✅ **Chat media helpers** — Xử lý thumbnail, resize, convert

### 4.4 Thư mục & Nhãn tin nhắn (Folder & Preset)
- ✅ **CRUD Thư mục** — Tạo, sửa, xoá thư mục phân loại hội thoại
- ✅ **Gán conversation vào thư mục** — Di chuyển hội thoại giữa các folder
- ✅ **Tin nhắn mẫu (Preset)** — CRUD tin nhắn soạn sẵn để gửi nhanh

### 4.5 Chat Operations
- ✅ **Bulk operations** — Đánh dấu hàng loạt, gán hàng loạt
- ✅ **Chat helpers** — Tiện ích tạo message, lấy user full name

---

## 5. 👥 MODULE CONTACTS (Khách Hàng)

**Files:** [contact-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/contacts/contact-routes.ts) (137KB), [appointment-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/contacts/appointment-routes.ts), + 28 file khác

### 5.1 Hồ sơ Khách hàng (Contact Profile)
- ✅ **CRUD Contact** — Tạo, sửa, xoá khách hàng
- ✅ **Thông tin chi tiết** — Họ tên, SĐT, email, ngày sinh, giới tính, avatar, ghi chú
- ✅ **Liên kết Zalo** — Gắn contact với friend Zalo (nhiều nick)
- ✅ **Gán sale** — Phân bổ contact cho nhân viên (assignedUserId)
- ✅ **Danh sách KH** — Phân trang, lọc nâng cao (status, tag, score, source...)
- ✅ **Import/Export** — Nhập xuất danh sách KH

### 5.2 Phễu Sale (Pipeline/Status)
- ✅ **CRUD Trạng thái** — Tạo, sửa, xoá, sắp xếp thứ tự phễu
- ✅ **8 stages mặc định** — Mới → Tiếp cận → Hẹn gặp → Nóng → Tiềm năng → Chốt...
- ✅ **Chuyển trạng thái** — Kéo-thả hoặc chọn status mới
- ✅ **Terminal status** — Đánh dấu stage cuối (Chốt)
- ✅ **Status migration** — Migrate dữ liệu status cũ sang mới

### 5.3 Lịch hẹn (Appointment)
- ✅ **CRUD Lịch hẹn** — Tạo, sửa, hoàn thành, huỷ, dời lịch
- ✅ **Đánh dấu No-show** — KH không đến
- ✅ **Nhắc nhở lịch hẹn** — Gửi nhắc tự động qua Zalo trước lịch hẹn
- ✅ **Tóm tắt lịch hẹn ngày** — Digest hẹn hôm nay gửi qua Zalo lúc 7h sáng
- ✅ **Lịch hẹn công khai** — Public link chia sẻ lịch hẹn (cho KH xác nhận)
- ✅ **Tự động liên kết Zalo** — Parse lịch hẹn kèm gửi Zalo

### 5.4 Ghi chú (Notes)
- ✅ **CRUD Ghi chú** — Tạo, sửa, xoá ghi chú trên contact
- ✅ **Pinned notes** — Ghim ghi chú quan trọng lên đầu

### 5.5 Nhãn CRM (CRM Tags)
- ✅ **Gán/Gỡ nhãn** — Tag CRM trên contact (khác với nhãn Zalo)
- ✅ **Nhóm nhãn** — CRUD tag groups để phân loại tags
- ✅ **Contact Sub-resources** — Các tài nguyên phụ thuộc contact

### 5.6 Gộp & Tách KH (Merge/Split)
- ✅ **Phát hiện trùng lặp** — Tự động detect duplicate contacts (SĐT, tên...)
- ✅ **Gộp contact** — Merge nhiều contact thành 1 (gộp history, tags, notes)
- ✅ **Liên kết cha-con** — Link contact parent (contact_link_parent/unlink)
- ✅ **Parent candidate** — Gợi ý liên kết cha-con tự động

### 5.7 Cockpit & Intelligence
- ✅ **Cockpit view** — Dashboard tổng quan cho 1 contact (score, timeline, interaction)
- ✅ **Contact Intelligence** — Phân tích AI cho contact
- ✅ **Contact Aggregate** — Tổng hợp thống kê contact (bao nhiêu msg, reaction...)
- ✅ **Aggregate Display** — Hiển thị aggregated data trên UI

### 5.8 Đồng bộ & Cron
- ✅ **Profile Sync Cron** — Đồng bộ thông tin profile Zalo → contact định kỳ
- ✅ **Interaction Cron** — Tính toán chỉ số tương tác hàng ngày
- ✅ **Zalo Profile Capture** — Bắt thông tin profile Zalo khi có thay đổi
- ✅ **Conversation Consolidate** — Gộp hội thoại từ nhiều nick cùng 1 contact

### 5.9 ZInstant Proxy (EE)
- ✅ **ZInstant routes** — Proxy cho tính năng mở rộng (35KB)

---

## 6. 🤖 MODULE AI (Trí Tuệ Nhân Tạo)

**Files:** [ai-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/ai/ai-routes.ts) (26KB), [ai-service.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/ai/ai-service.ts) (31KB), [ai-virtual-chat-service.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/ai/ai-virtual-chat-service.ts)

### 6.1 Gợi ý tin nhắn AI
- ✅ **Gợi ý câu trả lời** — AI đọc ngữ cảnh hội thoại → suggest reply
- ✅ **Trích xuất thực thể** — Extract entities (tên, SĐT, ý định...) từ tin nhắn
- ✅ **Multi-provider** — Hỗ trợ Anthropic (Claude), OpenAI, Gemini, OpenAI-compatible
- ✅ **Prompt templates** — Hệ thống prompt tuỳ chỉnh cho từng tình huống
- ✅ **Virtual Chat Service** — AI chat ảo (bot tự động reply)

### 6.2 AI Capabilities & Security
- ✅ **Allowlist hành động** — AI chỉ được phép: read_conversation, generate_reply, extract_entities, save_ai_message, update_conversation_meta, create_suggestion, notify_internal
- ✅ **Dangerous Actions chặn** — KHÔNG cho AI: delete_contact, export_data_bulk, change_permission, mass_message, delete_conversation
- ✅ **AI Audit** — Ghi log mọi hành động AI (actorType='bot')
- ✅ **Appointment fallback parser** — Parse lịch hẹn từ text khi AI không trả về đúng schema

### 6.3 Provider Registry
- ✅ **Provider đăng ký** — Đăng ký/quản lý AI provider (API key, model)
- ✅ **List models** — Liệt kê models khả dụng từ mỗi provider
- ✅ **Schema validation** — Validate AI response schema

---

## 7. 📊 MODULE SCORING (Chấm Điểm Lead)

**Files:** [scoring-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/scoring/scoring-routes.ts) (25KB), [score-engine.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/scoring/score-engine.ts), [constants.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/scoring/constants.ts), + 12 file khác

### 7.1 Engine 4 chiều (E/I/F/V)
- ✅ **Engagement (35%)** — Tần suất tương tác KH (gửi tin, phản hồi nhanh, voice, react...)
- ✅ **Intent (30%)** — Ý định mua qua keyword (hỏi giá, thanh toán, tài liệu, pháp lý...)
- ✅ **Fit (15%)** — Phù hợp dự án (ngân sách, vị trí, loại hình, referral)
- ✅ **Velocity (20%)** — Đà tăng nhiệt (streak 3 ngày, trend tuần, chuỗi action)
- ✅ **Tunable weights** — Điều chỉnh trọng số từ Settings UI

### 7.2 Signal Rules (30+ rules)
- ✅ **Tín hiệu tích cực** — inbound_message (+3), fast_response (+5), voice/call (+8), ask_price (+15), appointment_book (+25), deposit (+50)...
- ✅ **Tín hiệu tiêu cực** — seen_zoned (-3), short_reply (-2), refuse_meeting (-10), ask_competitor (-8), slow_response_self (-5)
- ✅ **Cap per day / Cap total** — Giới hạn điểm cộng/trừ mỗi ngày hoặc tổng
- ✅ **Keyword detection** — Phát hiện ý định qua từ khoá trong tin nhắn

### 7.3 Stage Transition (Auto-Promote)
- ✅ **Auto-promote pipeline** — Tự chuyển stage khi đạt ngưỡng (Mới → Tiếp cận → Hẹn gặp → Nóng → Tiềm năng → Chốt)
- ✅ **Manual confirm** — Một số stage cần sale xác nhận thủ công
- ✅ **Criteria-based** — minEngagement, minIntent, requiresAction, minDaysInStage

### 7.4 Stuck Detection (Phát hiện đình trệ)
- ✅ **Ngưỡng per-stage** — Mới (7 ngày), Tiếp cận (14 ngày), Hẹn gặp (30 ngày), Nóng (21 ngày), Tiềm năng (14 ngày)
- ✅ **Extra decay** — Trừ điểm thêm mỗi ngày khi stuck
- ✅ **NBA (Next Best Action)** — Gợi ý hành động tiếp theo cho sale khi KH stuck

### 7.5 Decay & Cron
- ✅ **Score decay** — Tự trừ điểm theo thời gian không tương tác: -1/ngày (3-7d), -3/ngày (7-14d), -5/ngày (14-30d), -8/ngày (30-60d)
- ✅ **Decay cron** — Chạy hàng ngày (02:30 VN)
- ✅ **Backfill cron** — Bổ sung scoring cho contact cũ chưa tính

### 7.6 Auto-Tag & Signal Detector
- ✅ **Auto-tag** — Tự gắn tag dựa trên score/signal (hot lead, cold, stuck...)
- ✅ **Signal detector** — Phát hiện tín hiệu từ tin nhắn realtime
- ✅ **Scoring hooks** — Hook vào message-handler, appointment, status change

### 7.7 NBA Templates
- ✅ **7 templates mặc định** — Lời chào, video tour, video call, push ưu đãi, gọi điện, re-engage, push chốt
- ✅ **Template variables** — {{customerName}}, {{projectName}}, {{promoMonth}}...

---

## 8. 🔥 MODULE ENGAGEMENT (Tương Tác)

**Files:** [engagement-service.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/engagement/engagement-service.ts), [engagement-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/engagement/engagement-routes.ts), + 4 file khác

### 8.1 Heatmap Timeline (28 ngày)
- ✅ **Daily intensity** — Tính điểm tương tác hàng ngày (0-100) từ 9 loại tín hiệu
- ✅ **Incremental aggregate** — Fire-and-forget upsert mỗi tin nhắn/reaction
- ✅ **9 tín hiệu** — inboundMsg, outboundMsg, reaction, mediaShare, voiceMsg, call, missedCall, quoteReply, customerInitiated

### 8.2 Trọng số tương tác
- ✅ **Call × 35** — Cuộc gọi connected (KH gọi & nói chuyện thật)
- ✅ **Reaction × 30** — KH thả tim
- ✅ **VoiceMsg × 30** — Tin thoại ghi âm
- ✅ **QuoteReply × 25** — KH quote-reply có chủ ý
- ✅ **CustomerInitiated × 20** — KH chủ động nhắn trước (once/day)
- ✅ **MediaShare × 15** — Ảnh/video/file/sticker/location
- ✅ **MissedCall × 5** — KH gọi nhỡ (intent yếu)
- ✅ **Inbound/Outbound × 5** — Tin text thường

### 8.3 Pattern Classification (Phân loại mẫu hành vi)
- ✅ **hot** — Trend ≥+20% WoW, week 4 avg ≥40
- ✅ **champion** — Avg ≥75 across 28 days (consistent high)
- ✅ **stable** — Avg 25-74, low variance (std dev <15)
- ✅ **cooling** — Trend ≤-30% WoW
- ✅ **cold** — Avg <15 across 28 days
- ✅ **noise** — <5 total interactions in 28 days

### 8.4 Priority Score
- ✅ **Recompute priority** — Kết hợp engagement + lead score → priority score
- ✅ **Auto-tag engagement** — Gắn tag tự động theo pattern (hot/champion/cooling...)

### 8.5 Cron & Backfill
- ✅ **Daily cron 02:30** — Classify pattern + cleanup rows >84 ngày
- ✅ **Backfill** — Bổ sung dữ liệu engagement cho records cũ

---

## 9. 🏷️ MODULE TAGS (Nhãn)

**Files:** [tag-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/tags/tag-routes.ts), [tag-service.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/tags/tag-service.ts), [cung-cham-tag-service.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/tags/cung-cham-tag-service.ts)

- ✅ **CRUD Tag** — Tạo, sửa, xoá tag CRM
- ✅ **Tag taxonomy** — Hệ thống phân cấp tag (categories, groups)
- ✅ **Bulk tag** — Gán/gỡ tag hàng loạt
- ✅ **Cùng chăm tag** — Service quản lý tag hợp tác giữa các sale
- ✅ **Contact autotags** — Tự động đánh dấu dirty khi tag thay đổi → trigger auto-tag
- ✅ **Zalo label queue** — Hàng đợi đồng bộ nhãn Zalo native

---

## 10. 📋 MODULE LISTS (Tệp Khách Hàng)

**Files:** [list-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/lists/list-routes.ts) (30KB), [list-entry-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/lists/list-entry-routes.ts) (36KB), + 6 file khác

### 10.1 CRUD Tệp KH
- ✅ **Tạo tệp (Paste)** — Dán SĐT trực tiếp, tự parse + dedup
- ✅ **Tạo tệp (CSV/Excel)** — Import file, column mapping
- ✅ **Tạo tệp (Lead Ads)** — Tạo tệp trống gắn integration key (FB/TikTok/Zalo Ads)
- ✅ **Dry-run** — Preview parse stats trước khi lưu (no persist)
- ✅ **Archive/Unarchive** — Lưu trữ/khôi phục tệp
- ✅ **Hard delete** — Xoá vĩnh viễn tệp (cascade entries, KHÔNG cascade Contact)
- ✅ **Rename, icon, integration key** — Sửa tên, emoji, key tích hợp

### 10.2 Dedup & Enrichment
- ✅ **Dedup nội tệp** — Phát hiện SĐT trùng trong cùng tệp
- ✅ **Dedup chéo tệp** — Phát hiện SĐT đã có trong tệp khác
- ✅ **Dedup với CRM** — Phát hiện SĐT đã tồn tại trong Contact
- ✅ **Enrichment worker** — Background lookup Zalo cho từng SĐT
- ✅ **Rescan Zalo** — Trigger enrichment lại cho tệp đã xử lý

### 10.3 Multi-Source Lead Ads
- ✅ **Integration Key** — Key duy nhất per tệp để nhận lead từ webhook
- ✅ **Multi-platform** — FB Lead Ads, TikTok Lead Gen, Zalo Ads, Google Lead Form, Custom
- ✅ **Facebook Form Mapping** — Tự động tạo tệp từ Facebook Lead Form (🔒 khoá)
- ✅ **Lead notify** — Thông báo khi lead mới chảy vào
- ✅ **Shareable to Pool** — Chia sẻ tệp vào Lead Pool

### 10.4 System Messages
- ✅ **System messages per entry** — Lịch sử trạng thái (DUP_IN_LIST, INVALID, ENRICHED...)
- ✅ **Event handlers** — Hook vào sự kiện tệp thay đổi

---

## 11. 📢 MODULE CAMPAIGN (Chiến Dịch)

**Files:** [campaign-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/campaign/campaign-routes.ts), [campaign-service.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/campaign/campaign-service.ts)

- ✅ **Tạo chiến dịch** — Gửi tin hàng loạt đến danh sách KH
- ✅ **Campaign scheduling** — Lên lịch gửi
- ✅ **Campaign tracking** — Theo dõi tiến độ gửi (sent, delivered, failed)

---

## 12. 🖼️ MODULE MEDIA (Kho Phương Tiện)

**Files:** [media-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/media/media-routes.ts) (73KB), [media-service.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/media/media-service.ts) (25KB)

### 12.1 Quản lý Kho
- ✅ **Danh sách media** — Lọc theo kind (image/video/file), tag, folder, visibility, người upload, thời gian, kích thước
- ✅ **Sắp xếp** — Recent (lastUsed), Newest, Most Used, Name
- ✅ **Phân trang** — Skip/limit + tổng số total
- ✅ **Danh sách người upload** — Dropdown lọc theo sale tải lên

### 12.2 Upload & Lưu
- ✅ **Upload ảnh/video/file** — Multipart upload lên kho (MinIO S3)
- ✅ **Lưu từ chat** — "Lưu vào Media" từ bong bóng chat (single)
- ✅ **Lưu hàng loạt** — Lưu cả album / chọn nhiều tin nhắn (batch, max 30)
- ✅ **Dedup** — Phát hiện ảnh/file trùng (hash-based), không tốn thêm storage
- ✅ **Quét virus** — ClamAV scan file upload/save (fail-open mặc định)
- ✅ **Chặn file nguy hiểm** — Blacklist đuôi .exe, .bat, .cmd, .scr, .js, .jar...

### 12.3 Gửi từ Kho
- ✅ **Chèn vào chat** — Gửi ảnh/video/file từ kho vào 1 hội thoại
- ✅ **Video native** — Gửi video có player + thumbnail (không phải file đính kèm)
- ✅ **Auto-tag khi gửi** — Gắn tag vào ảnh khi gửi (chip gợi ý)
- ✅ **Usage tracking** — Đếm số lần sử dụng, lần dùng gần nhất

### 12.4 Watermark
- ✅ **Watermark per-ảnh** — Bật/tắt đóng dấu logo cho từng ảnh
- ✅ **Vị trí + Opacity** — Tuỳ chỉnh vị trí và độ mờ watermark
- ✅ **Variant watermarked** — Tạo bản có logo riêng (gửi đi dùng bản watermarked)
- ✅ **Disable watermark** — Tắt watermark (xoá variant)

### 12.5 Folder & Tag
- ✅ **CRUD Thư mục** — Tạo, sửa, xoá thư mục media
- ✅ **Gán tag media** — Gán/gỡ tag cho ảnh/file
- ✅ **Bulk operations** — Gán folder/tag hàng loạt (max 200 mục/lần)

### 12.6 Yêu thích & Thùng rác
- ✅ **Album yêu thích** — ⭐ đánh dấu ảnh yêu thích
- ✅ **Archive (Soft delete)** — Chuyển vào thùng rác
- ✅ **Thùng rác** — Giữ 30 ngày, cron tự dọn (media-trash-gc-cron)
- ✅ **Dọn sạch thủ công** — Empty trash (max 500/lần)

### 12.7 Privacy & Scope
- ✅ **Visibility** — private (chỉ chủ) / public (cả org)
- ✅ **Owner scope** — Sale chỉ thấy asset của mình + asset công khai
- ✅ **view_all** — Admin/marketing thấy toàn bộ kho
- ✅ **Nick Riêng tư** — Ảnh lưu từ nick private → mặc định private, cần xác nhận để chia sẻ
- ✅ **Media usage audit** — Log mọi thao tác (save, send, make_public)

---

## 13. 📈 MODULE DASHBOARD (Bảng Điều Khiển)

**Files:** [dashboard-action-hub-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/dashboard/dashboard-action-hub-routes.ts) (42KB), [dashboard-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/dashboard/dashboard-routes.ts), [report-analytics-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/dashboard/report-analytics-routes.ts) (55KB)

### 13.1 Action Hub — "Việc của tôi" (`/dashboard/me`)
- ✅ **KPI cá nhân** — Chưa rep, hẹn hôm nay, KH đình trệ, tổng KH, chốt tháng
- ✅ **Privacy split** — Mỗi KPI hiện `N +🔒M` (public + private nick)
- ✅ **Cần rep gấp** — Top 5 hội thoại unread mới nhất (có preview, redact nick riêng tư)
- ✅ **Lịch hẹn hôm nay** — Top 5 hẹn scheduled hôm nay
- ✅ **Nhắc nhở** — Hẹn quá hạn + hẹn ngày mai + 🎂 sinh nhật hôm nay
- ✅ **Phiên theo dõi** — CareSession: active, replied, paused, closedThisMonth
- ✅ **Điểm số KH** — Lead avg, engagement avg, priority high, histogram 3 bucket
- ✅ **Trạng thái KH** — Breakdown theo status
- ✅ **Tag phổ biến** — Top 5 tag CRM
- ✅ **Tương tác hôm nay** — Tin gửi, tin nhận, reply rate, bạn mới, lead mới
- ✅ **Quota nick** — Msg today + friend today per nick
- ✅ **View-as-X** — Trưởng phòng/admin xem dashboard cá nhân NV cấp dưới

### 13.2 Action Hub — "Quản lý team" (`/dashboard/team`)
- ✅ **Team KPI** — Tổng unreplied, hẹn, contacts, closed tuần team
- ✅ **Top performer** — NV chốt nhiều nhất tuần
- ✅ **Bảng per-user** — Từng NV: unreplied, hẹn, contacts, closed, private nick count
- ✅ **Phiên theo dõi team** — Active + replied across team
- ✅ **Hiệu suất phản hồi team** — Sent, replied, reply rate hôm nay
- ✅ **Lead Pool team** — Pending, claimed today, forgotten (>30 ngày)
- ✅ **Scope dept** — Lọc theo deptIds, admin chọn multi-dept

### 13.3 Action Hub — "Quản lý hệ thống" (`/dashboard/system`)
- ✅ **Nick health** — Healthy, overlimit, banned, offline, private, total
- ✅ **Department ranking** — New leads + closed tháng per phòng ban
- ✅ **Audit log gần đây** — Top 5 impersonate action hôm nay
- ✅ **Funnel tháng** — Contact count theo status (toàn org)

### 13.4 Reports Module (8 báo cáo)
- ✅ **Overview** — KPI tổng quan: contacts, nicks, msg, appt, funnel, topSales, riskNicks
- ✅ **Nick Fleet** — Chi tiết từng nick: status, uptime, msg, friend, SDK usage
- ✅ **Sales Performance** — Bảng xếp hạng sale: contacts, appt, closed, score, response time
- ✅ **Pipeline** — Phễu conversion: funnel bars, drop %, time in stage, close rate by source
- ✅ **Lead Pool** — KH chờ phân bổ: waiting, hold hours, return rate, by user, stuck
- ✅ **Automation** — Hiệu quả automation: sequences, broadcasts, care outcomes, skip reasons
- ✅ **Engagement** — Tương tác: pattern distribution, heatmap 28 ngày, customer initiated %
- ✅ **Audit** — Nhật ký bảo mật: login, grant change, data export...

### 13.5 Report Generation
- ✅ **Excel export** — Xuất báo cáo ra file Excel (exceljs)
- ✅ **Saved reports** — Lưu cấu hình báo cáo tuỳ chỉnh
- ✅ **Custom reports** — Báo cáo tuỳ chỉnh (query builder)
- ✅ **Date range filter** — Lọc theo khoảng thời gian

---

## 14. 📊 MODULE ANALYTICS (Phân Tích Nâng Cao)

**Files:** [analytics-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/analytics/analytics-routes.ts), [saved-report-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/analytics/saved-report-routes.ts)

- ✅ **Analytics overview** — Tổng quan phân tích
- ✅ **Saved reports CRUD** — Tạo, sửa, xoá báo cáo đã lưu
- ✅ **Report templates** — Conversion funnel, response time, team performance, custom report

---

## 15. 📝 MODULE ACTIVITY (Nhật Ký Hoạt Động)

**Files:** [timeline-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/activity/timeline-routes.ts), [activity-logger.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/activity/activity-logger.ts), [action-types.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/activity/action-types.ts)

### 15.1 Timeline KH
- ✅ **Activity Timeline** — Xem lịch sử hoạt động theo thời gian cho contact/friend
- ✅ **9 categories** — customer_info, tags_crm, tags_zalo, status_care, score, appointment, interaction, system, automation
- ✅ **Security events** — login_success, logout, refresh_rotate, password_change, grant_change

### 15.2 Action Types (40+ loại)
- ✅ **Customer info** — customer_create, customer_update, customer_rename, phone/birthday/gender change, assign
- ✅ **Tags** — tag_add/remove/replace CRM, tag_add/remove/change Zalo
- ✅ **Status** — status_change
- ✅ **Score** — score_change
- ✅ **Appointment** — create, update, complete, cancel, reschedule, no_show
- ✅ **Interaction** — first_inbound, first_outbound, silent_30d, call_logged, meeting_logged
- ✅ **System** — contact_link/unlink, merge/split, import/export
- ✅ **Automation** — bot_tag_auto, bot_score_calc, auto_tag_change
- ✅ **Lead Pool** — assign, auto_return, manual_return, bonus_grant, zalo_lookup

---

## 16. 🔗 MODULE INTEGRATIONS (Tích Hợp Bên Thứ 3)

**Files:** [integration-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/integrations/integration-routes.ts), [sync-engine.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/integrations/sync-engine.ts)

### 16.1 Telegram Bridge
- ✅ **Đồng bộ 2 chiều Zalo ↔ Telegram** — Mirror tin nhắn giữa nhóm Telegram và Zalo
- ✅ **Telegram Bot** — Quản lý bot Telegram cho bridge

### 16.2 Các tích hợp khác
- ✅ **Google Sheets** — Đồng bộ dữ liệu ra Google Sheets
- ✅ **Zapier Webhook** — Kết nối với Zapier qua webhook
- ✅ **Sync Engine** — Engine đồng bộ chung cho các provider

### 16.3 Meta Campaign Cache (shared)
- ✅ **Facebook/TikTok Lead Ads cache** — Cache mapping form → list để nhận lead nhanh

---

## 17. 📣 MODULE SYSTEM-NOTIFICATIONS (Thông Báo Hệ Thống)

**Files:** [system-notify-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/system-notifications/system-notify-routes.ts) (33KB), [system-notify-service.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/system-notifications/system-notify-service.ts), [user-create-with-zalo-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/system-notifications/user-create-with-zalo-routes.ts)

- ✅ **Gửi thông báo hệ thống qua Zalo** — Tự động gửi tin Zalo (welcome, reminder, alert...)
- ✅ **Welcome message builder** — Tạo tin chào mừng tự động
- ✅ **Tạo user kèm nick Zalo** — Tạo tài khoản CRM + kết nối nick Zalo trong 1 bước
- ✅ **Internal contact handshake** — Hook khi contact nội bộ được tạo

---

## 18. 🔔 MODULE NOTIFICATIONS (Thông Báo In-App)

**Files:** [notification-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/notifications/notification-routes.ts)

- ✅ **Danh sách thông báo** — Xem thông báo trong app
- ✅ **Đánh dấu đã đọc** — Mark as read

---

## 19. 📱 MODULE PUSH (Push Notification)

**Files:** [push-service.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/push/push-service.ts), [push-targets.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/push/push-targets.ts)

- ✅ **Firebase Push** — Gửi push notification qua Firebase Cloud Messaging
- ✅ **Push targets** — Quản lý device token của user (mobile/web)
- ✅ **Push khi có tin mới** — Notify user khi có tin nhắn mới từ Zalo

---

## 20. 🔒 MODULE PRIVACY (Quyền Riêng Tư)

**Files:** [privacy-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/privacy/privacy-routes.ts), [otp-service.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/privacy/otp-service.ts) (23KB), [redact.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/privacy/redact.ts), [session-service.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/privacy/session-service.ts)

- ✅ **Nick Riêng tư (Privacy Mode)** — main (riêng tư) vs sub (công khai)
- ✅ **OTP xác thực** — Gửi OTP qua Zalo để xác thực chủ nick riêng tư
- ✅ **Privacy Session** — Session đăng nhập nick riêng tư (có timeout)
- ✅ **Content Redact** — Ẩn nội dung tin nhắn nick riêng tư cho người ngoài (blur)
- ✅ **Privacy Leak Guard** — Phát hiện và chặn rò rỉ dữ liệu nick riêng tư

---

## 21. 🔍 MODULE SEARCH (Tìm Kiếm)

**Files:** [search-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/search/search-routes.ts)

- ✅ **Tìm kiếm toàn cục** — Tìm khách hàng, hội thoại, bạn bè từ 1 ô search
- ✅ **Multi-entity search** — Kết quả gộp từ Contact, Conversation, Friend

---

## 22. 🎨 MODULE BRANDING (Tuỳ Biến Giao Diện)

**Files:** [org-branding-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/branding/org-branding-routes.ts)

- ✅ **Logo trang login** — Upload/chọn logo hiển thị trên trang đăng nhập
- ✅ **Slogan & Copyright** — Tuỳ chỉnh text trên trang login
- ✅ **Email domain** — Cấu hình tên miền email công ty

---

## 23. ⚙️ MODULE CONFIG (Cấu Hình)

**Files:** [config-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/config/config-routes.ts)

- ✅ **Cấu hình hệ thống** — Đọc/ghi cấu hình runtime

---

## 24. 📲 MODULE DEVICES (Thiết Bị)

**Files:** [device-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/devices/device-routes.ts)

- ✅ **Đăng ký thiết bị** — Đăng ký device token (push notification)
- ✅ **Quản lý thiết bị** — Xem/xoá thiết bị đã đăng nhập

---

## 25. 🌐 MODULE API (Public API & Webhook)

**Files:** [public-api-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/api/public-api-routes.ts), [webhook-settings-routes.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/api/webhook-settings-routes.ts), [webhook-service.ts](file:///d:/Hi Sweetie/CRM anh Nhân/zalo-crm/backend/src/modules/api/webhook-service.ts)

- ✅ **Public API** — API công khai cho bên thứ 3 (tạo contact, gửi tin nhắn...)
- ✅ **API Key management** — Tạo/huỷ API key
- ✅ **Webhook settings** — Cấu hình webhook URL nhận sự kiện
- ✅ **Webhook service** — Gửi webhook khi có sự kiện (new message, new contact...)

---

## 🖥️ GIAO DIỆN FRONTEND (26 Views + 4 Sub-sections)

| View | Mô tả |
|------|-------|
| **LoginView** | Trang đăng nhập (branding tuỳ chỉnh) |
| **SetupView** | Thiết lập lần đầu (tạo org + owner) |
| **ForcePasswordChangeView** | Bắt buộc đổi mật khẩu lần đầu |
| **DashboardView** | Bảng điều khiển Action Hub 3 tầng (44KB) |
| **ChatView** | Màn hình chat chính (41KB) |
| **MobileChatView** | Chat responsive cho mobile |
| **ContactsView** | Danh sách + quản lý KH (154KB!) |
| **ContactProfileView** | Hồ sơ chi tiết 1 KH |
| **MobileContactView** | Contact responsive cho mobile |
| **CustomerActivityLogView** | Timeline hoạt động KH |
| **FriendsView** | Danh sách bạn bè Zalo |
| **ZaloAccountsView** | Quản lý nick Zalo (46KB) |
| **GroupsView** | Danh sách nhóm Zalo |
| **GroupScanView** | Quét thành viên nhóm |
| **AppointmentsView** | Quản lý lịch hẹn |
| **AppointmentActionView** | Thao tác trên 1 lịch hẹn |
| **MediaView** | Kho phương tiện (38KB) |
| **StuckLeadsView** | KH đình trệ / stuck leads |
| **ScoringSettingsView** | Cài đặt scoring engine |
| **IntegrationsView** | Quản lý tích hợp |
| **ProfileView** | Hồ sơ cá nhân user |
| **SettingsView** | Cài đặt hệ thống |
| **AnalyticsView** | Trang analytics |
| **ReportsView** | Trang báo cáo chính |
| **ApiSettingsView** | Cài đặt API/Webhook |

### Settings Sub-pages
| View | Mô tả |
|------|-------|
| **AiAssistantPage** | Cài đặt AI Assistant |
| **AppointmentSettingsPage** | Cài đặt lịch hẹn (nhắc nhở, digest) |
| **AuditLogView** | Nhật ký kiểm toán |
| **PersonalAccountPage** | Tài khoản cá nhân |
| **PersonalPasswordPage** | Đổi mật khẩu |
| **PersonalProfilePage** | Hồ sơ cá nhân |
| **RolesPage** | Quản lý vai trò |
| **SdkLimitsSettingsPage** | Giới hạn SDK Zalo |
| **SystemNotificationsPage** | Cài đặt thông báo hệ thống (71KB!) |
| **TagTaxonomyV2Page** | Quản lý hệ thống nhãn v2 |

### RBAC Sub-pages
| View | Mô tả |
|------|-------|
| **DepartmentsView** | Quản lý phòng ban |
| **PermissionGroupsView** | Quản lý nhóm quyền (ma trận) |
| **UsersRbacView** | Quản lý user + gán quyền |

### Marketing Sub-pages
| View | Mô tả |
|------|-------|
| **ListsView** | Danh sách tệp KH |
| **ListDetailView** | Chi tiết 1 tệp KH (81KB) |
| **CommunityMarketingShell** | Shell marketing cộng đồng |

### Reports Sub-pages
| View | Mô tả |
|------|-------|
| **OverviewReport** | Báo cáo tổng quan |
| **NickFleetReport** | Báo cáo đội nick |
| **SalesReport** | Báo cáo hiệu suất sale (38KB) |
| **PipelineReport** | Báo cáo phễu chuyển đổi |
| **EngagementReport** | Báo cáo tương tác |
| **AuditReport** | Báo cáo kiểm toán |

---

## 🔧 HẠ TẦNG & CROSS-CUTTING

| Thành phần | Mô tả |
|-----------|-------|
| **BullMQ Workers** | Group Scan Worker, List Enrichment Worker |
| **node-cron Jobs** | Friend sync, Group info sync, Engagement classify, Score decay, Interaction, Appointment digest/reminder, Contact profile sync, Media trash GC, Status log checkpoint |
| **Socket.IO** | Real-time push tin nhắn, trạng thái nick, thông báo |
| **MinIO S3** | Object storage cho ảnh/video/file |
| **Redis** | Queue (BullMQ) + Cache |
| **PostgreSQL** | Database chính (Prisma ORM) |
| **Firebase** | Push notification |

---

> **Tổng cộng: 25 module backend × ~200+ tính năng chi tiết**
