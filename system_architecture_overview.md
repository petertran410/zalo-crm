# Hi-CRM (Zalo-CRM) - Tổng Quan Kiến Trúc Hệ Thống (System Architecture Overview)

Tài liệu này cung cấp cái nhìn toàn cảnh về kiến trúc hệ thống, cấu trúc thư mục, và các công nghệ cốt lõi đang được sử dụng trong dự án Hi-CRM.

---

## 1. Kiến Trúc Tổng Thể (Overall Architecture)

Hệ thống Hi-CRM được xây dựng dựa trên mô hình **Modular Monolith** (Monolith dạng mô-đun) kết hợp với kiến trúc **Event-Driven (Hướng sự kiện)** và mô hình **Open-Core**:

* **Modular Monolith:** 
  Toàn bộ Backend chạy trong một tiến trình server duy nhất (sử dụng Fastify). Tuy nhiên, thay vì phân tách mã nguồn theo kiểu Layered Architecture truyền thống (Controllers, Services, Repositories nằm ở các thư mục dùng chung riêng biệt), dự án phân rã mã nguồn theo **Nghiệp vụ / Thành phần (Vertical Slices / Components)**. Mỗi thư mục trong `backend/src/modules/` là một mô-đun tự quản lý (chứa Router, Services, Middlewares, và Utilities riêng biệt cho nghiệp vụ đó).
* **Event-Driven (Hướng sự kiện) & Real-time:**
  * Hệ thống sử dụng **Socket.IO** để đẩy các sự kiện từ Zalo (tin nhắn mới, thay đổi trạng thái cuộc gọi, sự kiện kết nối) trực tiếp đến giao diện Web client của nhân viên chăm sóc khách hàng (Sale).
  * Trong mã nguồn có các cơ chế truyền tin nội bộ như `bridge-bus` và `eventBuffer` để điều phối sự kiện bất đồng bộ mà không gây nghẽn luồng xử lý HTTP chính.
* **Open-Core Pattern:**
  File entrypoint `app.ts` triển khai một cơ chế nạp động gói mở rộng Enterprise Edition (`src/_ee/index.js`). Nếu có gói này, hệ thống sẽ tự nạp thêm các tính năng nâng cao (như Marketing Automation, Lead Pool, Facebook Leads) mà không cần can thiệp sâu vào nhân (core) mã nguồn.
* **Background Worker & Cron Jobs:**
  Hệ thống sử dụng các hàng đợi tác vụ (`BullMQ`) và công cụ lập lịch (`node-cron`) để xử lý các tác vụ nền tốn thời gian (như đồng bộ danh bạ định kỳ, quét thành viên nhóm Zalo, cập nhật chỉ số báo cáo ngày, decay lead scoring) độc lập với luồng xử lý Web Request chính.

---

## 2. Bản đồ Thư mục (Folder Mapping)

Cấu trúc mã nguồn cấp 1 và cấp 2 của dự án được tổ chức rõ ràng như sau:

```
zalo-crm/
├── docker/                   # Cấu hình container hóa cho môi trường phát triển & vận hành
├── backups/                  # Thư mục lưu trữ các bản sao lưu Database tự động hàng ngày
├── docs/                     # Tài liệu thiết kế hệ thống, tài liệu API công khai
├── scripts/                  # Các kịch bản tự động hóa (migration, seeding, DevOps)
├── backend/                  # Mã nguồn phía Máy chủ (API & Logic nghiệp vụ)
│   ├── prisma/               # Cấu trúc cơ sở dữ liệu (schema.prisma, migrations, seeds)
│   └── src/
│       ├── app.ts            # Entrypoint khởi tạo server Fastify & Socket.IO
│       ├── config/           # Nơi quản lý toàn bộ các biến môi trường và cấu hình hệ thống
│       ├── shared/           # Thư viện, tiện ích, cấu hình database và websocket dùng chung
│       └── modules/          # CHỨA LOGIC NGHIỆP VỤ CHÍNH (Chi tiết xem bên dưới)
└── frontend/                 # Mã nguồn phía Giao diện (Vue 3 Client SPA)
    ├── public/               # File tĩnh phục vụ trực tiếp cho trình duyệt (favicon, logo)
    └── src/
        ├── App.vue           # Component gốc của ứng dụng Vue
        ├── main.ts           # Entrypoint khởi tạo Vue App & mount các Plugins
        ├── api/              # Định nghĩa các hàm gọi HTTP request (Axios) trỏ về Backend
        ├── components/       # Các UI Components tái sử dụng (Button, Dialog, MessageCard...)
        ├── views/            # Giao diện chính của từng trang (Dashboard, Chat, Contacts, v.v.)
        ├── router/           # Cấu hình định tuyến trang (Vue Router)
        ├── stores/           # Quản lý trạng thái toàn cục tập trung (Pinia Store)
        ├── composables/      # Logic trạng thái tái sử dụng (Vue composables)
        ├── plugins/          # Khởi tạo thư viện bên thứ 3 (Vuetify, Vue-i18n)
        └── styles/           # Tùy biến CSS / SCSS cho giao diện
```

### Chi tiết phân bổ modules ở Backend (`backend/src/modules/`):
Mỗi module chịu trách nhiệm toàn bộ cho một vùng nghiệp vụ. Ví dụ:
* `auth`: Quản lý xác thực, đăng ký, đăng nhập, tổ chức (`Organization`), phòng ban (`Team`).
* `zalo`: Quản lý cổng kết nối Zalo, lưu trữ session đăng nhập (`credential`), đồng bộ thông tin bạn bè (`friend`), nhãn Zalo (`zaloLabels`).
* `chat`: Quản lý hội thoại (`Conversation`), tin nhắn (`Message`), tải/gửi tập tin đa phương tiện (`chat-attachment`), nhãn tin nhắn (`preset`).
* `contacts`: Quản lý hồ sơ khách hàng (`Contact`), trạng thái phễu (`Status`), lịch hẹn (`Appointment`), ghi chú (`Note`), thẻ CRM (`crmTag`).
* `ai`: Xử lý phân tích tin nhắn và đưa ra gợi ý hội thoại dựa trên mô hình AI (Claude/OpenAI).
* `integrations`: Nơi kết nối với các bên thứ 3, nổi bật là cầu nối mirror tin nhắn Zalo ↔ Telegram (`telegram-bridge`).
* `rbac`: Phân quyền người dùng dựa trên bộ phận và nhóm quyền (`rbac/department-routes.ts`, `rbac/permission-group-routes.ts`).

---

## 3. Công nghệ Cốt lõi (Core Technologies Stack)

Được trích xuất từ các file cấu hình `package.json` của cả 2 phía:

### Backend Stack
* **Runtime & Language:** Node.js (ES Module) + TypeScript.
* **Web Framework:** `Fastify` (Được chọn nhờ hiệu năng phản hồi vượt trội và tiêu tốn ít tài nguyên hơn Express).
* **Database ORM:** `Prisma` (kết nối với cơ sở dữ liệu `PostgreSQL`).
* **Real-time Protocol:** `Socket.IO` hỗ trợ giao tiếp hai chiều thời gian thực cực kỳ ổn định.
* **Background Worker & Queue:** `BullMQ` chạy trên nền `Redis` (`ioredis`) phục vụ hàng đợi chạy ngầm (ví dụ: quét thành viên nhóm Zalo).
* **Thư viện tích hợp cổng Zalo:** Thư viện `zca-js` (đóng vai trò như nhân Client kết nối Zalo).
* **Thư viện tích hợp Telegram:** `telegram` (thư viện Telegram API client chính thức).
* **Bảo mật:** JWT (`@fastify/jwt`), Bcryptjs dùng để băm mật khẩu.
* **Tác vụ khác:** `sharp` (xử lý hình ảnh), `exceljs` (đọc & xuất file báo cáo Excel), `node-cron` (lập lịch định kỳ).

### Frontend Stack
* **Framework:** `Vue 3` (Composition API) + Vite (công cụ build nhanh).
* **Language:** TypeScript.
* **UI Framework:** `Vuetify 3` (Cung cấp các component chuẩn Material Design, giao diện tối ưu responsive cực tốt) đi kèm bộ icon `@mdi/font` và `lucide-vue-next`.
* **State Management:** `Pinia` (thư viện quản lý state hiện đại của Vue, thay thế Vuex).
* **Rich-text Editor:** `TipTap` (trình soạn thảo tin nhắn đa tính năng có khả năng custom cao, phục vụ cho việc nhắc tên `@mention`, chèn biến hoặc dùng AI).
* **HTTP Client:** `Axios` để giao tiếp với các API của Fastify Backend.
* **Data Visualization:** `Chart.js` & `vue-chartjs` để kết xuất đồ thị trên các trang Báo cáo / Dashboard.
* **i18n:** `vue-i18n` hỗ trợ đa ngôn ngữ.

---

## 4. Sơ đồ Kiến trúc & Luồng Dữ liệu (System & Data Flow Diagram)

Dưới đây là sơ đồ chi tiết biểu diễn sự tương tác và luồng dữ liệu (data flow) từ giao diện Client (Vue 3) qua cổng API (Fastify), xuống cơ sở dữ liệu, các hàng đợi xử lý ngầm và kết nối ra ngoài các dịch vụ Zalo, Telegram, AI:

```mermaid
graph TD
    %% Định nghĩa phong cách
    classDef client fill:#e1f5fe,stroke:#01579b,stroke-width:2px;
    classDef backend fill:#efebe9,stroke:#3e2723,stroke-width:2px;
    classDef storage fill:#efe8e0,stroke:#e65100,stroke-width:2px;
    classDef external fill:#f1f8e9,stroke:#33691e,stroke-width:2px;
    classDef worker fill:#fff3e0,stroke:#ff6f00,stroke-width:2px;

    subgraph Client ["Giao diện Người dùng (Client - Vue 3 SPA)"]
        UI["UI (Vuetify Components)"]
        Pinia["Pinia Store (Lưu trữ State)"]
        Axios["Axios (API Client)"]
        WSClient["Socket.IO Client (Realtime)"]
        UI --> Pinia
        Pinia --> Axios
        WSClient --> UI
    end
    class Client,UI,Pinia,Axios,WSClient client;

    subgraph Server ["Máy chủ Backend (Fastify Monolith)"]
        App["Entrypoint (app.ts)"]
        Routes["Fastify Routes (API HTTP)"]
        WSServer["Socket.IO Server (Realtime Websocket)"]
        
        subgraph Modules ["Mô-đun Nghiệp Vụ (Vertical Slices)"]
            ChatMod["Chat Module (Tin nhắn, Hội thoại)"]
            ZaloMod["Zalo Module (Session, zca-js client)"]
            ContactMod["Contacts Module (Hồ sơ KH, Lịch hẹn)"]
            AIMod["AI Module (Gợi ý tin nhắn)"]
            IntegMod["Integrations Module (Telegram Bridge)"]
        end
        
        Prisma["Prisma Client (ORM DB)"]
        BullMQ["BullMQ Producer (Hàng đợi tác vụ)"]
    end
    class Server,App,Routes,WSServer,Modules,ChatMod,ZaloMod,ContactMod,AIMod,IntegMod,Prisma,BullMQ backend;

    subgraph DatabaseStorage ["Cơ sở Dữ liệu & Lưu trữ"]
        Postgres[(PostgreSQL DB)]
        Redis[(Redis Cache & Queue)]
        LocalStorage[(Local Storage / S3)]
    end
    class DatabaseStorage,Postgres,Redis,LocalStorage storage;

    subgraph Workers ["Tác vụ nền & Lập lịch"]
        ScanWorker["Group Scan Worker (Quét nhóm Zalo)"]
        EnrichWorker["List Enrichment Worker (Làm giàu dữ liệu)"]
        CronJobs["Cron Jobs (Báo cáo, Sync định kỳ)"]
    end
    class Workers,ScanWorker,EnrichWorker,CronJobs worker;

    subgraph External ["Dịch vụ Bên Ngoài"]
        ZaloPlatform["Zalo App / Zalo API"]
        TelegramPlatform["Telegram Bot API"]
        AILib["AI Provider (Claude / OpenAI)"]
        FirebasePlatform["Firebase Push Notification"]
    end
    class External,ZaloPlatform,TelegramPlatform,AILib,FirebasePlatform external;

    %% Giải thích luồng dữ liệu & tương tác
    Axios -- "1. Gửi HTTP Request" --> Routes
    Routes --> Modules
    
    WSClient <--> "2. Kết nối Websocket song hướng" <--> WSServer
    WSServer <--> Modules
    
    %% Tương tác với DB & Cache
    Modules --> Prisma
    Prisma --> Postgres
    
    %% Tương tác Queue
    Modules --> BullMQ
    BullMQ -- "3. Đẩy Job ngầm" --> Redis
    Redis -- "4. Kéo Job & Thực thi" --> Workers
    Workers --> Prisma
    
    %% Tương tác Storage
    Modules --> LocalStorage
    
    %% Kết nối bên ngoài
    ZaloMod <--> "5. Đồng bộ Session/Tin nhắn (zca-js)" <--> ZaloPlatform
    IntegMod <--> "6. Đồng bộ 2 chiều (Telegram Bridge)" <--> TelegramPlatform
    AIMod --> "7. Gửi prompt gợi ý" --> AILib
    Modules --> "8. Gửi Push Notification" --> FirebasePlatform

    %% Đồng bộ realtime từ Zalo/Telegram đến UI
    ZaloPlatform -- "Sự kiện Zalo mới" --> ZaloMod
    ZaloMod -- "Trigger sự kiện chat" --> ChatMod
    ChatMod -- "Đẩy sự kiện realtime" --> WSServer
    WSServer -- "Bắn socket event" --> WSClient
```

### Diễn giải luồng đi của dữ liệu (Data Flow) cụ thể:
1. **Luồng nghiệp vụ thông thường (HTTP Request):**
   * Người dùng thao tác trên màn hình Vue 3 → Pinia Store thay đổi → Kích hoạt các API gọi bằng Axios.
   * API đi qua Fastify Router tương ứng → đi vào Service xử lý của mô-đun nghiệp vụ cụ thể → sử dụng Prisma Client để đọc/ghi vào Database PostgreSQL.
2. **Luồng dữ liệu Realtime (Zalo/Telegram ↔ Client UI):**
   * Khi có tin nhắn mới từ Zalo hoặc Telegram → `ZaloPlatform` gửi webhook hoặc event qua kết nối của `zca-js` → `ZaloMod` nhận và phân tích sự kiện.
   * Sự kiện được đẩy sang `ChatMod` để lưu trữ tin nhắn vào PostgreSQL qua Prisma.
   * Đồng thời, `ChatMod` thông báo đến `Socket.IO Server` (`WSServer`) để phát (emit) sự kiện realtime đến trình duyệt người dùng (`WSClient`), cập nhật màn hình chat ngay lập tức không cần tải lại trang.
3. **Luồng xử lý ngầm (Asynchronous Jobs):**
   * Các tác vụ nặng như import tệp khách hàng lớn, quét nhóm Zalo hoặc phân tích dữ liệu hàng loạt không xử lý trực tiếp trên Web server để tránh timeout.
   * `Modules` đẩy các jobs vào hàng đợi `BullMQ` (được lưu tại `Redis`).
   * Các `Workers` chạy ngầm lắng nghe và kéo jobs từ Redis ra xử lý tuần tự, sau đó lưu kết quả vào PostgreSQL và phát sự kiện thông báo hoàn thành qua `Socket.IO`.

---

## 5. Sơ đồ Liên kết giữa các Module (Module Interaction Diagram)

Dưới đây là sơ đồ rút gọn và trực quan biểu diễn mối quan hệ phụ thuộc và tương tác chéo giữa các module nghiệp vụ chính trong thư mục `backend/src/modules/`:

```mermaid
graph LR
    %% Phong cách gọn gàng cho từng cụm
    classDef auth fill:#ffe0b2,stroke:#fb8c00,stroke-width:2px;
    classDef core fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;
    classDef ext fill:#f1f8e9,stroke:#7cb342,stroke-width:2px;
    classDef anal fill:#f3e5f5,stroke:#8e24aa,stroke-width:2px;

    %% Định nghĩa các Module
    subgraph AuthGroup ["1. Nền tảng Xác thực & Phân quyền"]
        Auth["Auth & RBAC Module<br/>(User, Org, Team, Permissions)"]
    end
    class AuthGroup,Auth auth;

    subgraph CoreCRM ["2. Nghiệp vụ cốt lõi (Core CRM)"]
        Zalo["Zalo Module<br/>(Quản lý kết nối, Sync friend/group)"]
        Chat["Chat Module<br/>(Hội thoại, Tin nhắn, Media)"]
        Contacts["Contacts Module<br/>(Hồ sơ KH, Lịch hẹn, Nhãn CRM)"]
    end
    class CoreCRM,Zalo,Chat,Contacts core;

    subgraph ExtGroup ["3. Tích hợp & Tiện ích thông minh"]
        AI["AI Module<br/>(Gợi ý câu trả lời tự động)"]
        Tele["Telegram Bridge<br/>(Đồng bộ Zalo ↔ Telegram)"]
        Scoring["Scoring Module<br/>(Chấm điểm hành vi/chuyển đổi)"]
    end
    class ExtGroup,AI,Tele,Scoring ext;

    subgraph AnalyticsGroup ["4. Thống kê & Báo cáo"]
        Dashboard["Dashboard & Analytics<br/>(KPI, Báo cáo phễu, Vận hành)"]
    end
    class AnalyticsGroup,Dashboard anal;

    %% Các mối quan hệ liên kết (Mô tả gọn gàng)
    Auth -. "Cung cấp Organization ID & Quyền hạn" .-> Zalo
    Auth -. "Cung cấp Organization ID & Quyền hạn" .-> Chat
    Auth -. "Cung cấp Organization ID & Quyền hạn" .-> Contacts

    Zalo <--> "Gửi/Nhận tin nhắn thời gian thực" <--> Chat
    Chat <--> "Liên kết hội thoại với hồ sơ" <--> Contacts
    Zalo -- "Đồng bộ bạn bè mới thành Khách hàng" --> Contacts

    Chat <--> "Yêu cầu AI phân tích & gợi ý" <--> AI
    Chat <--> "Đồng bộ tin nhắn 2 chiều" <--> Tele

    Chat -- "Tương tác chat của khách hàng" --> Scoring
    Contacts -- "Lịch hẹn / Thay đổi phễu sale" --> Scoring

    Zalo -- "Trạng thái kết nối nick Zalo" --> Dashboard
    Chat -- "Thống kê lượng tin nhắn gửi/nhận" --> Dashboard
    Contacts -- "Báo cáo chuyển đổi phễu & Lịch hẹn" --> Dashboard
```

### Diễn giải mối quan hệ liên kết:
1. **Nền tảng (`Auth & RBAC`):** Đóng vai trò làm ranh giới bảo mật đa doanh nghiệp (multi-tenancy) và phân quyền phòng ban. Mọi thực thể của Zalo Account, Khách hàng (Contacts), Hội thoại (Chat) đều phải gắn liền với Organization ID và được kiểm soát quyền đọc/ghi bởi module này.
2. **Trục nghiệp vụ cốt lõi (`Zalo` ↔ `Chat` ↔ `Contacts`):**
   * Đây là luồng làm việc chính: Tài khoản Zalo kết nối -> đồng bộ Bạn bè thành Khách hàng (`Contacts`) -> tạo phòng Chat (`Chat`).
   * Tin nhắn đi và đến được lưu trữ tại `Chat`, nhưng hồ sơ chi tiết, phân nhóm, lịch hẹn của chủ thể gửi tin được quản lý tại `Contacts`.
3. **Các module hỗ trợ nghiệp vụ:**
   * **AI** và **Telegram Bridge** hoạt động như các cổng plugin gắn vào `Chat` để nâng cao năng suất (tự động gợi ý tin nhắn, chuyển tiếp tin nhắn qua nhóm Telegram của team).
   * **Scoring** theo dõi hoạt động từ cả `Chat` (tần suất tương tác) và `Contacts` (đặt lịch hẹn thành công, cập nhật thông tin) để tự động tăng/giảm điểm tiềm năng của khách hàng.
4. **Đầu ra dữ liệu (`Dashboard & Analytics`):** Gom chỉ số từ cả 3 nguồn (Trạng thái kết nối của Zalo, Lượng tin nhắn của Chat, Tỷ lệ chuyển đổi phễu của Contacts) để xuất biểu đồ thống kê vận hành cho Admin/Owner.
