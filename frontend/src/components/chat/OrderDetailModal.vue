<template>
  <v-dialog v-model="open" max-width="520" scrollable>
    <v-card class="order-detail-card" rounded="xl" elevation="0">

      <!-- ─── Header ─── -->
      <div class="od-header">
        <div class="od-header-left">
          <span class="od-code">{{ order?.code }}</span>
          <span class="od-status-badge" :class="statusClass">{{ statusLabel }}</span>
        </div>
        <button class="od-close" @click="open = false">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="od-date">
        <span class="material-symbols-outlined od-date-icon">calendar_today</span>
        {{ formattedDate }}
      </div>

      <v-divider />

      <!-- ─── Danh sách sản phẩm ─── -->
      <v-card-text class="od-body pa-0">

        <div class="od-section-title">
          <span class="material-symbols-outlined">inventory_2</span>
          Sản phẩm ({{ order?.items?.length ?? 0 }} món)
        </div>

        <div class="od-product-list">
          <div
            v-for="(item, idx) in order?.items"
            :key="item.id || idx"
            class="od-product-row"
          >
            <div class="od-product-name">
              <span class="od-product-code">{{ item.productCode }}</span>
              {{ item.productName }}
            </div>
            <div class="od-product-numbers">
              <span class="od-product-qty">×{{ item.quantity }}</span>
              <span v-if="item.discount > 0" class="od-product-discount">
                -{{ fmtCurrency(item.discount) }}
              </span>
              <span class="od-product-total">{{ fmtCurrency(item.totalPrice ?? (item.quantity * item.unitPrice - (item.discount || 0))) }}</span>
            </div>
          </div>
        </div>

        <v-divider class="my-3" />

        <!-- ─── Tổng tiền ─── -->
        <div class="od-summary">
          <div class="od-summary-row">
            <span>Tạm tính</span>
            <span>{{ fmtCurrency(order?.totalAmount ?? 0) }}</span>
          </div>
          <div v-if="(order?.discount ?? 0) > 0" class="od-summary-row od-discount-row">
            <span>Chiết khấu</span>
            <span class="od-val-discount">-{{ fmtCurrency(order?.discount ?? 0) }}</span>
          </div>
          <div class="od-summary-row od-grand-row">
            <span class="od-grand-label">Tổng cộng</span>
            <span class="od-grand-val">{{ fmtCurrency(order?.grandTotal ?? 0) }}</span>
          </div>
          <div class="od-summary-row">
            <span>Đã thanh toán</span>
            <span class="od-val-paid">{{ fmtCurrency(order?.paidAmount ?? 0) }}</span>
          </div>
          <div class="od-summary-row">
            <span class="od-debt-label">Còn lại / Nợ</span>
            <span
              class="od-debt-val"
              :class="(order?.debtAmount ?? 0) > 0 ? 'od-val-debt' : 'od-val-ok'"
            >{{ fmtCurrency(order?.debtAmount ?? 0) }}</span>
          </div>
        </div>

        <!-- ─── Ghi chú đơn ─── -->
        <div v-if="order?.description" class="od-notes">
          <span class="material-symbols-outlined od-notes-icon">sticky_note_2</span>
          <span>{{ order.description }}</span>
        </div>

      </v-card-text>

      <v-divider />

      <!-- ─── Footer actions ─── -->
      <div class="od-footer">
        <v-btn
          variant="text"
          color="grey-darken-1"
          class="text-none"
          @click="open = false"
        >Đóng</v-btn>
      </div>

    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface OrderItem {
  id?: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  totalPrice?: number;
}

interface OrderDetail {
  id?: string;
  code: string;
  orderStatus: string;
  orderDate?: string;
  createdAt?: string;
  totalAmount: number;
  discount?: number;
  grandTotal: number;
  paidAmount: number;
  debtAmount: number;
  description?: string | null;
  items: OrderItem[];
}

const props = defineProps<{
  modelValue: boolean;
  order: OrderDetail | null;
}>();
const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
}>();

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

// ── Status helpers ──────────────────────────────────────────
const DRAFT_STATUSES     = ['Pending', 'Draft', 'Phiếu tạm'];
const CONFIRMED_STATUSES = ['Confirmed', 'Đã xác nhận'];
const PROCESSING_STATUSES = ['Processing', 'Đang xử lý'];
const DONE_STATUSES      = ['Done', 'Completed', 'Hoàn thành', 'Đã hoàn thành'];
const CANCELLED_STATUSES = ['Cancelled', 'Đã hủy', 'Huỷ'];

const statusLabel = computed(() => {
  const s = props.order?.orderStatus || '';
  if (DRAFT_STATUSES.includes(s))      return 'Phiếu tạm';
  if (CONFIRMED_STATUSES.includes(s))  return 'Đã xác nhận';
  if (PROCESSING_STATUSES.includes(s)) return 'Đang xử lý';
  if (DONE_STATUSES.includes(s))       return 'Hoàn thành';
  if (CANCELLED_STATUSES.includes(s))  return 'Đã hủy';
  return s;
});

const statusClass = computed(() => {
  const s = props.order?.orderStatus || '';
  if (DRAFT_STATUSES.includes(s))      return 'od-status--draft';
  if (CONFIRMED_STATUSES.includes(s))  return 'od-status--confirmed';
  if (PROCESSING_STATUSES.includes(s)) return 'od-status--processing';
  if (DONE_STATUSES.includes(s))       return 'od-status--done';
  if (CANCELLED_STATUSES.includes(s))  return 'od-status--cancelled';
  return '';
});

const formattedDate = computed(() => {
  const d = props.order?.orderDate || props.order?.createdAt;
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
});

// ── Currency ─────────────────────────────────────────────
function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}
</script>

<style scoped>
/* ─── Card shell ─── */
.order-detail-card {
  border: 1px solid rgba(0, 104, 255, 0.10);
  overflow: hidden;
}

/* ─── Header ─── */
.od-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 6px;
}
.od-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.od-code {
  font-size: 18px;
  font-weight: 800;
  color: #0f172a;
  font-family: 'Inter', monospace;
  letter-spacing: 0.01em;
}
.od-close {
  background: none;
  border: none;
  cursor: pointer;
  color: #94A3B8;
  display: flex;
  align-items: center;
  border-radius: 6px;
  padding: 2px;
  transition: color 0.15s, background 0.15s;
}
.od-close:hover { color: #0f172a; background: rgba(0,0,0,0.05); }
.od-close .material-symbols-outlined { font-size: 20px; }

.od-date {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 20px 14px;
  font-size: 12px;
  color: #94A3B8;
}
.od-date-icon { font-size: 14px; }

/* ─── Status badges ─── */
.od-status-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 999px;
  letter-spacing: 0.03em;
}
.od-status--draft      { background: #FEF3C7; color: #B45309; }
.od-status--confirmed  { background: #DBEAFE; color: #1D4ED8; }
.od-status--processing { background: #E0F2FE; color: #0369A1; }
.od-status--done       { background: #DCFCE7; color: #15803D; }
.od-status--cancelled  { background: #FEE2E2; color: #B91C1C; }

/* ─── Body ─── */
.od-body { padding: 16px 20px !important; }

.od-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #64a8d8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 10px;
}
.od-section-title .material-symbols-outlined { font-size: 16px; }

/* ─── Product list ─── */
.od-product-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.od-product-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 10px;
  background: rgba(248, 250, 252, 0.8);
  border-radius: 8px;
  border: 1px solid rgba(0, 104, 255, 0.06);
}
.od-product-name {
  flex: 1;
  font-size: 12.5px;
  color: #1e293b;
  line-height: 1.4;
}
.od-product-code {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  color: #94A3B8;
  font-family: monospace;
  margin-right: 4px;
}
.od-product-numbers {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  flex-shrink: 0;
}
.od-product-qty {
  font-size: 12px;
  color: #64748B;
  font-weight: 600;
}
.od-product-discount {
  font-size: 11px;
  color: #DC2626;
}
.od-product-total {
  font-size: 12.5px;
  font-weight: 700;
  color: #0068FF;
  font-family: 'Inter', monospace;
}

/* ─── Financial summary ─── */
.od-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 2px;
}
.od-summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: #475569;
}
.od-discount-row { color: #DC2626; }
.od-grand-row {
  padding: 8px 10px;
  background: rgba(0, 104, 255, 0.04);
  border-radius: 8px;
  margin: 2px 0;
  border: 1px solid rgba(0, 104, 255, 0.08);
}
.od-grand-label {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}
.od-grand-val {
  font-size: 16px;
  font-weight: 800;
  color: #0068FF;
  font-family: 'Inter', monospace;
}
.od-val-paid    { color: #16A34A; font-weight: 600; }
.od-val-debt    { color: #DC2626; font-weight: 700; }
.od-val-ok      { color: #16A34A; font-weight: 600; }
.od-val-discount { color: #DC2626; }
.od-debt-label  { color: #0f172a; font-weight: 600; }

/* ─── Notes ─── */
.od-notes {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 12px;
  padding: 10px 12px;
  background: #FFFBEB;
  border-radius: 8px;
  border: 1px solid #FDE68A;
  font-size: 12.5px;
  color: #78350F;
  line-height: 1.5;
}
.od-notes-icon { font-size: 16px; color: #D97706; margin-top: 1px; }

/* ─── Footer ─── */
.od-footer {
  display: flex;
  justify-content: flex-end;
  padding: 10px 16px;
}
</style>
