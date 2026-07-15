# Shared Pagination Framework & POS MCP Integration Developer Guide

Tài liệu này hướng dẫn chi tiết cách hoạt động, các file liên quan, và cách tái sử dụng **Shared Pagination Framework** cho các module khác trong dự án CRM mà không cần xây dựng lại từ đầu.

---

## 1. Kiến trúc tổng quan (Architecture Overview)

Để tối ưu hóa tốc độ phản hồi và giảm tải trực tiếp lên hệ thống POS của KiotViet, hệ thống áp dụng mô hình **Shared Read Model + Event Sync (Lightweight CQRS)**.

```
+------------------+                   +----------------------+
|   KiotViet POS   |                   |     CRM Database     |
| (Source of Truth)|                   |  (Local PostgreSQL)  |
+--------+---------+                   +----------+-----------+
         |                                        ^
         | (Đồng bộ qua MCP client)               |
         v                                        |
+--------+---------+                              |
|   POS Sync Engine+------------------------------+ (Ghi Read Model)
|  (pos-sync-serv) |                              |
+------------------+                              v
                                       +----------+-----------+
                                       |  PosCustomer/Product |
                                       |   (Local Read-Only)  |
                                       +----------+-----------+
                                                  |
                                                  | (Query qua Cursor)
                                                  v
                                       +----------+-----------+
                                       |   PaginationService  |
                                       +----------+-----------+
                                                  |
                                                  | (Fastify HTTP API)
                                                  v
                                       +----------+-----------+
                                       |      Client UI       |
                                       |  (usePagination /    |
                                       |   GenericDataTable)  |
                                       +----------------------+
```

### Tại sao lại dùng Cursor Pagination thay vì Offset (Limit/Skip)?
1. **Hiệu năng nhất quán (O(1) vs O(N)):** Khi phân trang bằng offset (`SKIP 10000 LIMIT 20`), database phải quét qua 10.000 bản ghi đầu tiên rồi mới trả về 20 bản ghi tiếp theo. Phân trang bằng cursor (`WHERE id > lastId LIMIT 20`) nhảy trực tiếp đến điểm cần lấy nhờ vào index, tránh lag ở trang lớn.
2. **Không bị trùng/sót bản ghi:** Nếu có dữ liệu mới thêm vào hoặc bị xóa đi trong lúc người dùng đang lướt trang, Offset sẽ bị nhảy hàng hoặc lặp dữ liệu. Cursor dựa trên giá trị của bản ghi cuối cùng nên danh sách luôn liên tục.

---

## 2. Các file & Module liên quan (Related Files)

### A. Backend
1. **Schema CSDL:** [schema.prisma](file:///d:/Hi%20Sweetie/CRM%20anh%20Nh%C3%A2n/zalo-crm/backend/prisma/schema.prisma) - Định nghĩa `PosCustomer` và `PosProduct`.
2. **Cursor Core Utility:** `backend/src/shared/pagination/cursor-pagination.ts` - Hàm decode/encode con trỏ sang chuỗi Base64.
3. **MCP Client Provider:** `backend/src/shared/mcp/mcp-client.ts` - Singleton khởi tạo SDK POS.
4. **Sync Service:** `backend/src/shared/mcp/pos-sync-service.ts` - Đồng bộ dữ liệu kéo từ POS ghi vào CSDL local.
5. **Pagination Service:** `backend/src/shared/mcp/pos-pagination-service.ts` - Tạo các câu query Prisma có điều kiện cursor.
6. **Routes:** `backend/src/modules/pos/pos-routes.ts` - Đăng ký endpoints HTTP.
7. **App Entrypoint:** [app.ts](file:///d:/Hi%20Sweetie/CRM%20anh%20Nh%C3%A2n/zalo-crm/backend/src/app.ts) - Nơi import và mount `posRoutes`.

### B. Frontend
1. **Pagination Composable:** `frontend/src/composables/use-pagination.ts` - Quản lý lịch sử cursor (nhấn Next/Prev), trạng thái tải, và tìm kiếm/sắp xếp.
2. **Generic Table Component:** `frontend/src/components/ui/GenericDataTable.vue` - Component bảng Vuetify 4 được thiết kế theo chuẩn UI/UX cao cấp, cố định header (`fixed-header`) và giới hạn scroll nội bộ.
3. **Views:**
   - [PosHubView.vue](file:///d:/Hi%20Sweetie/CRM%20anh%20Nh%C3%A2n/zalo-crm/frontend/src/views/pos/PosHubView.vue) - Cửa sổ POS Hub điều hành, chứa nút đồng bộ.
   - [PosProductsView.vue](file:///d:/Hi%20Sweetie/CRM%20anh%20Nh%C3%A2n/zalo-crm/frontend/src/views/pos/PosProductsView.vue) - Danh sách sản phẩm.
   - [PosCustomersView.vue](file:///d:/Hi%20Sweetie/CRM%20anh%20Nh%C3%A2n/zalo-crm/frontend/src/views/pos/PosCustomersView.vue) - Danh sách khách hàng.
4. **Router Configuration:** [router/index.ts](file:///d:/Hi%20Sweetie/CRM%20anh%20Nh%C3%A2n/zalo-crm/frontend/src/router/index.ts) - Đăng ký các view trên với hệ thống định tuyến.

---

## 3. Hướng dẫn áp dụng cho Module mới (Developer Step-by-Step Guide)

Để áp dụng cơ chế phân trang này cho một bảng dữ liệu mới (ví dụ: `PosOrder`), lập trình viên làm theo 4 bước sau:

### Bước 1: Khai báo Model trong CSDL
Mở `schema.prisma`, định nghĩa model của bạn và bắt buộc phải có các index phục vụ tìm kiếm/sắp xếp:
```prisma
model PosOrder {
  id        String   @id @default(uuid())
  posId     Int      @unique @map("pos_id")
  amount    Float
  orgId     String   @map("org_id")
  createdAt DateTime @default(now()) @map("created_at")

  org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([orgId])
  @@index([createdAt]) // Rất quan trọng để sắp xếp theo thời gian
}
```
*Nhớ chạy `$env:DATABASE_URL="..."; npm run db:push` và `npx prisma generate` để cập nhật client.*

### Bước 2: Viết Pagination Service ở Backend
Cơ chế con trỏ yêu cầu so sánh giá trị sắp xếp của bản ghi cuối cùng (`lastValue`) kèm khóa phụ (`lastId` - để chống trùng nếu giá trị trùng nhau):
```typescript
import { prisma } from '../database/prisma-client.js';
import { decodeCursor, encodeCursor, PaginationRequest, PaginationResponse } from '../pagination/cursor-pagination.js';

export class OrderPaginationService {
  static async getOrders(orgId: string, req: PaginationRequest): Promise<PaginationResponse<any>> {
    const limit = Math.min(req.limit || 20, 100);
    const decoded = decodeCursor(req.cursor);
    const lastId = decoded?.lastId;
    const lastValue = decoded?.lastValue;
    
    const sortBy = req.sortBy || 'createdAt';
    const sortOrder = req.sortOrder || 'desc';

    const where: any = { orgId };

    // Xử lý cursor
    if (lastId && lastValue !== undefined) {
      const operator = sortOrder === 'desc' ? 'lt' : 'gt';
      where.AND = [
        {
          OR: [
            { [sortBy]: { [operator]: lastValue } },
            {
              AND: [
                { [sortBy]: lastValue },
                { id: { [operator]: lastId } },
              ],
            },
          ],
        },
      ];
    }

    const items = await prisma.posOrder.findMany({
      where,
      orderBy: [
        { [sortBy]: sortOrder },
        { id: sortOrder },
      ],
      take: limit + 1, // Lấy dư 1 bản ghi để biết có trang tiếp theo (hasNext) hay không
    });

    const hasNext = items.length > limit;
    const paginatedItems = hasNext ? items.slice(0, limit) : items;

    let nextCursor: string | null = null;
    if (hasNext && paginatedItems.length > 0) {
      const lastItem = paginatedItems[paginatedItems.length - 1];
      nextCursor = encodeCursor({
        lastId: lastItem.id,
        lastValue: (lastItem as any)[sortBy],
      });
    }

    return {
      items: paginatedItems,
      nextCursor,
      hasNext,
    };
  }
}
```

### Bước 3: Đăng ký HTTP Route
Expose service ra API:
```typescript
app.get('/api/v1/pos/orders', async (request, reply) => {
  const user = request.user!;
  const query = request.query as any;

  return OrderPaginationService.getOrders(user.orgId, {
    limit: parseInt(query.limit) || 20,
    cursor: query.cursor,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });
});
```

### Bước 4: Gọi Composable & Render Table ở Frontend
Tại Vue component mới, bạn chỉ cần nạp composable `usePagination` và truyền cấu hình cột vào component `<GenericDataTable>`:
```vue
<template>
  <div class="pos-orders-page pa-6">
    <h1 class="text-h4 font-weight-bold mb-4">Đơn hàng POS</h1>
    
    <GenericDataTable
      :columns="columns"
      :items="items"
      :loading="loading"
      :hasNext="hasNext"
      :hasPrev="hasPrev"
      :current-sort-by="state.sortBy"
      :current-sort-order="state.sortOrder"
      @search="search"
      @sort="sort"
      @next="nextPage"
      @prev="prevPage"
    >
      <template #cell-amount="{ item }">
        <span class="tabular-nums font-weight-medium primary--text">
          {{ formatCurrency(item.amount) }}
        </span>
      </template>
    </GenericDataTable>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { usePagination } from '@/composables/use-pagination';
import GenericDataTable from '@/components/ui/GenericDataTable.vue';

const columns = [
  { key: 'id', label: 'Mã Hệ Thống' },
  { key: 'amount', label: 'Tổng Tiền', sortable: true },
];

const { items, loading, hasNext, hasPrev, state, loadPage, nextPage, prevPage, search, sort } = usePagination({
  endpoint: '/pos/orders',
  defaultSortBy: 'createdAt',
  defaultSortOrder: 'desc',
});

onMounted(() => { loadPage(); });
</script>

<style scoped>
.pos-orders-page {
  height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
```

---

## 4. Các Quy tắc UI/UX bắt buộc tuân thủ (UI/UX Guardrails)

Khi phát triển thêm màn hình hiển thị bằng Shared Pagination Framework, bắt buộc tuân thủ các quy tắc thiết kế sau (theo `taste-skill` và `ux-ui-pro-max`):

1. **Giới hạn chiều cao & Cuộn nội bộ (Height Containment):**
   Màn hình cha chứa bảng phải có chiều cao giới hạn `height: calc(100vh - 48px)` và `overflow: hidden`. Bảng dữ liệu sẽ tự sinh thanh cuộn bên trong khi vượt quá độ dài, tuyệt đối không được làm tràn chiều cao trang để nút phân trang chân trang bị đẩy xuống dưới màn hình.
2. **Header cố định (Fixed Table Header):**
   Sử dụng `<v-table fixed-header>` để dòng tiêu đề cột luôn cố định ở trên cùng khi cuộn danh sách xuống dưới.
3. **Tabular Numbers cho dữ liệu số:**
   Các trường hiển thị tiền tệ, số lượng, hoặc số điện thoại bắt buộc phải có class `tabular-nums` và sử dụng `font-family: monospace` để các chữ số được căn thẳng hàng theo chiều dọc, giúp dễ so sánh.
4. **Không sử dụng Emojis làm Icon chức năng:**
   Tuyệt đối không dùng emojis (như ⚙️, 🎨, 🔄) làm icon trên các nút bấm chính hoặc tiêu đề. Luôn sử dụng icon vector mdi-svg của hệ thống (ví dụ: `<v-icon>mdi-sync</v-icon>`).
5. **Nút quay lại (Predictable Back Navigation):**
   Mọi màn hình danh sách chi tiết (như Sản phẩm/Khách hàng) phải có nút điều hướng quay về trang Hub (`/pos`) ở vị trí góc trên bên trái tiêu đề trang.
