<template>
  <v-dialog :model-value="modelValue" max-width="640" scrollable @update:model-value="emit('update:modelValue', $event)">
    <v-card class="pos-summary-dialog" rounded="lg">
      <v-card-title class="pos-summary-header">
        <span>Thông tin tài khoản POS</span>
        <button type="button" class="pos-summary-close" aria-label="Đóng" @click="emit('update:modelValue', false)">
          <span class="material-symbols-outlined">close</span>
        </button>
      </v-card-title>
      <v-card-text>
        <div v-if="loading" class="pos-summary-state">
          <v-progress-circular indeterminate size="22" width="2" color="primary" />
          <span>Đang tải thông tin POS…</span>
        </div>
        <div v-else-if="error" class="pos-summary-state pos-summary-error">{{ error }}</div>
        <template v-else-if="summary">
          <div class="pos-summary-profile">
            <div><span>Mã khách hàng</span><strong>{{ summary.customerCode || '—' }}</strong></div>
            <div><span>Họ và tên</span><strong>{{ summary.fullName || fallbackName || '—' }}</strong></div>
          </div>

          <section class="pos-summary-section">
            <h3>Công nợ</h3>
            <div class="pos-summary-debt">
              <div><span>Tổng nợ</span><strong>{{ formatMoney(summary.debt.total) }}</strong></div>
              <div><span>Trong hạn</span><strong>{{ formatMoney(summary.debt.current) }}</strong></div>
              <div><span>Quá hạn</span><strong>{{ formatMoney(summary.debt.overdue) }}</strong></div>
            </div>
          </section>

          <section class="pos-summary-section">
            <h3>5 đơn hàng gần nhất</h3>
            <p v-if="summary.orders.length === 0" class="pos-summary-empty">Chưa có đơn hàng.</p>
            <div v-for="order in summary.orders" :key="order.id" class="pos-summary-entry">
              <div><strong>{{ order.code }}</strong><small>{{ formatDate(order.orderDate) }}</small></div>
              <div><strong>{{ formatMoney(order.grandTotal) }}</strong><small>{{ order.status }}</small></div>
            </div>
          </section>

          <section class="pos-summary-section">
            <h3>5 hóa đơn gần nhất</h3>
            <p v-if="summary.invoices.length === 0" class="pos-summary-empty">Chưa có hóa đơn.</p>
            <div v-for="invoice in summary.invoices" :key="invoice.id" class="pos-summary-entry">
              <div><strong>{{ invoice.invoiceCode }}</strong><small>{{ formatDate(invoice.invoiceDate) }}</small></div>
              <div><strong>{{ formatMoney(invoice.totalAmount) }}</strong><small>{{ invoice.status }} · Còn nợ {{ formatMoney(invoice.remainingDebt) }}</small></div>
            </div>
          </section>
        </template>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { api } from '@/api';

interface PosAccountSummary {
  customerCode: string | null;
  fullName: string;
  debt: { total: number; current: number; overdue: number };
  orders: Array<{ id: string; code: string; orderDate: string; grandTotal: number; status: string }>;
  invoices: Array<{ id: string; invoiceCode: string; invoiceDate: string; totalAmount: number; remainingDebt: number; status: string }>;
}

const props = defineProps<{
  modelValue: boolean;
  contactId: string | null;
  posCustomerId?: number | null;
  fallbackName?: string | null;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
const summary = ref<PosAccountSummary | null>(null);
const loading = ref(false);
const error = ref('');
let requestId = 0;

watch(() => [props.modelValue, props.contactId, props.posCustomerId] as const, async ([open, contactId, posCustomerId]) => {
  const currentRequest = ++requestId;
  summary.value = null;
  error.value = '';
  if (!open || !contactId) return;
  loading.value = true;
  try {
    const response = await api.get<PosAccountSummary>(`/pos/contacts/${contactId}/summary`, {
      params: posCustomerId == null ? undefined : { posCustomerId },
    });
    if (currentRequest === requestId) summary.value = response.data;
  } catch {
    if (currentRequest === requestId) error.value = 'Không tải được thông tin POS. Vui lòng thử lại.';
  } finally {
    if (currentRequest === requestId) loading.value = false;
  }
});

function formatMoney(value: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('vi-VN');
}
</script>

<style scoped>
.pos-summary-header { display: flex; align-items: center; justify-content: space-between; font-size: 17px; font-weight: 700; }
.pos-summary-close { display: grid; width: 30px; height: 30px; place-items: center; border: 0; border-radius: 7px; background: transparent; color: #62748e; cursor: pointer; }
.pos-summary-close:hover { background: #eef2f7; }
.pos-summary-profile { display: grid; gap: 10px; padding: 14px; border-radius: 10px; background: #f6f9fd; }
.pos-summary-profile > div, .pos-summary-debt > div { display: grid; gap: 3px; }
.pos-summary-profile span, .pos-summary-debt span { color: #62748e; font-size: 11px; }
.pos-summary-profile strong { color: #162b4d; font-size: 14px; overflow-wrap: anywhere; }
.pos-summary-section { margin-top: 20px; }
.pos-summary-section h3 { margin: 0 0 10px; color: #26364b; font-size: 13px; }
.pos-summary-debt { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.pos-summary-debt > div { padding: 10px; border: 1px solid #e4e9f0; border-radius: 8px; }
.pos-summary-debt strong { color: #26364b; font-size: 12px; }
.pos-summary-entry { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-top: 1px solid #edf1f7; }
.pos-summary-entry > div { display: grid; gap: 3px; min-width: 0; }
.pos-summary-entry > div:last-child { text-align: right; }
.pos-summary-entry strong { color: #26364b; font-size: 12px; overflow-wrap: anywhere; }
.pos-summary-entry small, .pos-summary-empty { color: #718096; font-size: 11px; }
.pos-summary-state { display: flex; align-items: center; gap: 10px; padding: 24px 0; color: #62748e; font-size: 12px; }
.pos-summary-error { color: #b74747; }
@media (max-width: 480px) { .pos-summary-debt { grid-template-columns: 1fr; } }
</style>
