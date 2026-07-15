# Kế hoạch: Tầng Analytical CRM (Hi-CRM)

> Trạng thái: **Bản kế hoạch (đã duyệt)** — chưa triển khai code.
> Phiên bản hệ thống tham chiếu: v3.4.0
> Ngày lập: 2026-07-09
> Phạm vi: Thiết kế tầng phân tích khách hàng (Analytical CRM) chồng lên nền tảng Zalo chat/lead CRM hiện có, tích hợp dữ liệu thương mại từ POS nội bộ của công ty.

---

## Mục lục

1. [Bối cảnh & nguyên tắc kiến trúc](#1-bối-cảnh--nguyên-tắc-kiến-trúc)
2. [Kế hoạch con P0 — Mapping GeneratedID](#2-kế-hoạch-con-p0--mapping-generatedid)
3. [Schema mới (Prisma)](#3-schema-mới-prisma)
4. [Engines & công thức (heuristic)](#4-engines--công-thức-heuristic)
5. [POS Adapter (tích hợp dữ liệu thương mại)](#5-pos-adapter-tích-hợp-dữ-liệu-thương-mại)
6. [API endpoints](#6-api-endpoints)
7. [Frontend](#7-frontend)
8. [Bảng đánh giá 40 tính năng](#8-bảng-đánh-giá-40-tính-năng)
9. [Lộ trình triển khai](#9-lộ-trình-triển-khai)

---

## 1. Bối cảnh & nguyên tắc kiến trúc

### 1.1 Hiện trạng hệ thống

Hi-CRM là **Zalo-first chat/lead CRM** — kiến trúc Modular Monolith + Event-Driven + Open-Core:

- **Backend**: Fastify 5 + Prisma 7 + PostgreSQL 16 + Redis/BullMQ + Socket.IO. 25 module vertical-slice trong `backend/src/modules/`.
- **Frontend**: Vue 3 + Vuetify 4 + Pinia + Chart.js.
- **AI**: đa provider (Anthropic/OpenAI-compat/Gemini) qua `modules/ai/`, đã có task `reply_draft`, `summary`, `sentiment`, entity-extract.
- **Multi-tenant**: RLS qua `withTenant(orgId, fn)` / `runSystemQuery()`.
- **Open-Core**: bundle EE nạp động qua `backend/src/app.ts` → `./_ee/index.js` (`registerExtensionEarly` / `registerExtensionRoutes` / `startExtensionJobs`). Bản Community strip thư mục `_ee/`, mọi hook thành no-op.

### 1.2 Nền tảng dữ liệu đã có (tái dùng được)

| Nguồn | Mô tả | Dùng cho |
|---|---|---|
| `Contact` | `priorityScore`, `engagementScore/Pattern/Trend`, `leadScore`, `aggregateBreakdown`, `lastInbound/Outbound/InteractionAt`, `totalInbound/Outbound/Appointments`, `source`, `province/district/ward`, `firstContactDate`, `consentStatus`, `assignedUserId`, `phoneNormalized` | RFM, Health, Churn, Geo, CAC |
| `ContactEngagementDaily` | Chuỗi thời gian daily intensity (heatmap, giữ 84 ngày) | RFM, Cohort, Anomaly |
| `Friend.scoreBreakdown` | Điểm 4 chiều (Engagement/Intent/Fit/Velocity) + `stuckSince` | Opportunity, Churn |
| `DailyMessageStat` | `avgResponseTime`, sent/received per user×nick×ngày | SLA, Sales Effectiveness |
| `ActivityLog` | Audit trail, có `silent_30d` | Churn signal |
| `modules/ai` (sentiment) | LLM sentiment {label, confidence, reason} | Sentiment History, Complaint Cluster |
| `NbaTemplate` | Model Next Best Action đã tồn tại (chưa wire) | NBA engine |
| `Status` | Pipeline 8 bậc (Mới→…→Chốt/Thất bại/Mất), có `order` | Cohort, Funnel value |
| `SavedReport` + `executeCustomReport` | Report builder foundation | Extend analytics |

### 1.3 Nguyên tắc kiến trúc

1. **POS = system of record cho commerce; ZaloCRM = system of engagement.** Tầng analytical **join 2 nguồn** qua `generatedId`.
2. **Không gọi POS realtime trong hot path.** Adapter sync → cache vào bảng snapshot local → engines đọc snapshot. Tránh coupling uptime + latency của POS.
3. **Adapter pluggable.** `pos-adapter.ts` implement interface chung, cấu hình runtime qua `Integration.type='pos_api'`. Hỗ trợ 3 mode sync (pull-nightly / pull-on-demand / webhook-push) chọn qua config — không phụ thuộc việc cơ chế đồng bộ của hệ thống chính chưa xác định.
4. **EE/CE split.** Engine nặng (CLV predictive, churn, forecast, segmentation, lookalike, toàn bộ commerce) → `_ee/analytics-advanced/`. Metric nhẹ read-only (health, RFM proxy, SLA, channel, geo, cohort) → core `modules/analytics/`.
5. **Tái dùng hạ tầng sẵn có**: `withTenant`/RLS, `node-cron` (theo pattern `engagement-cron.ts`), BullMQ cho job nặng, Chart.js frontend, `ReportsShell` view pattern.
6. **Phương pháp dự đoán: Heuristic + composite weighted** (không dùng ML/Python microservice). Toàn bộ công thức chạy trong Node/SQL. Có thể nâng cấp regression sau khi tích đủ dữ liệu label.

---

## 2. Kế hoạch con P0 — Mapping GeneratedID

> **Đây là một dự án con độc lập.** Mục tiêu duy nhất: ZaloCRM có được `generatedId` để biết tổng quan khách hàng (nối sang POS). P0 là điều kiện chặn (blocker) cho toàn bộ nhóm tính năng commerce (P2+).

### 2.1 Vấn đề

Contact trong ZaloCRM hiện **chưa có khóa nối** sang POS. POS là nơi lưu data master của toàn công ty (đơn hàng, sản phẩm, giá vốn, chiết khấu, công nợ, ký gửi). WebCRM (bên thứ 3) và POS dự kiến dùng chung một **GeneratedID** chung; ZaloCRM cần tiêu thụ GeneratedID này.

### 2.2 Khóa vàng

`generatedId` = định danh chung xuyên POS ↔ WebCRM ↔ ZaloCRM cho cùng một con người / khách hàng.

### 2.3 Schema

```prisma
// Thêm vào model Contact
generatedId String? @map("generated_id")
// @@unique([orgId, generatedId])
// @@index([orgId, generatedId])

model ContactPosLink {
  id           String   @id @default(uuid())
  orgId        String   @map("org_id")
  contactId    String   @map("contact_id")
  generatedId  String   @map("generated_id")
  matchMethod  String   @map("match_method") // phone | manual | webcrm
  confidence   Float    @default(1.0)
  linkedAt     DateTime @default(now()) @map("linked_at")
  verifiedById String?  @map("verified_by_id")
  dismissed    Boolean  @default(false)

  org     Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  contact Contact      @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@unique([orgId, contactId, generatedId])
  @@index([orgId, generatedId])
  @@index([orgId, dismissed])
  @@map("contact_pos_links")
}
```

### 2.4 Cơ chế match (3 lớp)

1. **Phone-match tự động**: job/cron so `Contact.phoneNormalized` (đã chuẩn hóa 84xxx, có index) ↔ số điện thoại khách trong POS/WebCRM → điền `generatedId` + ghi `ContactPosLink(matchMethod='phone')`.
2. **Nhận GeneratedID từ WebCRM**: nếu WebCRM đã có mapping phone↔generatedId, ZaloCRM pull trực tiếp bảng mapping đó (`matchMethod='webcrm'`), không cần tự match.
3. **Gán tay (fallback)**: UI cho sale/admin gán `generatedId` khi phone trùng nhiều hoặc thiếu — theo pattern accept/dismiss của `ParentCandidate` đã có sẵn.

### 2.5 Xử lý parent-child

Một `generatedId` có thể ứng với nhiều Contact (parent-child cross-Zalo-identity, hoặc multi-nick). Nguyên tắc:
- Link ở mức **parent Contact** (`parentContactId IS NULL`).
- Contact con kế thừa commerce view từ parent (aggregate MAX/SUM tùy metric, tái dùng pattern `leadScore = MAX(Friend.leadScore)` hiện có).

### 2.6 Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Phone trùng giữa nhiều khách | Confidence thấp → đẩy sang hàng đợi gán tay, không auto-link |
| 1 người nhiều SĐT (phone2/3) | Match cả `phone2`, `phone3`, `phonesExtra` |
| Khách chưa có SĐT trong ZaloCRM | Không link được → hiển thị "chưa nối POS", chờ enrich SĐT |
| Đổi generatedId phía POS | `ContactPosLink` giữ lịch sử; resync ghi đè có audit |

### 2.7 Tiêu chí hoàn thành P0

- [ ] `Contact.generatedId` + `ContactPosLink` migration xong
- [ ] Resolver phone-match chạy được (cron + trigger thủ công)
- [ ] UI gán tay + màn hình "hàng đợi cần nối"
- [ ] ≥ X% Contact có SĐT được link tự động (đặt ngưỡng khi có dữ liệu thực)
- [ ] Endpoint `POST /api/v1/analytics/mapping/resolve` hoạt động

---

## 3. Schema mới (Prisma)

### 3.1 Core (bản CE cũng chạy được)

```prisma
model ContactStageHistory {         // cohort/retention — lịch sử chuyển pipeline
  id           String    @id @default(uuid())
  orgId        String    @map("org_id")
  contactId    String    @map("contact_id")
  statusId     String?   @map("status_id")
  enteredAt    DateTime  @map("entered_at")
  exitedAt     DateTime? @map("exited_at")
  durationDays Int?      @map("duration_days")
  @@index([orgId, contactId, enteredAt])
  @@index([orgId, statusId])
  @@map("contact_stage_history")
}

model CustomerMetricSnapshot {      // CLV/RFM/churn/health tính theo cron đêm
  id               String   @id @default(uuid())
  orgId            String   @map("org_id")
  contactId        String   @map("contact_id")
  computedAt       DateTime @default(now()) @map("computed_at")
  clvHistorical    Float?   @map("clv_historical")
  clvPredicted     Float?   @map("clv_predicted")
  rfmR             Int?     @map("rfm_r")
  rfmF             Int?     @map("rfm_f")
  rfmM             Int?     @map("rfm_m")
  rfmSegment       String?  @map("rfm_segment")
  churnRisk        Int?     @map("churn_risk")        // 0-100
  healthScore      Int?     @map("health_score")      // 0-100
  opportunityScore Int?     @map("opportunity_score")
  winbackScore     Int?     @map("winback_score")
  metricsJson      Json     @default("{}") @map("metrics_json")
  @@unique([orgId, contactId])
  @@index([orgId, rfmSegment])
  @@index([orgId, churnRisk])
  @@map("customer_metric_snapshots")
}

model SentimentHistory {            // trend cảm xúc theo thời gian
  id         String   @id @default(uuid())
  orgId      String   @map("org_id")
  contactId  String   @map("contact_id")
  messageId  String?  @map("message_id")
  label      String                              // positive | neutral | negative
  confidence Float
  at         DateTime @default(now())
  @@index([orgId, contactId, at])
  @@map("sentiment_history")
}

model SourceSpend {                 // input cho CAC (nhập tay)
  id          String   @id @default(uuid())
  orgId       String   @map("org_id")
  source      String                              // FB | TT | GT | CN | ...
  periodMonth String   @map("period_month")       // YYYY-MM
  amount      Float
  createdAt   DateTime @default(now()) @map("created_at")
  @@unique([orgId, source, periodMonth])
  @@map("source_spend")
}

model AnalyticsSegment {
  id        String   @id @default(uuid())
  orgId     String   @map("org_id")
  name      String
  type      String                                // rfm | clv | geo | custom
  ruleJson  Json     @default("{}") @map("rule_json")
  isDynamic Boolean  @default(true) @map("is_dynamic")
  createdAt DateTime @default(now()) @map("created_at")
  members   SegmentMember[]
  @@unique([orgId, name])
  @@map("analytics_segments")
}

model SegmentMember {
  id        String   @id @default(uuid())
  segmentId String   @map("segment_id")
  contactId String   @map("contact_id")
  addedAt   DateTime @default(now()) @map("added_at")
  addedBy   String   @default("rule")            // rule | manual
  segment   AnalyticsSegment @relation(fields: [segmentId], references: [id], onDelete: Cascade)
  @@unique([segmentId, contactId])
  @@index([contactId])
  @@map("segment_members")
}
```

Cộng với P0: `ContactPosLink` + `Contact.generatedId` (mục 2.3).

### 3.2 EE (`_ee/analytics-advanced/` — merge schema)

```prisma
model CustomerCommerceSnapshot {    // cache data POS, engines đọc từ đây
  id             String   @id @default(uuid())
  orgId          String   @map("org_id")
  contactId      String   @map("contact_id")
  generatedId    String   @map("generated_id")
  totalRevenue   Float    @default(0) @map("total_revenue")
  orderCount     Int      @default(0) @map("order_count")
  firstOrderAt   DateTime? @map("first_order_at")
  lastOrderAt    DateTime? @map("last_order_at")
  avgOrderValue  Float    @default(0) @map("avg_order_value")
  totalCogs      Float    @default(0) @map("total_cogs")       // giá vốn
  totalDiscount  Float    @default(0) @map("total_discount")
  grossMargin    Float    @default(0) @map("gross_margin")
  debtBalance    Float    @default(0) @map("debt_balance")     // công nợ
  depositAssets  Float    @default(0) @map("deposit_assets")   // ký gửi
  productMixJson Json     @default("{}") @map("product_mix_json")
  refillCycleDays Int?    @map("refill_cycle_days")
  syncedAt       DateTime @default(now()) @map("synced_at")
  @@unique([orgId, contactId])
  @@index([orgId, generatedId])
  @@map("customer_commerce_snapshots")
}

model PosSyncCursor {
  id            String   @id @default(uuid())
  orgId         String   @map("org_id")
  integrationId String   @map("integration_id")
  lastCursor    String?  @map("last_cursor")
  lastSyncAt    DateTime? @map("last_sync_at")
  mode          String   @default("pull_nightly")  // pull_nightly | pull_on_demand | webhook_push
  @@unique([orgId, integrationId])
  @@map("pos_sync_cursors")
}

model CampaignExposure {           // uplift / campaign effectiveness
  id              String   @id @default(uuid())
  orgId           String   @map("org_id")
  campaignId      String   @map("campaign_id")
  contactId       String   @map("contact_id")
  exposedAt       DateTime @map("exposed_at")
  converted       Boolean  @default(false)
  conversionValue Float?   @map("conversion_value")
  @@index([orgId, campaignId])
  @@index([orgId, contactId])
  @@map("campaign_exposures")
}

model ForecastSnapshot {
  id        String   @id @default(uuid())
  orgId     String   @map("org_id")
  dimension String                              // region | segment
  dimKey    String   @map("dim_key")
  period    String                              // YYYY-MM hoặc YYYY-Www
  metric    String                              // revenue | demand | conversion
  predicted Float
  actual    Float?
  model     String   @default("holt_winters_lite")
  createdAt DateTime @default(now()) @map("created_at")
  @@index([orgId, dimension, period])
  @@map("forecast_snapshots")
}
```

---

## 4. Engines & công thức (heuristic)

> Tất cả composite weighted, chạy trong Node/SQL. Không ML/Python.

| Engine | Công thức tóm tắt |
|---|---|
| **Health Score** (0-100) | `0.35×engagementScore + 0.25×leadScore_norm + 0.20×recencyScore + 0.20×sentimentScore`. recency = hàm decay từ `lastInboundAt`; sentiment = EMA của `SentimentHistory` |
| **RFM** | R = quantile số ngày kể từ `lastOrderAt` (POS) hoặc `lastInboundAt` (proxy khi chưa link); F = `orderCount`; M = `totalRevenue`. Chia quintile 1-5 → 125 cell → map 11 segment chuẩn (Champions, Loyal, Potential Loyalist, At-Risk, Hibernating, Lost…) |
| **CLV historical** | `Σ revenue` từ POS (đọc `CustomerCommerceSnapshot.totalRevenue`) |
| **CLV predictive** | `avgOrderValue × predictedFreq × predictedLifespan`; freq/lifespan suy từ RFM + engagement trend (BG/NBD-lite heuristic) |
| **Churn Risk** (0-100) | weighted: `engagementPattern∈{cooling,cold}` + số ngày `silent` + `engagementTrend<0` + RFM recency thấp + POS recency + sentiment giảm |
| **Customer Health** | xem Health Score |
| **Opportunity Score** | mở rộng `priorityScore` + `(1 − wallet coverage proxy)` + intent signal |
| **Cross-sell/Upsell** | product gap = danh mục segment mua vs KH này chưa mua (market-basket từ `productMixJson`) |
| **Win-back** | dormant × (từng đạt `Chốt` hoặc có POS order history) × sentiment lịch sử |
| **Cohort Retention** | group theo tháng `firstContactDate` → % còn active mỗi tháng sau (active = có inbound hoặc order); nguồn: `ContactStageHistory` + `CustomerCommerceSnapshot` |
| **Sales Effectiveness** | per `assignedUserId`: retention KH + Δscore + conversion + POS revenue attribution + `avgResponseTime` |
| **Territory Load Balance** | count KH / `assignedUserId` × `province` → phát hiện quá tải / dư địa |
| **Forecast** | time-series (`ForecastSnapshot`): moving-average + seasonal index (Holt-Winters lite thuần JS) |
| **Complaint Clustering** | LLM (AI provider sẵn có) gán topic từ msg sentiment negative → gom nhóm |
| **Intent Analytics** | log intent label từ AI Reply → thống kê top intent |
| **Channel Preference** | phân bổ theo `Conversation.threadType/tab` + `Message.sentVia` |
| **SLA/Response** | đọc trực tiếp `DailyMessageStat.avgResponseTime` |

---

## 5. POS Adapter (tích hợp dữ liệu thương mại)

### 5.1 Interface

```ts
// _ee/analytics-advanced/adapters/pos-adapter.ts
interface PosAdapter {
  fetchCustomerCommerce(generatedId: string): Promise<CommerceData>;
  fetchOrdersSince(cursor: string | null): Promise<Order[]>;   // pull mode
  handleWebhook(payload: unknown): Promise<Order[]>;           // push mode
}
```

### 5.2 Cấu hình

Lưu trong `Integration.config` (type mới `'pos_api'`): `baseUrl`, `apiKey`, `syncMode`, `fieldMapping` (map field POS → `CustomerCommerceSnapshot`).

### 5.3 Ba mode sync (chọn runtime)

| Mode | Mô tả | Khi dùng |
|---|---|---|
| `pull_nightly` | Cron đêm kéo orders theo cursor → upsert snapshot | Mặc định, ít coupling |
| `pull_on_demand` | Kéo khi mở hồ sơ KH (cache TTL) | Cần data mới tức thời |
| `webhook_push` | POS bắn khi có đơn mới | Khi POS hỗ trợ webhook |

Vì cơ chế đồng bộ của hệ thống chính chưa xác định → build cả 3, bật theo config, không chặn tiến độ.

### 5.4 Cron

`_ee/analytics-advanced/jobs/analytics-cron.ts` chạy **03:00 VN** (sau `engagement-cron` 02:30 VN):
1. Pull orders (nếu mode pull) → upsert `CustomerCommerceSnapshot`
2. Recompute `CustomerMetricSnapshot` (CLV/RFM/churn/health…)
3. Refresh dynamic `AnalyticsSegment`
4. Circuit breaker + ghi `SyncLog` (model đã có) để audit

---

## 6. API endpoints

Prefix `/api/v1/analytics/*`. RBAC: mở rộng `permission-types.ts` — thêm resource `analytics` (`access`, `view_all`). Sale member không có `view_all` bị gate 403 như report hiện tại.

### Core (CE)
- `GET /health-scores`
- `GET /rfm`
- `GET /cohort-retention`
- `GET /channel-preference`
- `GET /sla`
- `GET /geographic`
- `GET /sales-effectiveness`
- `GET /territory-load`
- `GET /segments`, `POST /segments`, `PUT /segments/:id`, `DELETE /segments/:id`
- `POST /mapping/resolve` (P0 — chạy resolver phone-match)
- `GET /mapping/pending` (P0 — hàng đợi cần gán tay)

### EE (`_ee/analytics-advanced/routes/`)
- `GET /clv`
- `GET /churn-risk`
- `GET /opportunity`
- `GET /cross-sell`
- `GET /win-back`
- `GET /forecast`
- `GET /campaign-uplift`
- `GET /commerce/:contactId`
- `POST /pos/sync`

---

## 7. Frontend

- Thêm view mới trong `frontend/src/views/reports/` theo pattern `ReportsShell.vue`:
  - `CustomerValueReport.vue` (CLV + RFM heatmap)
  - `ChurnRiskReport.vue`
  - `SegmentManager.vue`
  - `ForecastReport.vue`
  - `SalesEffectivenessReport.vue`
  - `CohortRetentionChart.vue`
- Dùng **Chart.js** (đã có trong stack).
- Panel commerce trong `components/chat/ChatContactPanel.vue`: hiện CLV / đơn hàng / công nợ khi mở hồ sơ KH đã link `generatedId`.
- Màn hình P0 mapping: hàng đợi "khách chưa nối POS" + gán tay (pattern accept/dismiss của ParentCandidate).

---

## 8. Bảng đánh giá 40 tính năng

**Ký hiệu**: ✅ Sẵn data · 🟡 Cần POS · 🟠 Cần cơ chế thu thập mới · ❌ Thiếu điều kiện (chỉ ghi doc — xem `NOT-IMPLEMENTED.md`)

### A. Giá trị & Lợi nhuận khách hàng
| Tính năng | Trạng thái | Điều kiện |
|---|---|---|
| CLV (historical) | 🟡 | POS trả order history theo `generatedId` |
| CLV (predictive) | 🟡 | Historical CLV + heuristic RFM × engagement trend |
| CAC & CLV:CAC | 🟠 | Cần bảng `SourceSpend` (nhập tay) — POS không có chi phí marketing |
| Cost-to-Serve | 🟡 | POS (doanh thu, giá vốn) − chi phí phục vụ (proxy msg count × unit-cost) |
| Share of Wallet | ❌ | Thiếu data thị phần ngành/khảo sát → `NOT-IMPLEMENTED.md` |
| Margin/Discount Erosion | 🟡 | POS trả giá vốn + chiết khấu (đã xác nhận có) |
| Opportunity Score | ✅ | Mở rộng `priorityScore` + intent |

### B. Hành vi & Mẫu hình mua hàng
| Tính năng | Trạng thái | Điều kiện |
|---|---|---|
| RFM | 🟡 | R/F sẵn có; M (Monetary) từ POS. Chưa link → M dùng proxy engagement |
| Refill Cycle | 🟡 | Order timestamps từ POS |
| Product Recommendation | 🟡 | POS product/order lines → market-basket |
| Seasonality Detection | 🟡 | POS order theo thời gian/khu vực |
| Price Sensitivity/Elasticity | ❌ | Cần lịch sử biến động giá × lượng mua → `NOT-IMPLEMENTED.md` |
| Order Anomaly Detection | 🟡 | POS orders → z-score/IQR trên tần suất + giá trị |
| Channel Preference | ✅ | `Conversation.threadType/tab`, `Message.sentVia` |
| Cohort Retention | ✅ | `firstContactDate` + `ContactStageHistory` (mới) |

### C. Dự đoán rủi ro
| Tính năng | Trạng thái | Điều kiện |
|---|---|---|
| Churn Prediction | ✅ | Heuristic: engagement + silent + trend + POS recency |
| Customer Health Score | ✅ | Composite engagement + lead + sentiment + recency |
| Debt/Deposit Asset Risk | 🟡 | POS expose công nợ + ký gửi (đã xác nhận có) |
| Credit/Payment Risk Scoring | 🟡 | POS payment history (đã xác nhận có) |
| Fraud/Anomaly Detection | 🟡 | POS transaction data (đã xác nhận có) |

### D. Phân khúc & Nhắm mục tiêu
| Tính năng | Trạng thái | Điều kiện |
|---|---|---|
| Segmentation (RFM/CLV/loại) | ✅🟡 | Rule engine trên score + POS value tier |
| Geographic/Territory | ✅ | `province/district/ward` có index |
| Lookalike Modeling | ✅ | Feature vector từ Contact profile → similarity |

### E. Tương tác & Cảm xúc
| Tính năng | Trạng thái | Điều kiện |
|---|---|---|
| Chat Sentiment Analysis | ✅ | AI sentiment đã có + `SentimentHistory` (mới) → trend |
| Complaint Topic Clustering | ✅ | LLM extract topic → cluster |
| Response Time/SLA Analytics | ✅ | `DailyMessageStat.avgResponseTime` |
| Intent Classification Analytics | ✅ | Log intent label từ AI Reply |
| NPS/Satisfaction Tracking | 🟠 | Cần module survey mini (gửi qua Zalo/broadcast) |

### F. Tăng trưởng & Cơ hội
| Tính năng | Trạng thái | Điều kiện |
|---|---|---|
| Next Best Action | ✅ | `NbaTemplate` đã có → wire engine |
| Cross-sell/Upsell Scoring | 🟡 | POS product mix → gap analysis |
| Win-back Scoring | ✅🟡 | Dormant + POS "từng mua" tăng trọng số |
| Referral/Advocacy Tracking | 🟠 | Cần cơ chế ghi nhận nguồn giới thiệu (ref-code) |
| Campaign/Promotion Effectiveness | 🟡 | `AutomationCampaign` + `CampaignExposure` + POS conversion → uplift |

### G. Dự báo & Lập kế hoạch
| Tính năng | Trạng thái | Điều kiện |
|---|---|---|
| Demand Forecasting | 🟡 | POS order theo khu vực/thời gian → time-series |
| Revenue Forecasting theo segment | 🟡 | POS revenue × segment |

### H. Hiệu suất Sales/Khu vực
| Tính năng | Trạng thái | Điều kiện |
|---|---|---|
| Sales Rep Effectiveness Score | ✅🟡 | Retention/growth KH + POS revenue attribution |
| Territory/Portfolio Load Balance | ✅ | Count KH/`assignedUserId` × province |

**Tổng kết**: ✅ 14 sẵn sàng · 🟡 15 cần POS (đa số mở khóa vì POS là data master) · 🟠 4 cần thu thập mới · ❌ 2 chỉ ghi doc.

---

## 9. Lộ trình triển khai

| Phase | Nội dung | Phụ thuộc |
|---|---|---|
| **P0 — Mapping GeneratedID** | `Contact.generatedId` + `ContactPosLink` + resolver phone-match + UI gán tay. *Dự án con độc lập, chặn nhóm commerce.* | — |
| **P1 — Core (không cần POS)** | Health Score, RFM proxy, Cohort Retention, Channel Preference, SLA, Geographic, Sales Effectiveness, Territory Load, SentimentHistory, Segments. Schema core + cron. | — |
| **P2 — POS Adapter + Commerce** | Adapter 3-mode + `CustomerCommerceSnapshot` sync → CLV historical, RFM (M thật), Cost-to-Serve, Margin Erosion, Order Anomaly, Debt/Deposit/Credit Risk, Fraud. | P0 |
| **P3 — Predictive heuristic** | Churn Prediction, CLV predictive, Opportunity/Cross-sell/Upsell, Win-back, Segmentation engine, Lookalike, NBA wired. | P1, P2 |
| **P4 — Forecast + AI + Collect** | Demand/Revenue Forecasting, Complaint Clustering, Intent Analytics, Campaign Uplift, Product Rec, Seasonality + module NPS survey + Referral tracking. | P2, P3 |

Mỗi phase sẽ được xác nhận với chủ dự án trước khi bắt tay code (schema fields cụ thể, endpoint, cron schedule, engine formula được review từng bước).
