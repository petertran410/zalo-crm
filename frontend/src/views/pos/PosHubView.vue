<!--
  Design Read: Reading this as: POS Hub & Management slice for CRM users/sales agents,
  with a clean corporate-modern and slightly glassmorphic design language,
  leaning toward Vuetify 3 unified components + curated slate neutrals.
  Dials: DESIGN_VARIANCE: 5, MOTION_INTENSITY: 4, VISUAL_DENSITY: 5
-->
<template>
  <div class="pos-hub-container pa-6">
    <!-- Page Header -->
    <header class="hub-header d-flex justify-space-between align-center mb-8 pb-4 border-b">
      <div class="header-title">
        <div class="d-flex align-center gap-2 mb-1">
          <v-icon color="primary" size="28">mdi-storefront-outline</v-icon>
          <h1 class="text-h4 font-weight-bold slate-dark">KiotViet POS Hub</h1>
        </div>
        <p class="text-body-2 grey--text text--darken-1 mb-0">
          Trung tâm điều hành đồng bộ và quản lý dữ liệu từ hệ thống KiotViet POS
        </p>
      </div>
      <div class="header-actions">
        <v-btn
          color="primary"
          :loading="syncing"
          :disabled="syncing"
          class="sync-btn text-capitalize px-5"
          elevation="1"
          rounded="lg"
          @click="triggerSync"
        >
          <v-icon left size="18" class="mr-1">mdi-sync</v-icon> Đồng bộ từ POS
        </v-btn>
      </div>
    </header>

    <!-- Sync Progress Panel (chỉ hiện khi đang hoặc vừa sync xong) -->
    <v-expand-transition>
      <div v-if="showProgress" class="sync-progress-panel mb-8">
        <v-card class="pa-5" outlined>
          <div class="d-flex align-center mb-4">
            <v-icon :color="overallDone ? 'success' : 'primary'" size="22" class="mr-2">
              {{ overallDone ? 'mdi-check-circle' : 'mdi-cloud-sync-outline' }}
            </v-icon>
            <span class="text-subtitle-1 font-weight-bold">
              {{ overallDone ? 'Đồng bộ hoàn tất!' : 'Đang đồng bộ dữ liệu...' }}
            </span>
            <v-spacer />
            <v-btn v-if="overallDone" icon size="small" variant="text" @click="showProgress = false">
              <v-icon size="18">mdi-close</v-icon>
            </v-btn>
          </div>

          <!-- Products progress -->
          <div class="progress-row mb-4">
            <div class="d-flex align-center justify-space-between mb-1">
              <div class="d-flex align-center gap-1">
                <v-icon size="16" :color="progressColor('products')">mdi-package-variant-closed</v-icon>
                <span class="text-body-2 font-weight-medium">Sản phẩm</span>
              </div>
              <span class="text-caption" :class="progressTextClass('products')">
                {{ progressLabel(productProgress) }}
              </span>
            </div>
            <v-progress-linear
              :model-value="progressPercent(productProgress)"
              :color="progressColor('products')"
              :indeterminate="productProgress.phase === 'fetching' && productProgress.total === -1"
              height="8"
              rounded
              class="progress-bar"
            />
          </div>

          <!-- Customers progress -->
          <div class="progress-row">
            <div class="d-flex align-center justify-space-between mb-1">
              <div class="d-flex align-center gap-1">
                <v-icon size="16" :color="progressColor('customers')">mdi-account-group-outline</v-icon>
                <span class="text-body-2 font-weight-medium">Khách hàng</span>
              </div>
              <span class="text-caption" :class="progressTextClass('customers')">
                {{ progressLabel(customerProgress) }}
              </span>
            </div>
            <v-progress-linear
              :model-value="progressPercent(customerProgress)"
              :color="progressColor('customers')"
              :indeterminate="customerProgress.phase === 'fetching' && customerProgress.total === -1"
              height="8"
              rounded
              class="progress-bar"
            />
          </div>
        </v-card>
      </div>
    </v-expand-transition>

    <!-- Bento Grid Section -->
    <v-row class="hub-grid" justify="start">
      <!-- Customers Card -->
      <v-col cols="12" md="6" class="animate-fade-in-left">
        <v-card
          class="hub-card pa-6 fill-height d-flex flex-column justify-space-between"
          outlined
          hover
          to="/pos/customers"
        >
          <div>
            <div class="icon-box mb-6 bg-blue-glow">
              <v-icon color="info" size="32">mdi-account-group-outline</v-icon>
            </div>
            <h2 class="text-h5 font-weight-bold mb-2">Khách hàng</h2>
            <p class="text-body-2 grey--text text--darken-2 mb-4 pr-4">
              Xem và tra cứu danh sách khách hàng được đồng bộ từ POS. Hỗ trợ tìm kiếm theo tên, số điện thoại, lọc nhóm và phân trang bằng con trỏ tối ưu hiệu suất.
            </p>
          </div>
          <div class="card-footer d-flex align-center primary--text font-weight-medium">
            <span>Quản lý khách hàng</span>
            <v-icon right size="16" class="ml-1 arrow-icon">mdi-arrow-right</v-icon>
          </div>
        </v-card>
      </v-col>

      <!-- Products Card -->
      <v-col cols="12" md="6" class="animate-fade-in-right">
        <v-card
          class="hub-card pa-6 fill-height d-flex flex-column justify-space-between"
          outlined
          hover
          to="/pos/products"
        >
          <div>
            <div class="icon-box mb-6 bg-teal-glow">
              <v-icon color="success" size="32">mdi-package-variant-closed</v-icon>
            </div>
            <h2 class="text-h5 font-weight-bold mb-2">Sản phẩm</h2>
            <p class="text-body-2 grey--text text--darken-2 mb-4 pr-4">
              Theo dõi danh mục sản phẩm của cửa hàng. Quản lý thông tin mã SKU, tên mặt hàng và đơn giá cơ sở đồng bộ tự động từ hệ thống quản lý bán hàng.
            </p>
          </div>
          <div class="card-footer d-flex align-center primary--text font-weight-medium">
            <span>Xem danh mục sản phẩm</span>
            <v-icon right size="16" class="ml-1 arrow-icon">mdi-arrow-right</v-icon>
          </div>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { api } from '@/api/index';
import { useToast } from '@/composables/use-toast';
import { createAppSocket } from '@/api/socket';

// ── Types ────────────────────────────────────────────────────────────────────
interface SyncProgress {
  table: 'products' | 'customers';
  phase: 'fetching' | 'saving' | 'done' | 'error';
  current: number;
  total: number;
  message?: string;
}

const INITIAL_PROGRESS: SyncProgress = { table: 'products', phase: 'fetching', current: 0, total: -1 };

// ── State ────────────────────────────────────────────────────────────────────
const toast = useToast();
const syncing = ref(false);
const showProgress = ref(false);

const productProgress = ref<SyncProgress>({ ...INITIAL_PROGRESS, table: 'products' });
const customerProgress = ref<SyncProgress>({ ...INITIAL_PROGRESS, table: 'customers' });

const overallDone = computed(() =>
  productProgress.value.phase === 'done' && customerProgress.value.phase === 'done'
);

// ── Socket.IO listener ──────────────────────────────────────────────────────
const socket = createAppSocket();

function onSyncProgress(data: SyncProgress) {
  if (data.table === 'products') {
    productProgress.value = data;
  } else if (data.table === 'customers') {
    customerProgress.value = data;
  }

  // Báo lỗi chi tiết từ socket event
  if (data.phase === 'error') {
    const tableName = data.table === 'products' ? 'sản phẩm' : 'khách hàng';
    toast.error(`Lỗi đồng bộ ${tableName}: ${data.message || 'Không rõ nguyên nhân'}`);
  }

  // Tự động tắt syncing khi cả hai bảng done hoặc error
  if (
    (productProgress.value.phase === 'done' || productProgress.value.phase === 'error') &&
    (customerProgress.value.phase === 'done' || customerProgress.value.phase === 'error')
  ) {
    syncing.value = false;
    if (overallDone.value) {
      toast.success(`Đồng bộ xong: ${productProgress.value.current} sản phẩm, ${customerProgress.value.current} khách hàng`);
    }
  }
}

onMounted(() => {
  socket.on('pos:sync:progress', onSyncProgress);
});

onUnmounted(() => {
  socket.off('pos:sync:progress', onSyncProgress);
  socket.disconnect();
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function progressPercent(p: SyncProgress): number {
  if (p.phase === 'done') return 100;
  if (p.phase === 'error') return 100;
  if (p.total > 0) return Math.min(Math.round((p.current / p.total) * 100), 99);
  return 0; // indeterminate handled by v-progress-linear
}

function progressLabel(p: SyncProgress): string {
  if (p.phase === 'done') return `✓ ${p.current} mục`;
  if (p.phase === 'error') return p.message || 'Lỗi';
  if (p.message) return p.message;
  if (p.current > 0) return `${p.current} mục...`;
  return 'Đang chờ...';
}

function progressColor(table: string): string {
  const p = table === 'products' ? productProgress.value : customerProgress.value;
  if (p.phase === 'done') return 'success';
  if (p.phase === 'error') return 'error';
  return 'primary';
}

function progressTextClass(table: string): string {
  const p = table === 'products' ? productProgress.value : customerProgress.value;
  if (p.phase === 'done') return 'text-success';
  if (p.phase === 'error') return 'text-error';
  return 'text-medium-emphasis';
}

// ── Sync trigger ─────────────────────────────────────────────────────────────
async function triggerSync() {
  syncing.value = true;
  showProgress.value = true;

  // Reset progress
  productProgress.value = { table: 'products', phase: 'fetching', current: 0, total: -1 };
  customerProgress.value = { table: 'customers', phase: 'fetching', current: 0, total: -1 };

  try {
    await api.post('/pos/sync', null, { timeout: 300_000 });
  } catch (err: any) {
    syncing.value = false;
    // Báo lỗi chi tiết kèm mã lỗi nếu request thất bại (timeout/500/network)
    const errMsg = err.response?.data?.error || err.message || 'Mất kết nối hoặc quá thời gian phản hồi (timeout)';
    toast.error(`Đồng bộ dữ liệu POS thất bại: ${errMsg}`);
  }
}
</script>

<style scoped>
.pos-hub-container {
  min-height: calc(100vh - 48px);
  background-color: #f8fafc;
}

.border-b {
  border-bottom: 1px solid #e2e8f0;
}

.slate-dark {
  color: #1e293b;
}

.gap-1 {
  gap: 4px;
}

.gap-2 {
  gap: 8px;
}

/* ── Sync Progress Panel ── */
.sync-progress-panel .v-card {
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%);
}

.progress-bar {
  border-radius: 6px;
}

/* ── Bento Cards ── */
.hub-card {
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background-color: #ffffff;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
}

.hub-card:hover {
  transform: translateY(-4px);
  border-color: rgba(23, 134, 190, 0.3) !important;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.05) !important;
}

.hub-card:hover .arrow-icon {
  transform: translateX(4px);
}

.arrow-icon {
  transition: transform 0.2s ease;
}

.icon-box {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bg-blue-glow {
  background-color: rgba(3, 169, 244, 0.08);
  border: 1px solid rgba(3, 169, 244, 0.15);
}

.bg-teal-glow {
  background-color: rgba(76, 175, 80, 0.08);
  border: 1px solid rgba(76, 175, 80, 0.15);
}

.sync-btn {
  font-weight: 600;
  letter-spacing: 0.2px;
}

/* Entry animations */
.animate-fade-in-left {
  animation: fadeInLeft 0.4s ease-out;
}

.animate-fade-in-right {
  animation: fadeInRight 0.4s ease-out;
}

@keyframes fadeInLeft {
  from { opacity: 0; transform: translateX(-20px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes fadeInRight {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}
</style>
