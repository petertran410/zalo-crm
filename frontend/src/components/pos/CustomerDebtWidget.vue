<template>
  <div
    class="sp-debt-widget pa-3 rounded-lg border transition-all"
    :class="isOverdue ? 'bg-red-50 border-red-200 text-red-900 debt-alert-danger' : hasDebt ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'"
  >
    <!-- Header -->
    <div class="d-flex justify-space-between align-center mb-2">
      <div class="d-flex align-center">
        <span
          class="material-symbols-outlined mr-1 font-18"
          :class="isOverdue ? 'text-red-600' : hasDebt ? 'text-amber-600' : 'text-emerald-600'"
        >
          {{ isOverdue ? 'warning' : hasDebt ? 'error_outline' : 'verified_user' }}
        </span>
        <span class="font-weight-bold font-14">Thông tin Công nợ POS</span>
      </div>
      <span
        class="text-caption px-2 py-0-5 rounded font-weight-bold"
        :class="isOverdue ? 'bg-red-100 text-red-700' : hasDebt ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'"
      >
        {{ isOverdue ? '🚨 NỢ QUÁ HẠN' : hasDebt ? '⚠️ CÓ CÔNG NỢ' : '🟢 AN TOÀN' }}
      </span>
    </div>

    <!-- Debt Summary Grid -->
    <div class="sp-debt-grid d-grid gap-2 grid-cols-3 my-2">
      <!-- Total Debt -->
      <div class="sp-debt-card pa-2 rounded bg-white border">
        <div class="text-caption text-grey-darken-1">Tổng nợ</div>
        <div class="text-subtitle-2 font-weight-bold" :class="debtData.totalDebt > 0 ? 'text-red-600' : 'text-grey-darken-3'">
          {{ formatVnd(debtData.totalDebt) }}
        </div>
      </div>

      <!-- Current Debt -->
      <div class="sp-debt-card pa-2 rounded bg-white border">
        <div class="text-caption text-grey-darken-1">Nợ trong hạn</div>
        <div class="text-subtitle-2 font-weight-medium text-grey-darken-3">
          {{ formatVnd(debtData.currentDebt) }}
        </div>
      </div>

      <!-- Overdue Debt -->
      <div class="sp-debt-card pa-2 rounded bg-white border" :class="{ 'border-red-400 bg-red-50': debtData.overdueDebt > 0 }">
        <div class="text-caption text-grey-darken-1">Nợ quá hạn</div>
        <div class="text-subtitle-2 font-weight-bold text-red-600">
          {{ formatVnd(debtData.overdueDebt) }}
        </div>
      </div>
    </div>

    <!-- Due Date & Quick Reminder Button -->
    <div class="d-flex justify-space-between align-center mt-3 pt-2 border-t">
      <div class="text-caption text-grey-darken-2">
        📅 Hạn thanh toán: <strong>{{ debtData.dueDate ? formatDate(debtData.dueDate) : '—' }}</strong>
      </div>

      <!-- "Chèn tin nhắc nợ" Button -->
      <v-btn
        v-if="hasDebt"
        size="x-small"
        color="error"
        variant="flat"
        class="text-none font-weight-bold"
        title="Chèn nội dung nhắc nợ vào khung chat Zalo"
        @click="insertDebtReminder"
      >
        <span class="material-symbols-outlined mr-1 font-14">content_paste</span>
        Chèn tin nhắc nợ
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { api } from '@/api/index';
import { useToast } from '@/composables/use-toast';

export interface PosDebtInfo {
  totalDebt: number;
  currentDebt: number;
  overdueDebt: number;
  dueDate: string | null;
  status: 'Normal' | 'Warning' | 'Danger';
  quickReminderText?: string;
}

const props = defineProps<{
  contactId?: string | null;
  customerName?: string;
  customerCode?: string;
  isPosLinked?: boolean;
}>();

const emit = defineEmits<{
  'insert-debt-reminder': [text: string];
}>();

const toast = useToast();

const debtData = ref<PosDebtInfo>({
  totalDebt: 0,
  currentDebt: 0,
  overdueDebt: 0,
  dueDate: null,
  status: 'Normal',
});

const loading = ref(false);

const hasDebt = computed(() => debtData.value.totalDebt > 0);
const isOverdue = computed(() => debtData.value.overdueDebt > 0 || debtData.value.status === 'Danger');

async function fetchDebts() {
  if (!props.contactId) return;
  loading.value = true;
  try {
    const res = await api.get(`/pos/customers/${props.contactId}/debts`);
    if (res.data?.success && res.data.data) {
      debtData.value = {
        totalDebt: res.data.data.totalDebt || 0,
        currentDebt: res.data.data.currentDebt || 0,
        overdueDebt: res.data.data.overdueDebt || 0,
        dueDate: res.data.data.dueDate || null,
        status: res.data.data.status || 'Normal',
        quickReminderText: res.data.data.quickReminderText,
      };
    }
  } catch (err) {
    console.error('[CustomerDebtWidget] Error fetching debts:', err);
  } finally {
    loading.value = false;
  }
}

watch(() => props.contactId, (newId) => {
  if (newId) fetchDebts();
}, { immediate: true });

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

function generateDebtReminderText(): string {
  if (debtData.value.quickReminderText) {
    return debtData.value.quickReminderText;
  }
  const name = props.customerName || 'Quý khách';
  const code = props.customerCode ? ` (Mã KH: ${props.customerCode})` : '';
  const total = formatVnd(debtData.value.totalDebt);
  const overdue = debtData.value.overdueDebt > 0 ? formatVnd(debtData.value.overdueDebt) : '0 đ';
  const dueDateStr = debtData.value.dueDate ? formatDate(debtData.value.dueDate) : '—';

  return `Xin chào ${name}${code},\nCRM Hi Sweetie xin gửi thông tin công nợ tính đến hiện tại:\n- Tổng công nợ: ${total}\n- Nợ quá hạn: ${overdue}\n- Hạn thanh toán: ${dueDateStr}\n\nQuý khách vui lòng kiểm tra và thanh toán sớm giúp Shop nhé. Xin cảm ơn!`;
}

async function insertDebtReminder() {
  const text = generateDebtReminderText();
  emit('insert-debt-reminder', text);

  // Dispatch custom event to automatically fill Zalo chat composer
  window.dispatchEvent(new CustomEvent('chat:insert-suggestion', { detail: { text } }));

  try {
    await navigator.clipboard.writeText(text);
    toast.success('Đã sao chép & chèn tin nhắc nợ vào khung chat!');
  } catch {
    toast.success('Đã chèn nội dung nhắc nợ vào khung chat!');
  }
}
</script>

<style scoped>
.sp-debt-widget {
  transition: all 0.2s ease-in-out;
}
.debt-alert-danger {
  animation: pulse-border 2s infinite;
}
@keyframes pulse-border {
  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
  70% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}
.sp-debt-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
</style>
