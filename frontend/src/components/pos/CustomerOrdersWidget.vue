<template>
  <div class="sp-orders-widget">
    <!-- Header Row -->
    <div class="sp-orders-widget__header d-flex justify-space-between align-center mb-3">
      <div class="sp-orders-widget__title d-flex align-center">
        <span class="material-symbols-outlined text-primary mr-1 font-18">receipt_long</span>
        <span class="font-weight-bold slate-dark font-14">Lịch sử đơn hàng POS</span>
        <span v-if="isPosLinked && orders.length > 0" class="sp-orders-count-chip ml-2 px-2 py-0-5 rounded-pill bg-primary-lighten-5 text-primary text-caption font-weight-bold">
          {{ orders.length }}
        </span>
      </div>

      <!-- "Tạo đơn" Button -->
      <v-btn
        size="small"
        color="primary"
        variant="flat"
        class="text-none font-weight-medium"
        :disabled="!isPosLinked || !orderDraftStore.canOpenNew"
        @click="handleCreateOrder"
      >
        <span class="material-symbols-outlined mr-1 font-16">add_shopping_cart</span>
        Tạo đơn
      </v-btn>
    </div>

    <!-- Summary KPI Cards -->
    <div v-if="summary && isPosLinked" class="sp-orders-summary-grid d-grid grid-cols-4 gap-2 mb-3">
      <div class="summary-card pa-2 rounded bg-grey-lighten-5 border">
        <div class="text-caption text-grey-darken-1">Tổng đơn</div>
        <div class="text-subtitle-2 font-weight-bold">{{ summary.totalCount }} đơn</div>
      </div>
      <div class="summary-card pa-2 rounded bg-grey-lighten-5 border">
        <div class="text-caption text-grey-darken-1">Doanh số</div>
        <div class="text-subtitle-2 font-weight-bold text-success">{{ formatVnd(summary.totalGrandTotal) }}</div>
      </div>
      <div class="summary-card pa-2 rounded bg-grey-lighten-5 border">
        <div class="text-caption text-grey-darken-1">Nợ đơn chốt</div>
        <div class="text-subtitle-2 font-weight-bold text-danger">{{ formatVnd(summary.actualDebt) }}</div>
      </div>
      <div class="summary-card pa-2 rounded bg-grey-lighten-5 border">
        <div class="text-caption text-grey-darken-1">Nợ tạm tính</div>
        <div class="text-subtitle-2 font-weight-bold text-warning">{{ formatVnd(summary.estimatedDebt) }}</div>
      </div>
    </div>

    <!-- Unlinked State Banner -->
    <div v-if="!isPosLinked" class="sp-orders-unlinked-box pa-4 rounded-lg text-center bg-grey-lighten-4">
      <span class="material-symbols-outlined text-grey-darken-1 font-28 mb-1">link_off</span>
      <div class="text-subtitle-2 font-weight-medium text-grey-darken-3">Chưa liên kết POS</div>
      <div class="text-caption text-grey-darken-1 mb-2">Liên kết khách hàng với POS để xem lịch sử đơn hàng</div>
    </div>

    <!-- Loading State -->
    <div v-else-if="loading" class="text-center py-4">
      <v-progress-circular indeterminate size="20" width="2" color="primary" />
      <span class="text-caption text-grey ml-2">Đang tải danh sách đơn hàng...</span>
    </div>

    <!-- Orders List -->
    <template v-else-if="orders.length > 0">
      <div class="sp-orders-cards-container">
        <div
          v-for="order in paginatedOrders"
          :key="order.id"
          class="sp-order-card pa-3 mb-2 rounded-lg border bg-white cursor-pointer hover-shadow"
          @click="$emit('open-detail', order)"
        >
          <div class="sp-order-card__header d-flex justify-space-between align-center mb-1">
            <div class="sp-order-card__code-wrap d-flex align-center">
              <span class="material-symbols-outlined text-primary font-16 mr-1">receipt</span>
              <span class="font-weight-bold font-mono text-primary">{{ order.code }}</span>
            </div>
            <span
              class="sp-order-card__status text-caption px-2 py-0-5 rounded font-weight-medium"
              :class="getOrderStatusClass(order.orderStatus)"
            >
              {{ getOrderStatusLabel(order.orderStatus) }}
            </span>
          </div>

          <div class="sp-order-card__products text-caption text-grey-darken-2 my-1">
            <div v-for="(item, idx) in (order.items || []).slice(0, 2)" :key="idx" class="sp-order-card__item-row text-truncate">
              • {{ item.productName }} <span class="text-grey font-weight-bold">(x{{ item.quantity }})</span>
            </div>
            <div v-if="(order.items || []).length > 2" class="sp-order-card__more text-caption text-primary italic">
              +{{ order.items.length - 2 }} sản phẩm khác
            </div>
          </div>

          <div class="sp-order-card__footer d-flex justify-space-between align-center pt-2 mt-1 border-t text-caption">
            <div class="sp-order-card__date text-grey">
              📅 {{ formatDate(order.orderDate || order.createdAt) }}
            </div>
            <div class="sp-order-card__price font-weight-bold text-subtitle-2 text-slate-800">
              {{ formatVnd(order.grandTotal) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="sp-orders-pagination-bar d-flex justify-space-between align-center mt-2 px-1">
        <button class="sp-pg-btn btn-sm" :disabled="currentPage <= 1" @click="currentPage--">‹ Trước</button>
        <span class="sp-pg-text text-caption">Trang <strong>{{ currentPage }}</strong> / {{ totalPages }}</span>
        <button class="sp-pg-btn btn-sm" :disabled="currentPage >= totalPages" @click="currentPage++">Sau ›</button>
      </div>
    </template>

    <div v-else class="text-caption text-grey-darken-1 text-center py-4">Chưa có đơn hàng nào.</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { api } from '@/api/index';
import { useOrderDraftStore } from '@/stores/use-workspace-sessions';

export interface PosOrderItem {
  id: string;
  posProductId: number;
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface PosOrderSummary {
  totalCount: number;
  draftCount: number;
  confirmedCount: number;
  doneCount: number;
  cancelledCount: number;
  totalGrandTotal: number;
  estimatedDebt: number;
  actualDebt: number;
  lastOrderAt: string | null;
  lastOrderCode: string | null;
}

const props = defineProps<{
  contactId?: string | null;
  isPosLinked: boolean;
  posCustomerId?: number;
  posCustomerCode?: string;
  customerName?: string;
  customerPhone?: string;
}>();

const emit = defineEmits<{
  'create-order': [];
  'open-detail': [order: any];
}>();

const orderDraftStore = useOrderDraftStore();

const orders = ref<any[]>([]);
const summary = ref<PosOrderSummary | null>(null);
const loading = ref(false);
const currentPage = ref(1);
const pageSize = 5;

const totalPages = computed(() => Math.ceil(orders.value.length / pageSize) || 1);

const paginatedOrders = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return orders.value.slice(start, start + pageSize);
});

async function fetchOrders() {
  if (!props.contactId) return;
  loading.value = true;
  try {
    const res = await api.get(`/pos/customers/${props.contactId}/orders`);
    if (res.data?.success && res.data.data) {
      orders.value = res.data.data.orders || [];
      summary.value = res.data.data.summary || null;
    }
  } catch (err) {
    console.error('[CustomerOrdersWidget] Error fetching orders:', err);
  } finally {
    loading.value = false;
  }
}

watch(() => props.contactId, (newId) => {
  if (newId) fetchOrders();
}, { immediate: true });

function handleCreateOrder() {
  if (props.posCustomerId && props.contactId) {
    orderDraftStore.openDraft({
      contactId: props.contactId,
      posCustomerId: props.posCustomerId,
      posCustomerCode: props.posCustomerCode || '',
      contactName: props.customerName || 'Khách hàng',
      contactPhone: props.customerPhone || '',
    });
  }
  emit('create-order');
}

function formatVnd(val: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0);
}

function formatDate(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleDateString('vi-VN');
  } catch {
    return isoStr;
  }
}

function getOrderStatusClass(status: string): string {
  switch (status) {
    case 'Done':
    case 'Completed':
    case 'Hoàn thành':
      return 'bg-green-100 text-green-700';
    case 'Confirmed':
    case 'Processing':
    case 'Đã xác nhận':
      return 'bg-blue-100 text-blue-700';
    case 'Cancelled':
    case 'Đã hủy':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-amber-100 text-amber-800';
  }
}

function getOrderStatusLabel(status: string): string {
  switch (status) {
    case 'Done':
    case 'Completed':
      return 'Hoàn thành';
    case 'Confirmed':
    case 'Processing':
      return 'Đã xác nhận';
    case 'Cancelled':
      return 'Đã hủy';
    case 'Pending':
    case 'Draft':
      return 'Phiếu tạm';
    default:
      return status || 'Phiếu tạm';
  }
}
</script>

<style scoped>
.sp-orders-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.sp-order-card {
  transition: all 0.15s ease;
}
.sp-order-card:hover {
  border-color: #3b82f6 !important;
}
.sp-pg-btn {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.sp-pg-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
