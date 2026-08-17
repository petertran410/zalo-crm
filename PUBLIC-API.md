# Hisweetie POS — Public API

API tích hợp dữ liệu POS dành cho đối tác (website, sàn thương mại điện tử, CRM…).

Thiết kế bám theo tài liệu **KiotViet Public API** để đối tác đã quen KiotViet
tái sử dụng được client sẵn có.

| | |
|---|---|
| Base URL | `https://<domain>/api/public/v1` |
| Xác thực | OAuth 2.0 `client_credentials` |
| Giới hạn | **5000 request/giờ** cho mỗi client |
| Đọc | 26 resource |
| Ghi | `customers`, `products`, `categories`, `orders`, `invoices` |
| Định dạng | JSON, UTF-8 |

Khác biệt có chủ đích so với KiotViet:

| | KiotViet | Hisweetie POS |
|---|---|---|
| Header `Retailer` | bắt buộc | **không cần** (hệ thống dùng một cơ sở dữ liệu) |
| `Idempotency-Key` | không có | **có** — chống tạo trùng khi gửi lại |
| Xoá dữ liệu | có | **không** — chỉ ngừng hoạt động hoặc huỷ |

---

## Mục lục

1. [Lấy access token](#1-lấy-access-token)
2. [Quy ước chung](#2-quy-ước-chung)
3. [Đọc dữ liệu](#3-đọc-dữ-liệu)
4. [Đồng bộ tăng dần](#4-đồng-bộ-tăng-dần)
5. [Endpoint bổ trợ](#5-endpoint-bổ-trợ)
6. [Ghi dữ liệu](#6-ghi-dữ-liệu)
7. [Idempotency-Key](#7-idempotency-key)
8. [Webhook](#8-webhook)
9. [Mã lỗi](#9-mã-lỗi)
10. [Dữ liệu không được trả ra](#10-dữ-liệu-không-được-trả-ra)
11. [Quản lý client](#11-quản-lý-client)
12. [Tra cứu nhanh](#12-tra-cứu-nhanh)

---

## 1. Lấy access token

```bash
curl -X POST https://<domain>/api/public/v1/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=<CLIENT_ID>" \
  -d "client_secret=<CLIENT_SECRET>"
```

Chấp nhận cả `application/json`:

```bash
curl -X POST https://<domain>/api/public/v1/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "client_credentials",
    "client_id": "<CLIENT_ID>",
    "client_secret": "<CLIENT_SECRET>"
  }'
```

Phản hồi — **HTTP 201**:

```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "public_api.read"
}
```

> **Lưu ý:** endpoint này trả **201** chứ không phải 200. Một số thư viện OAuth
> kiểm tra cứng status 200 sẽ báo lỗi — hãy chấp nhận cả 200 và 201.

Mọi request sau đó gắn header:

```
Authorization: Bearer <access_token>
```

### Thời hạn token

`expires_in` tính bằng giây, **cấu hình riêng cho từng client**, mặc định `3600`
(1 giờ), giới hạn trong khoảng **300 – 86400** (5 phút đến 24 giờ).

Luôn đọc `expires_in` từ phản hồi thay vì giả định 3600. Nên lấy token mới khi
gần hết hạn, không gọi lại trước từng request.

### Về `scope`

Trường `scope` hiện được **trả lại đúng giá trị client gửi lên**, mặc định
`public_api.read`. Hệ thống **chưa dùng scope để phân quyền** — quyền truy cập
xác định bởi trạng thái client, không bởi scope.

### Thu hồi quyền

Khi quản trị viên tắt hoặc xoay khoá một client, **token đã cấp mất hiệu lực
ngay lập tức** ở request kế tiếp, không cần chờ hết hạn.

---

## 2. Quy ước chung

### Phân trang

| Tham số | Mặc định | Giới hạn |
|---|---|---|
| `pageSize` | 20 | 1 – 100 |
| `currentItem` | 0 | ≥ 0 (offset, không phải số trang) |

Trang thứ n (đếm từ 1): `currentItem = (n - 1) × pageSize`.

### Kiểu dữ liệu

- **Thời gian**: chuỗi ISO 8601 kèm múi giờ, ví dụ `2026-08-14T10:00:00.000Z`.
- **Số lớn** (`kiotVietId`…): trả dưới dạng **chuỗi** để không mất độ chính xác.
- **Số thập phân** (tiền, số lượng): trả dưới dạng số.

### Tham số dạng danh sách

`branchIds`, `customerIds`, `types` nhận nhiều giá trị phân tách bằng dấu phẩy:

```
?branchIds=1,2,5
```

### Trường lạ bị từ chối

Hệ thống bật kiểm tra nghiêm ngặt. Gửi thừa một trường không có trong đặc tả sẽ
nhận **400**, kèm tên trường vi phạm. Hãy gửi đúng những trường được mô tả.

---

## 3. Đọc dữ liệu

```
GET /{resource}
GET /{resource}/{id}
```

### Danh sách resource

| Nhóm | Resource |
|---|---|
| Hàng hoá | `products`, `categories`, `trademarks`, `inventories`, `price-books` |
| Khách hàng | `customers`, `customer-groups`, `customer-types` |
| Bán hàng | `orders`, `invoices`, `return-orders`, `consignments`, `sale-channels` |
| Mua hàng | `suppliers`, `supplier-groups`, `purchase-orders`, `order-suppliers`, `supplier-returns` |
| Kho | `transfers` |
| Tài chính | `cashflows`, `bank-accounts`, `surchages` |
| Hệ thống | `branches`, `users`, `locations`, `settings` |

> `surchages` (thiếu chữ *r*) giữ đúng chính tả của KiotViet để client cũ gọi được.

### Tham số truy vấn

| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `lastModifiedFrom` | — | Lấy bản ghi có `updatedAt >= giá trị này` |
| `lastModifiedTo` | — | Cận trên của mốc thời gian |
| `pageSize` | 20 | Số bản ghi mỗi trang, tối đa 100 |
| `currentItem` | 0 | Bỏ qua bao nhiêu bản ghi (offset) |
| `orderBy` | `updatedAt` | Trường sắp xếp — xem danh sách bên dưới |
| `orderDirection` | `asc` | `asc` hoặc `desc` |
| `includeInactive` | `false` | Lấy cả bản ghi đã ngừng hoạt động |
| `search` | — | Tìm theo tên/mã/số điện thoại tuỳ resource |
| `branchIds` | — | Lọc theo chi nhánh, phân tách bằng dấu phẩy |
| `customerIds` | — | Lọc theo khách hàng |
| `status` | — | Lọc theo trạng thái |
| `include` | — | Nạp kèm dữ liệu liên quan |

**`orderBy` chỉ nhận 7 giá trị sau**, gửi giá trị khác sẽ nhận `400`:

```
createdAt   updatedAt   purchaseDate   orderDate   id   code   name
```

### Phản hồi

```json
{
  "total": 1523,
  "pageSize": 20,
  "currentItem": 0,
  "data": [ ... ],
  "timestamp": "2026-08-14T10:00:00.000Z"
}
```

`total` là tổng số bản ghi khớp điều kiện lọc, không phải số bản ghi trong trang
hiện tại.

### Ví dụ

```bash
# Trang đầu
curl "https://<domain>/api/public/v1/customers?pageSize=50" \
  -H "Authorization: Bearer <token>"

# Tìm khách theo tên hoặc số điện thoại
curl "https://<domain>/api/public/v1/customers?search=0901234567" \
  -H "Authorization: Bearer <token>"

# Đơn hàng của 2 chi nhánh, kèm chi tiết và thanh toán
curl "https://<domain>/api/public/v1/orders?branchIds=1,2&include=details,payments" \
  -H "Authorization: Bearer <token>"

# Chi tiết một hoá đơn
curl "https://<domain>/api/public/v1/invoices/1234?include=details,payments,delivery" \
  -H "Authorization: Bearer <token>"
```

---

## 4. Đồng bộ tăng dần

Cách đồng bộ đúng:

1. Lần đầu gọi không có `lastModifiedFrom` để lấy toàn bộ.
2. **Lưu lại `timestamp`** trong phản hồi.
3. Lần sau truyền chính giá trị đó vào `lastModifiedFrom`.

```bash
# Lần đầu
curl "https://<domain>/api/public/v1/products?pageSize=100"
# → timestamp: "2026-08-14T10:00:00.000Z"

# Lần sau — chỉ lấy phần đã đổi
curl "https://<domain>/api/public/v1/products?lastModifiedFrom=2026-08-14T10:00:00.000Z"
```

**Dùng `timestamp` của máy chủ, không dùng giờ máy đối tác.** Lệch giờ giữa hai
bên sẽ làm bỏ sót bản ghi.

### Dữ liệu bị xoá

POS **không xoá cứng** bất kỳ bản ghi nghiệp vụ nào — chỉ chuyển trạng thái
(`status` = đã huỷ, hoặc `isActive` = false). Vì vậy:

- Không có danh sách `removedIds`.
- Bản ghi bị huỷ vẫn xuất hiện trong `lastModifiedFrom` với trạng thái mới.
- Muốn thấy bản ghi đã ngừng hoạt động, thêm `includeInactive=true`.

### Phân trang khi dữ liệu đang thay đổi

Phân trang dùng offset. Nếu duyệt nhiều trang trong lúc dữ liệu biến động, hãy
cố định khoảng thời gian để kết quả không xê dịch giữa các trang:

```
?lastModifiedFrom=...&lastModifiedTo=...&pageSize=100&currentItem=0
```

### Nhịp gọi hợp lý

Hạn mức 5000 request/giờ tương đương khoảng **1,4 request/giây**. Khi quét dữ
liệu lớn nên giãn nhịp tối thiểu **800 mili giây** giữa các request và chạy tuần
tự, không bắn song song.

Nếu nhận `429`, đọc header `Retry-After` (số giây) và chờ đúng khoảng đó trước
khi thử lại.

---

## 5. Endpoint bổ trợ

| Endpoint | Trả về |
|---|---|
| `GET /customers/{id}/addresses` | Địa chỉ giao hàng |
| `GET /customers/{id}/groups` | Nhóm khách hàng |
| `GET /customers/{id}/ledger` | Sổ công nợ (có dư nợ cộng dồn) |
| `GET /orders/{id}/payments` | Thanh toán của đơn |
| `GET /invoices/{id}/payments` | Thanh toán của hoá đơn |
| `GET /orders/{id}/delivery` | Giao hàng của đơn |
| `GET /invoices/{id}/delivery` | Giao hàng của hoá đơn |

Trừ `ledger`, các endpoint trên **trả toàn bộ bản ghi, không phân trang**.

### Tham số của sổ công nợ

`GET /customers/{id}/ledger` nhận thêm:

| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `fromDate` | — | Mốc đầu khoảng thời gian (ISO 8601) |
| `toDate` | — | Mốc cuối khoảng thời gian |
| `types` | tất cả | Lọc loại phát sinh, phân tách bằng dấu phẩy |
| `pageSize` | 20 | Tối đa 100 |
| `currentItem` | 0 | Offset |

`types` nhận bốn giá trị:

| Giá trị | Nghiệp vụ | Tác động công nợ |
|---|---|---|
| `invoice` | Bán hàng | tăng nợ |
| `payment` | Khách thanh toán | giảm nợ |
| `refund` | Hoàn tiền cho khách | tăng nợ |
| `return` | Trả hàng | giảm nợ |

Mỗi dòng có thêm `runningDebt` — dư nợ cộng dồn tính đến thời điểm đó.

```bash
curl "https://<domain>/api/public/v1/customers/1234/ledger?fromDate=2026-01-01T00:00:00.000Z&types=invoice,payment&pageSize=50" \
  -H "Authorization: Bearer <token>"
```

---

## 6. Ghi dữ liệu

| Resource | Tạo | Cập nhật | Huỷ / ngừng hoạt động |
|---|---|---|---|
| `customers` | `POST /customers` | `PUT /customers/{id}` | `DELETE /customers/{id}` |
| `products` | `POST /products` | `PUT /products/{id}` | `POST /products/{id}/deactivate` |
| `categories` | `POST /categories` | `PUT /categories/{id}` | không hỗ trợ |
| `orders` | `POST /orders` | `PUT /orders/{id}` | `PUT /orders/{id}/cancel` |
| `invoices` | `POST /invoices` | `PUT /invoices/{id}` | `PUT /invoices/{id}/cancel` |

Các thao tác tạo trả **HTTP 201**, cập nhật và huỷ trả **200**.

### Tạo khách hàng

```bash
curl -X POST https://<domain>/api/public/v1/customers \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 7f3a9c21-4e8b-4d1a-9c2f-1b5e6a7d8c90" \
  -d '{
    "name": "Nguyễn Văn A",
    "contactNumber": "0901234567",
    "addresses": [
      {
        "address": "12 Lê Lợi",
        "newCityCode": "79",
        "newCityName": "TP. Hồ Chí Minh",
        "newWardName": "Phường Bến Nghé",
        "isDefault": true
      }
    ]
  }'
```

### Tạo đơn hàng

Bắt buộc `branchId`, `customerId` và `items`.

```bash
curl -X POST https://<domain>/api/public/v1/orders \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: <uuid>" \
  -d '{
    "branchId": 1,
    "customerId": 1234,
    "items": [
      { "productId": 55, "quantity": 2, "unitPrice": 150000 }
    ]
  }'
```

Phản hồi có thêm `warnings` — ví dụ cảnh báo thiếu tồn kho. **Thiếu tồn kho
không chặn tạo đơn**, chỉ ghi cảnh báo.

Khuyến mãi được máy chủ tính lại, không lấy theo giá trị đối tác gửi lên.

### Tạo hoá đơn

Đây là thao tác bán hàng thật: **trừ tồn kho, ghi thẻ kho, tạo phiếu thu, cập
nhật công nợ**. Luôn gửi `Idempotency-Key`.

```bash
curl -X POST https://<domain>/api/public/v1/invoices \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: <uuid>" \
  -d '{
    "branchId": 1,
    "customerId": 1234,
    "items": [
      {
        "productId": 55,
        "productCode": "SP055",
        "productName": "Trà sữa trân châu",
        "quantity": 2,
        "price": 150000,
        "totalPrice": 300000
      }
    ],
    "paidAmount": 300000
  }'
```

Hoá đơn mới luôn bắt đầu ở trạng thái **đang xử lý**, kể cả khi đã thanh toán đủ.

### Cập nhật

`PUT` với `items` là **thay toàn bộ dòng hàng**, không phải vá từng dòng. Gửi
thiếu dòng nào thì dòng đó bị xoá khỏi chứng từ.

Không được đổi `branchId` của đơn đã tạo.

Sửa dòng hàng của hoá đơn có thể khiến hệ thống phát hành **bản hoá đơn mới** với
mã hậu tố `.01`, `.02`… và huỷ bản cũ, kèm hoàn tồn rồi trừ lại kho.

### Huỷ đơn hàng và hoá đơn

```bash
curl -X PUT https://<domain>/api/public/v1/orders/1234/cancel \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: <uuid>" \
  -d '{ "cancelPayments": true }'
```

- `cancelPayments: true` huỷ luôn phiếu thu và dòng tiền liên quan, đồng thời
  tính lại công nợ. Không gửi thì tiền đã thu vẫn giữ nguyên.
- **Không huỷ được đơn hàng khi còn hoá đơn chưa huỷ** — huỷ hoá đơn trước.
- Huỷ hoá đơn sẽ hoàn tồn kho, gỡ khuyến mãi và tính lại công nợ.

### Ngừng hoạt động thay vì xoá

- `DELETE /customers/{id}` chỉ đặt `isActive = false`, không xoá bản ghi.
- `POST /products/{id}/deactivate` đặt `isActive = false`, giữ nguyên lịch sử
  bán hàng và tồn kho.
- Không có `DELETE` cho `products`, `categories`, `orders`, `invoices`.
- Bản ghi đã ngừng hoạt động vẫn đọc lại được bằng `includeInactive=true`.

### Ghi nhận trong nhật ký

Mọi thao tác ghi qua Public API được ghi nhật ký POS dưới danh nghĩa một tài
khoản hệ thống. Nhật ký lưu lại client nào đã gọi, thời điểm và nội dung.

---

## 7. Idempotency-Key

Khi gọi qua mạng, request có thể **hết thời gian chờ sau khi POS đã ghi xong**.
Phía đối tác thấy lỗi và gọi lại, kết quả là hai bản ghi trùng nhau.

Cách tránh: sinh một chuỗi ngẫu nhiên (UUID) cho mỗi thao tác, gửi qua header
`Idempotency-Key`. Khi gọi lại **cùng khoá đó**, POS trả lại kết quả đã lưu thay
vì tạo bản ghi mới.

```
Idempotency-Key: 7f3a9c21-4e8b-4d1a-9c2f-1b5e6a7d8c90
```

| Tình huống | Kết quả |
|---|---|
| Lần đầu | Chạy nghiệp vụ, lưu phản hồi |
| Gọi lại cùng khoá, cùng nội dung | Trả lại phản hồi cũ, **không tạo mới** |
| Gọi lại khi lần đầu chưa xong | `409` — thử lại sau |
| Cùng khoá nhưng nội dung khác | `409` — khoá đã dùng cho request khác |
| Lần đầu lỗi | Khoá được giải phóng, gửi lại cùng khoá được |

Khoá giữ trong **24 giờ**. **Mỗi thao tác một khoá mới** — dùng lại khoá cũ cho
việc khác sẽ bị từ chối.

Không gửi `Idempotency-Key` vẫn gọi được, nhưng đối tác tự chịu rủi ro trùng.

**Áp dụng cho**: tạo và cập nhật `customers`, `products`, `categories`, `orders`,
`invoices`, cùng hai thao tác huỷ.

**Không áp dụng cho**: `DELETE /customers/{id}` và
`POST /products/{id}/deactivate`. Hai thao tác này vốn an toàn khi gọi lại nhiều
lần — kết quả vẫn là `isActive = false`.

---

## 8. Webhook

Thay vì hỏi liên tục, đăng ký webhook để POS chủ động báo khi có thay đổi.

### Đăng ký

```bash
curl -X POST https://<domain>/api/public/v1/webhooks \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "customers",
    "url": "https://partner.example/hooks/pos-customers",
    "secret": "chuoi-bi-mat-toi-thieu-16-ky-tu"
  }'
```

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| `resource` | có | Một trong 26 resource ở mục 3 |
| `url` | có | **Bắt buộc HTTPS** — payload chứa dữ liệu khách hàng và đơn hàng |
| `secret` | không | Dài **16 – 255** ký tự, dùng để ký payload |
| `description` | không | Ghi chú nội bộ |
| `isActive` | không | Mặc định bật |

- Đăng ký lại cùng `resource` + `url` sẽ cập nhật bản cũ và đặt lại bộ đếm lỗi.
- Mốc quét bắt đầu từ lúc đăng ký, **không dội lại lịch sử**.

### Quản lý

```
GET    /webhooks           # danh sách
GET    /webhooks/{id}      # chi tiết + 20 lần gọi gần nhất
DELETE /webhooks/{id}      # huỷ đăng ký
```

### Payload gửi tới đối tác

```json
{
  "resource": "customers",
  "total": 3,
  "data": [ ... ],
  "timestamp": "2026-08-14T10:05:00.000Z"
}
```

> **`total` có thể lớn hơn số phần tử trong `data`.** Mỗi lần gọi chỉ gửi tối đa
> **100 bản ghi**; phần còn lại đi ở các chu kỳ kế tiếp.

### Xác minh chữ ký

Nếu có `secret`, mỗi lần gọi kèm header `X-Webhook-Signature` = HMAC SHA-256 của
body. Luôn kiểm tra trước khi xử lý:

```js
const crypto = require('crypto');

function verify(rawBody, signature, secret) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
```

Dùng **raw body**, không phải object đã phân tích — thứ tự khoá sau khi phân tích
lại có thể khác, chữ ký sẽ không khớp.

### Quy tắc gửi lại

| Tình huống | Xử lý |
|---|---|
| Phản hồi 2xx | Thành công, mốc quét tiến lên |
| Mã lỗi hoặc quá 5 giây | Thất bại — **mốc quét giữ nguyên**, lô dữ liệu gửi lại ở chu kỳ sau |
| Lỗi 10 lần liên tiếp | Tạm ngưng gọi. Đăng ký lại để kích hoạt |

Nghĩa là **không mất dữ liệu khi endpoint tạm chết**, nhưng đối tác phải chịu
được nhận trùng — hãy xử lý theo hướng idempotent, đối chiếu theo `id`.

Chu kỳ quét là mỗi phút, nên tin báo trễ tối đa khoảng một phút.

---

## 9. Mã lỗi

| Mã | Ý nghĩa | Xử lý phía đối tác |
|---|---|---|
| 400 | Tham số sai, resource không tồn tại, hoặc gửi thừa trường lạ | Sửa request, **không gửi lại nguyên trạng** |
| 401 | Thiếu token, token sai, hết hạn, hoặc client đã bị tắt | Lấy token mới; vẫn lỗi thì liên hệ quản trị |
| 404 | Không tìm thấy bản ghi | Kiểm tra lại `id` |
| 409 | Xung đột `Idempotency-Key` | Xem mục 7 |
| 429 | Vượt 5000 request/giờ | Chờ theo `Retry-After` rồi thử lại |
| 500 | Lỗi phía máy chủ | Thử lại có giãn cách; kéo dài thì liên hệ quản trị |

Thân phản hồi lỗi theo định dạng chuẩn:

```json
{
  "statusCode": 400,
  "message": "...",
  "error": "Bad Request"
}
```

Riêng lỗi OAuth theo định dạng của chuẩn OAuth 2.0:

```json
{
  "error": "invalid_client",
  "error_description": "Client authentication failed"
}
```

---

## 10. Dữ liệu không được trả ra

Vì lý do bảo mật, các trường sau luôn bị loại khỏi phản hồi:

| Resource | Trường bị loại |
|---|---|
| `customers` | Số CCCD/CMND, tài khoản ngân hàng xuất hoá đơn, mã nhân viên Misa, người tạo/sửa |
| `users` | Chỉ trả `id`, `name`, `email`, `phone`, `avatar`, `branchId`, `isActive`, `createdAt`, `updatedAt` |
| `products` | Mã Misa, mã nhà máy sản xuất |
| `orders`, `invoices` | Người tạo, người bán, trạng thái đồng bộ Misa |
| `cashflows` | Mã tham chiếu cổng thanh toán |

Ngoài ra khoá đồng bộ nội bộ (KiotViet, Lark, Misa) bị loại khỏi phần lớn
resource nghiệp vụ.

Ở `customers`, danh sách nhóm khách hàng được trả dưới tên trường `groups`.

---

## 11. Quản lý client

Quản trị viên POS quản lý client tại **Cài đặt → Tích hợp API**, hoặc qua API nội
bộ (yêu cầu đăng nhập POS và quyền `settings:update`):

| Method + Path | Chức năng |
|---|---|
| `GET /api/public-api/clients` | Danh sách client |
| `POST /api/public-api/clients` | Tạo client mới |
| `PATCH /api/public-api/clients/{id}` | Cập nhật thông tin |
| `POST /api/public-api/clients/{id}/rotate-secret` | Xoay khoá bí mật |
| `POST /api/public-api/clients/{id}/activate` | Kích hoạt |
| `POST /api/public-api/clients/{id}/deactivate` | Ngừng hoạt động |

Ngoài ra có thể tạo bằng dòng lệnh:

```bash
npx ts-node prisma/seeds/create-public-api-client.ts "Tên đối tác"
```

### Về khoá bí mật

- `client_secret` chỉ hiện **một lần duy nhất** lúc tạo hoặc lúc xoay khoá. Máy
  chủ chỉ lưu bản băm, không khôi phục lại được.
- Nghi ngờ lộ khoá thì **xoay khoá ngay**. Khoá cũ mất hiệu lực lập tức.
- Tắt client sẽ **vô hiệu hoá mọi token đã cấp** ngay ở request kế tiếp.
- Không có thao tác xoá client — chỉ bật hoặc tắt, để giữ nguyên nhật ký truy cập.

---

## 12. Tra cứu nhanh

### Toàn bộ endpoint

```
POST   /api/public/v1/oauth/token

GET    /api/public/v1/{resource}
GET    /api/public/v1/{resource}/{id}

GET    /api/public/v1/customers/{id}/addresses
GET    /api/public/v1/customers/{id}/groups
GET    /api/public/v1/customers/{id}/ledger
GET    /api/public/v1/orders/{id}/payments
GET    /api/public/v1/orders/{id}/delivery
GET    /api/public/v1/invoices/{id}/payments
GET    /api/public/v1/invoices/{id}/delivery

POST   /api/public/v1/customers
PUT    /api/public/v1/customers/{id}
DELETE /api/public/v1/customers/{id}

POST   /api/public/v1/products
PUT    /api/public/v1/products/{id}
POST   /api/public/v1/products/{id}/deactivate

POST   /api/public/v1/categories
PUT    /api/public/v1/categories/{id}

POST   /api/public/v1/orders
PUT    /api/public/v1/orders/{id}
PUT    /api/public/v1/orders/{id}/cancel

POST   /api/public/v1/invoices
PUT    /api/public/v1/invoices/{id}
PUT    /api/public/v1/invoices/{id}/cancel

POST   /api/public/v1/webhooks
GET    /api/public/v1/webhooks
GET    /api/public/v1/webhooks/{id}
DELETE /api/public/v1/webhooks/{id}
```

### Header

| Header | Khi nào dùng |
|---|---|
| `Authorization: Bearer <token>` | Mọi request trừ `/oauth/token` |
| `Content-Type: application/json` | Mọi request có thân |
| `Idempotency-Key: <uuid>` | Khuyến nghị cho mọi thao tác ghi |
| `X-Webhook-Signature` | Máy chủ gửi kèm khi gọi webhook của đối tác |

### Danh mục tham khảo

Đặc tả máy đọc được: [`public-api.openapi.yaml`](./public-api.openapi.yaml)
