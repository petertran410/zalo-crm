<template>
  <div
    class="ob-detail-popover-wrapper"
    @click.stop
    @mouseenter="pauseTimer"
    @mouseleave="resumeTimer"
  >
    <!-- Floating Popover Card -->
    <div
      class="ob-detail-popover-card"
      :style="{ top: `${popoverPos.top}px`, left: `${popoverPos.left}px` }"
    >
      <!-- 8-Second Auto-Close Progress Bar -->
      <div class="ob-timer-bar-container" title="Tự đóng sau 8s (Rê chuột vào để dừng đếm)">
        <div
          class="ob-timer-bar-fill"
          :style="{ width: `${progressPercent}%`, transition: isPaused ? 'none' : 'width 0.1s linear' }"
        ></div>
      </div>

      <!-- Header -->
      <div class="ob-detail-popover-header">
        <div class="ob-detail-popover-title-wrap">
          <span class="ob-detail-popover-badge">THÔNG TIN SẢN PHẨM & TỒN KHO</span>
          <h4 class="ob-detail-popover-title" :title="productName">{{ productName }}</h4>
        </div>
        <button class="ob-detail-popover-close-btn" title="Đóng" @click="$emit('close')">
          <X :size="14" />
        </button>
      </div>

      <!-- Main Scrollable Body (All-in-One, No Tabs) -->
      <div class="ob-detail-popover-body">

        <!-- ════════════════════════════════════════════════════════════ -->
        <!-- PHẦN 1: THẺ THÔNG TIN SẢN PHẨM (DÙNG ĐỂ CHỤP ẢNH GỬI KHÁCH) -->
        <!-- ════════════════════════════════════════════════════════════ -->
        <div class="ob-screenshot-card">

          <div class="ob-sc-main">
            <!-- Product Thumbnail / Avatar -->
            <div class="ob-sc-thumb">
              <Package :size="28" class="ob-sc-thumb-icon" />
            </div>

            <!-- Product Primary Details -->
            <div class="ob-sc-details">
              <div class="ob-sc-head-row">
                <span class="ob-sc-code">{{ productCode }}</span>
                <span class="ob-sc-price">{{ formatVND(basePrice || 0) }}</span>
              </div>
              <h3 class="ob-sc-title">{{ productName }}</h3>
              <div class="ob-sc-meta-row">
                <span class="ob-sc-meta-item">📦 Quy cách: 12 Hộp / Thùng</span>
                <span class="ob-sc-meta-item">🏷️ Đơn vị: {{ unit || 'Hộp' }}</span>
              </div>
            </div>
          </div>

          <!-- Lorem Description & Product Highlights -->
          <div class="ob-sc-desc-box">
            <p class="ob-sc-desc-text">
              Mô tả: Sản phẩm chiết xuất tự nhiên, công nghệ chế biến hiện đại giữ trọn hương vị tươi ngon. Thích hợp dùng hằng ngày hoặc làm quà biếu tặng sang trọng.
            </p>
            <div class="ob-sc-highlights">
              <span class="ob-sc-chip">✨ Đạt chuẩn HACCP</span>
              <span class="ob-sc-chip">🌱 100% Tự nhiên</span>
              <span class="ob-sc-chip">🛡️ HSD 12 tháng</span>
            </div>
          </div>
        </div>

        <!-- ════════════════════════════════════════════════════════════ -->
        <!-- PHẦN 2: THÔNG TIN ĐỐI SOÁT SALES (LỊCH SỬ MUA + TỒN KHO)   -->
        <!-- ════════════════════════════════════════════════════════════ -->
        <div class="ob-sales-hub-section">

          <!-- 2A. LỊCH SỬ MUA HÀNG GẦN NHẤT CỦA KHÁCH HÀNG -->
          <div class="ob-hub-block">
            <div class="ob-hub-block-title">
              <History :size="13" class="ob-icon-blue" />
              <span>Lịch sử mua gần nhất của khách</span>
              <span v-if="customerName" class="ob-cust-name-pill">{{ customerName }}</span>
            </div>

            <div v-if="priceHistoryState.loading" class="ob-detail-state-box">
              <Loader2 :size="15" class="ob-spin-icon" /> Đang tải lịch sử mua...
            </div>

            <div v-else-if="!customerId" class="ob-detail-state-box">
              <Info :size="14" class="ob-info-icon" /> Chưa chọn khách hàng trên đơn.
            </div>

            <div v-else-if="historyData.length === 0" class="ob-detail-state-box ob-empty-history">
              <ShoppingBag :size="15" class="ob-info-icon" />
              Khách <strong>{{ customerName }}</strong> chưa từng mua sản phẩm này trước đây.
            </div>

            <div v-else class="ob-detail-table-wrap">
              <table class="ob-detail-table">
                <thead>
                  <tr>
                    <th>Ngày mua</th>
                    <th>Mã đơn</th>
                    <th class="ob-txt-center">SL</th>
                    <th class="ob-txt-right">Đơn giá mua</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(item, idx) in historyData.slice(0, 3)" :key="idx">
                    <td>{{ formatDate(item.orderDate) }}</td>
                    <td class="ob-code-cell">{{ item.orderCode }}</td>
                    <td class="ob-txt-center">{{ item.quantity }}</td>
                    <td class="ob-txt-right ob-price-cell">
                      {{ formatVND(item.unitPrice) }}
                      <span v-if="item.isGift" class="ob-gift-tag"> (Quà)</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- 2B. TỒN KHO CÁC CHI NHÁNH KHO -->
          <div class="ob-hub-block">
            <div class="ob-hub-block-title">
              <Warehouse :size="13" class="ob-icon-amber" />
              <span>Tồn kho các chi nhánh</span>
              <span class="ob-stock-total-pill">Tổng: {{ totalStockAvailable }} {{ unit || 'SP' }}</span>
            </div>

            <div v-if="inventoryState.loading" class="ob-detail-state-box">
              <Loader2 :size="15" class="ob-spin-icon" /> Đang tải số lượng tồn kho...
            </div>

            <div v-else-if="branchStockList.length === 0" class="ob-detail-state-box">
              <Info :size="14" class="ob-info-icon" /> Chưa có dữ liệu tồn kho.
            </div>

            <div v-else class="ob-detail-table-wrap">
              <table class="ob-detail-table">
                <thead>
                  <tr>
                    <th>Chi nhánh / Kho</th>
                    <th class="ob-txt-center">Khả dụng</th>
                    <th class="ob-txt-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(branch, idx) in branchStockList" :key="idx">
                    <td class="ob-branch-name">{{ branch.branchName }}</td>
                    <td class="ob-txt-center ob-font-bold">{{ branch.available ?? branch.onHand ?? 0 }}</td>
                    <td class="ob-txt-center">
                      <span
                        class="ob-stock-badge"
                        :class="getStockBadgeClass(branch.available ?? branch.onHand ?? 0)"
                      >
                        {{ getStockBadgeLabel(branch.available ?? branch.onHand ?? 0) }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { X, History, Warehouse, Loader2, Info, ShoppingBag, Package } from 'lucide-vue-next';
import { useProductInventory } from '@/composables/use-product-inventory';
import { usePriceHistory, type PriceHistoryItem } from '@/composables/use-price-history';

const props = defineProps<{
  productId: number;
  productCode: string;
  productName: string;
  basePrice?: number;
  unit?: string;
  customerId?: number | null;
  customerName?: string;
  popoverPos: { top: number; left: number };
}>();

const emit = defineEmits<{
  'close': [];
}>();

// ─── 8-Second Auto Close Timer State ───
const DURATION_MS = 8000;
const remainingMs = ref(DURATION_MS);
const isPaused = ref(false);
let timerInterval: ReturnType<typeof setInterval> | null = null;

const progressPercent = computed(() => {
  return Math.max(0, (remainingMs.value / DURATION_MS) * 100);
});

function startTimer() {
  stopTimer();
  remainingMs.value = DURATION_MS;
  timerInterval = setInterval(() => {
    if (!isPaused.value) {
      remainingMs.value -= 100;
      if (remainingMs.value <= 0) {
        stopTimer();
        emit('close');
      }
    }
  }, 100);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function pauseTimer() {
  isPaused.value = true;
}

function resumeTimer() {
  isPaused.value = false;
}

// ─── Data Composables ───
const { inventoryState, fetchInventory } = useProductInventory();
const { priceHistoryState, fetchPriceHistory } = usePriceHistory();

const historyData = computed<PriceHistoryItem[]>(() => priceHistoryState.value.data || []);

const branchStockList = computed(() => {
  const data = inventoryState.value.data;
  if (!data || !data.branches) return [];
  return data.branches;
});

const totalStockAvailable = computed(() => {
  const data = inventoryState.value.data;
  if (!data) return 0;
  return data.available ?? data.onHand ?? 0;
});

function loadData() {
  fetchInventory(props.productId);
  if (props.customerId) {
    fetchPriceHistory(props.customerId, props.productId);
  }
}

onMounted(() => {
  loadData();
  startTimer();
  setTimeout(() => {
    window.addEventListener('click', handleOutsideClick);
  }, 50);
});

onUnmounted(() => {
  stopTimer();
  window.removeEventListener('click', handleOutsideClick);
});

function handleOutsideClick(e: MouseEvent) {
  const cardEl = document.querySelector('.ob-detail-popover-card');
  if (cardEl && !cardEl.contains(e.target as Node)) {
    emit('close');
  }
}

watch(
  () => [props.productId, props.customerId],
  () => {
    loadData();
    startTimer();
  }
);

function getStockBadgeClass(available: number): string {
  if (available <= 0) return 'ob-badge--out';
  if (available <= 5) return 'ob-badge--low';
  return 'ob-badge--in';
}

function getStockBadgeLabel(available: number): string {
  if (available <= 0) return 'Hết hàng';
  if (available <= 5) return 'Sắp hết';
  return 'Còn hàng';
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatVND(val: number): string {
  if (val === undefined || val === null || isNaN(val)) return '0 đ';
  return Math.round(val).toLocaleString('vi-VN') + ' đ';
}
</script>

<style scoped>
.ob-detail-popover-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 9999;
}

.ob-detail-popover-card {
  position: absolute;
  z-index: 10000;
  pointer-events: auto;
  width: 520px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 20px 48px -8px rgba(15, 23, 42, 0.22), 0 8px 24px -6px rgba(15, 23, 42, 0.12);
  animation: ob-pop-in 0.15s ease-out;
  font-family: system-ui, -apple-system, sans-serif;
}

@keyframes ob-pop-in {
  from { opacity: 0; transform: translateY(4px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* Timer Progress Bar */
.ob-timer-bar-container {
  height: 4px;
  background: #e2e8f0;
  width: 100%;
}

.ob-timer-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #2563eb, #3b82f6);
}

.ob-detail-popover-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.ob-detail-popover-title-wrap {
  flex: 1;
  min-width: 0;
}

.ob-detail-popover-badge {
  font-size: 9.5px;
  font-weight: 800;
  color: #2563eb;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.ob-detail-popover-title {
  font-size: 13.5px;
  font-weight: 700;
  color: #0f172a;
  margin: 1px 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ob-detail-popover-close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 3px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.ob-detail-popover-close-btn:hover { background: #e2e8f0; color: #334155; }

/* Body Content */
.ob-detail-popover-body {
  padding: 12px 14px;
  max-height: 480px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ════════════════════════════════════════════════════════════ */
/* PHẦN 1: THẺ CHỤP ẢNH GỬI KHÁCH HÀNG                          */
/* ════════════════════════════════════════════════════════════ */
.ob-screenshot-card {
  background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%);
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  padding: 12px;
  position: relative;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.06);
}

.ob-sc-badge-tag {
  position: absolute;
  top: 8px;
  right: 10px;
  font-size: 10px;
  font-weight: 700;
  color: #2563eb;
  background: #dbeafe;
  padding: 2px 7px;
  border-radius: 12px;
}

.ob-sc-main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 8px;
}

.ob-sc-thumb {
  width: 52px;
  height: 52px;
  background: #ffffff;
  border: 1px solid #93c5fd;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #2563eb;
  flex-shrink: 0;
  box-shadow: 0 2px 4px rgba(0,0,0,0.04);
}

.ob-sc-details {
  flex: 1;
  min-width: 0;
}

.ob-sc-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 2px;
}

.ob-sc-code {
  font-family: monospace;
  font-size: 10px;
  font-weight: 700;
  color: #1e40af;
  background: #dbeafe;
  padding: 1px 5px;
  border-radius: 4px;
}

.ob-sc-price {
  font-size: 14px;
  font-weight: 800;
  color: #2563eb;
}

.ob-sc-title {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
  margin: 2px 0 4px;
  line-height: 1.35;
}

.ob-sc-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 10.5px;
  color: #475569;
  font-weight: 600;
}

.ob-sc-desc-box {
  background: #ffffff;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  margin-top: 6px;
}

.ob-sc-desc-text {
  font-size: 11px;
  color: #334155;
  line-height: 1.45;
  margin: 0 0 6px;
}

.ob-sc-highlights {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.ob-sc-chip {
  font-size: 9.5px;
  font-weight: 700;
  color: #1e293b;
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
}

/* ════════════════════════════════════════════════════════════ */
/* PHẦN 2: ĐỐI SOÁT SALES (LỊCH SỬ MUA + TỒN KHO)              */
/* ════════════════════════════════════════════════════════════ */
.ob-sales-hub-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ob-hub-block {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 10px;
}

.ob-hub-block-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid #f1f5f9;
}

.ob-icon-blue { color: #2563eb; }
.ob-icon-amber { color: #d97706; }

.ob-cust-name-pill {
  margin-left: auto;
  font-size: 10px;
  font-weight: 700;
  color: #2563eb;
  background: #eff6ff;
  padding: 1px 6px;
  border-radius: 10px;
}

.ob-stock-total-pill {
  margin-left: auto;
  font-size: 10px;
  font-weight: 700;
  color: #d97706;
  background: #fffbeb;
  padding: 1px 6px;
  border-radius: 10px;
}

.ob-detail-state-box {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  font-size: 11px;
  color: #64748b;
  text-align: center;
}

.ob-empty-history {
  background: #f8fafc;
  border-radius: 6px;
}

.ob-spin-icon {
  animation: spin 1s linear infinite;
  color: #2563eb;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.ob-info-icon { color: #94a3b8; }

.ob-detail-table-wrap {
  overflow-x: auto;
}

.ob-detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.ob-detail-table th {
  background: #f8fafc;
  color: #475569;
  font-weight: 700;
  padding: 4px 6px;
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
}

.ob-detail-table td {
  padding: 4px 6px;
  border-bottom: 1px solid #f1f5f9;
  color: #1e293b;
}

.ob-code-cell {
  font-family: monospace;
  color: #2563eb;
  font-weight: 600;
}

.ob-price-cell {
  font-weight: 700;
  color: #0f172a;
}

.ob-gift-tag {
  font-size: 9.5px;
  color: #ec4899;
}

.ob-branch-name {
  font-weight: 600;
}

.ob-stock-badge {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 9.5px;
  font-weight: 700;
}

.ob-badge--in { background: #dcfce7; color: #166534; }
.ob-badge--low { background: #fef9c3; color: #854d0e; }
.ob-badge--out { background: #fee2e2; color: #991b1b; }

.ob-txt-center { text-align: center; }
.ob-txt-right { text-align: right; }
.ob-font-bold { font-weight: 700; }
</style>
