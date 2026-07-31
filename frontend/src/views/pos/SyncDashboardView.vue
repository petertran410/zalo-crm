<template>
  <div class="pos-sync-dashboard-container pa-6">
    <!-- Header -->
    <header class="dashboard-header d-flex justify-space-between align-center mb-6 pb-4 border-b">
      <div>
        <div class="d-flex align-center gap-2 mb-1">
          <v-icon color="primary" size="32">mdi-sync-circle</v-icon>
          <h1 class="text-h4 font-weight-bold slate-dark">POS Admin Sync Dashboard</h1>
          <v-chip
            :color="healthColor"
            size="small"
            variant="flat"
            class="ml-3 font-weight-bold text-white"
          >
            <v-icon left size="14" class="mr-1">{{ healthIcon }}</v-icon>
            {{ healthText }}
          </v-chip>
        </div>
        <p class="text-body-2 text-medium-emphasis mb-0">
          Giám sát trạng thái đồng bộ POS, nhật ký Webhook và xử lý sự cố trực tiếp.
        </p>
      </div>

      <div class="d-flex align-center gap-3">
        <v-btn
          color="primary"
          variant="outlined"
          :loading="loadingStats"
          @click="fetchStats"
        >
          <v-icon left size="18" class="mr-1">mdi-refresh</v-icon> Làm mới
        </v-btn>
        <v-btn
          color="primary"
          :loading="triggeringSync"
          :disabled="stats.isSyncing"
          elevation="2"
          @click="handleTriggerSync"
        >
          <v-icon left size="18" class="mr-1">mdi-cloud-sync</v-icon> Kích hoạt đồng bộ POS
        </v-btn>
      </div>
    </header>

    <!-- Active Sync Banner -->
    <v-expand-transition>
      <v-alert
        v-if="stats.isSyncing"
        type="info"
        variant="tonal"
        class="mb-6 rounded-lg"
        prominent
      >
        <template #title>
          <span class="font-weight-bold">Quá trình đồng bộ dữ liệu POS đang diễn ra</span>
        </template>
        <div>
          Hệ thống đang thực hiện đồng bộ tổng thể các thực thể POS nền. Dữ liệu sẽ tự động cập nhật sau khi hoàn tất.
        </div>
        <v-progress-linear
          indeterminate
          color="info"
          height="6"
          rounded
          class="mt-3"
        />
      </v-alert>
    </v-expand-transition>

    <!-- 4 Bento Metric Cards -->
    <v-row class="mb-6">
      <v-col cols="12" sm="6" md="3">
        <v-card class="pa-4 bento-card border" rounded="lg" elevation="1">
          <div class="d-flex align-center justify-space-between mb-2">
            <span class="text-caption font-weight-bold text-uppercase text-medium-emphasis">Tổng đơn POS</span>
            <v-avatar color="blue-lighten-5" size="40" rounded="lg">
              <v-icon color="blue-darken-2" size="22">mdi-receipt-text-outline</v-icon>
            </v-avatar>
          </div>
          <div class="text-h4 font-weight-bold slate-dark">
            {{ formatNumber(stats.totalOrdersSynced) }}
          </div>
          <div class="text-caption text-medium-emphasis mt-1">Đơn hàng đã được lưu trữ</div>
        </v-card>
      </v-col>

      <v-col cols="12" sm="6" md="3">
        <v-card class="pa-4 bento-card border" rounded="lg" elevation="1">
          <div class="d-flex align-center justify-space-between mb-2">
            <span class="text-caption font-weight-bold text-uppercase text-medium-emphasis">Bản ghi công nợ</span>
            <v-avatar color="amber-lighten-5" size="40" rounded="lg">
              <v-icon color="amber-darken-3" size="22">mdi-account-cash-outline</v-icon>
            </v-avatar>
          </div>
          <div class="text-h4 font-weight-bold slate-dark">
            {{ formatNumber(stats.totalDebtRecords) }}
          </div>
          <div class="text-caption text-medium-emphasis mt-1">Công nợ khách hàng POS</div>
        </v-card>
      </v-col>

      <v-col cols="12" sm="6" md="3">
        <v-card class="pa-4 bento-card border" rounded="lg" elevation="1">
          <div class="d-flex align-center justify-space-between mb-2">
            <span class="text-caption font-weight-bold text-uppercase text-medium-emphasis">Tổng Webhook Events</span>
            <v-avatar color="cyan-lighten-5" size="40" rounded="lg">
              <v-icon color="cyan-darken-2" size="22">mdi-webhook</v-icon>
            </v-avatar>
          </div>
          <div class="text-h4 font-weight-bold slate-dark">
            {{ formatNumber(stats.totalWebhookEvents) }}
          </div>
          <div class="text-caption text-medium-emphasis mt-1">Sự kiện đã nhận từ POS</div>
        </v-card>
      </v-col>

      <v-col cols="12" sm="6" md="3">
        <v-card
          class="pa-4 bento-card border cursor-pointer"
          :class="{ 'border-error': stats.failedWebhooksCount > 0 }"
          rounded="lg"
          elevation="1"
          @click="filterByStatus('FAILED')"
        >
          <div class="d-flex align-center justify-space-between mb-2">
            <span class="text-caption font-weight-bold text-uppercase text-error">Webhook thất bại</span>
            <v-avatar color="red-lighten-5" size="40" rounded="lg">
              <v-icon color="red-darken-2" size="22">mdi-alert-circle-outline</v-icon>
            </v-avatar>
          </div>
          <div class="text-h4 font-weight-bold text-error">
            {{ formatNumber(stats.failedWebhooksCount) }}
          </div>
          <div class="text-caption text-error mt-1 font-weight-medium">
            {{ stats.failedWebhooksCount > 0 ? 'Bấm để lọc các mục lỗi ➔' : 'Không có lỗi phát sinh' }}
          </div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Webhook Logs Table Section -->
    <v-card rounded="lg" class="border" elevation="1">
      <v-card-title class="pa-4 border-b d-flex flex-wrap align-center justify-space-between gap-3">
        <div class="d-flex align-center gap-2">
          <v-icon color="primary">mdi-format-list-bulleted-square</v-icon>
          <span class="text-h6 font-weight-bold">Nhật ký thực thi Webhook</span>
        </div>

        <div class="d-flex align-center flex-wrap gap-3">
          <!-- Status Filter Chips -->
          <v-chip-group v-model="selectedStatus" selected-class="v-chip--selected" mandatory>
            <v-chip value="" filter variant="outlined" size="small">Tất cả</v-chip>
            <v-chip value="PENDING" filter color="warning" variant="tonal" size="small">PENDING</v-chip>
            <v-chip value="PROCESSED" filter color="success" variant="tonal" size="small">PROCESSED</v-chip>
            <v-chip value="FAILED" filter color="error" variant="tonal" size="small">FAILED</v-chip>
          </v-chip-group>

          <!-- Search Bar -->
          <v-text-field
            v-model="searchQuery"
            density="compact"
            variant="outlined"
            placeholder="Tìm theo ID / Event Type..."
            prepend-inner-icon="mdi-magnify"
            hide-details
            clearable
            style="width: 260px"
            @update:model-value="onSearchInput"
          />
        </div>
      </v-card-title>

      <!-- Table Body -->
      <v-table hover class="webhook-logs-table">
        <thead>
          <tr>
            <th class="text-left">ID Log</th>
            <th class="text-left">Event Type</th>
            <th class="text-left">Trạng thái</th>
            <th class="text-center">Số lần thử</th>
            <th class="text-left">Lỗi gần nhất</th>
            <th class="text-left">Thời gian nhận</th>
            <th class="text-center">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loadingLogs">
            <td colspan="7" class="text-center pa-6">
              <v-progress-circular indeterminate color="primary" class="mr-2" size="24" />
              <span>Đang tải danh sách webhook logs...</span>
            </td>
          </tr>
          <tr v-else-if="logs.length === 0">
            <td colspan="7" class="text-center pa-8 text-medium-emphasis">
              <v-icon size="40" color="grey-lighten-1" class="mb-2">mdi-text-box-search-outline</v-icon>
              <div>Không tìm thấy dữ liệu webhook log phù hợp.</div>
            </td>
          </tr>
          <tr v-for="item in logs" :key="item.id">
            <td class="font-mono text-caption font-weight-bold">
              #{{ item.id.substring(0, 8) }}
            </td>
            <td>
              <v-chip size="x-small" color="blue-grey-lighten-4" class="text-blue-grey-darken-3 font-weight-medium">
                {{ item.eventType }}
              </v-chip>
            </td>
            <td>
              <v-chip
                :color="statusChipColor(item.status)"
                size="small"
                variant="tonal"
                class="font-weight-bold"
              >
                <v-icon left size="12" class="mr-1">{{ statusChipIcon(item.status) }}</v-icon>
                {{ item.status }}
              </v-chip>
            </td>
            <td class="text-center">
              <span :class="{ 'text-error font-weight-bold': item.attempts >= 3 }">
                {{ item.attempts }}/3
              </span>
            </td>
            <td class="text-truncate max-w-200 text-caption text-error">
              {{ item.lastError || '-' }}
            </td>
            <td class="text-caption text-medium-emphasis">
              {{ formatDate(item.createdAt) }}
            </td>
            <td class="text-center">
              <div class="d-flex align-center justify-center gap-1">
                <v-btn
                  icon
                  size="small"
                  variant="text"
                  color="primary"
                  title="Xem chi tiết Payload"
                  @click="openDetailModal(item)"
                >
                  <v-icon size="18">mdi-eye-outline</v-icon>
                </v-btn>
                <v-btn
                  icon
                  size="small"
                  variant="text"
                  color="warning"
                  title="Thực thi lại Webhook (Retry)"
                  :loading="retryingId === item.id"
                  :disabled="item.status === 'PROCESSED' && item.attempts < 3"
                  @click="handleRetryWebhook(item.id)"
                >
                  <v-icon size="18">mdi-refresh</v-icon>
                </v-btn>
              </div>
            </td>
          </tr>
        </tbody>
      </v-table>

      <!-- Pagination Footer -->
      <v-card-actions class="pa-4 border-t d-flex align-center justify-space-between">
        <div class="text-caption text-medium-emphasis">
          Hiển thị {{ pagination.totalItems > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0 }} -
          {{ Math.min(pagination.page * pagination.limit, pagination.totalItems) }} trên tổng số {{ pagination.totalItems }} bản ghi
        </div>
        <v-pagination
          v-model="pagination.page"
          :length="pagination.totalPages"
          :total-visible="5"
          density="compact"
          @update:model-value="fetchLogs"
        />
      </v-card-actions>
    </v-card>

    <!-- Detail Payload Modal -->
    <v-dialog v-model="showDetailModal" max-width="700">
      <v-card v-if="selectedLog" rounded="lg">
        <v-card-title class="pa-4 border-b d-flex align-center justify-space-between">
          <div class="d-flex align-center gap-2">
            <v-icon color="primary">mdi-code-json</v-icon>
            <span class="text-h6 font-weight-bold">Chi tiết Webhook Log #{{ selectedLog.id.substring(0, 8) }}</span>
          </div>
          <v-btn icon size="small" variant="text" @click="showDetailModal = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>

        <v-card-text class="pa-4">
          <div class="mb-3 d-flex gap-4">
            <div><strong>Event:</strong> {{ selectedLog.eventType }}</div>
            <div><strong>Status:</strong> {{ selectedLog.status }}</div>
            <div><strong>Attempts:</strong> {{ selectedLog.attempts }}/3</div>
          </div>

          <v-alert v-if="selectedLog.lastError" type="error" variant="tonal" class="mb-4 text-caption" density="compact">
            <strong>Last Error:</strong> {{ selectedLog.lastError }}
          </v-alert>

          <div class="text-caption font-weight-bold mb-1">Payload JSON:</div>
          <pre class="payload-json-box pa-3 rounded text-caption font-mono">{{ JSON.stringify(selectedLog.payload, null, 2) }}</pre>
        </v-card-text>

        <v-card-actions class="pa-4 border-t justify-end">
          <v-btn
            color="warning"
            variant="tonal"
            :loading="retryingId === selectedLog.id"
            @click="handleRetryWebhook(selectedLog.id)"
          >
            <v-icon left size="16" class="mr-1">mdi-refresh</v-icon> Retry Webhook này
          </v-btn>
          <v-btn variant="outlined" @click="showDetailModal = false">Đóng</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { api } from '@/api/index';
import { useToast } from '@/composables/use-toast';
import { createAppSocket } from '@/api/socket';

interface PosDashboardStats {
  totalOrdersSynced: number;
  totalDebtRecords: number;
  totalWebhookEvents: number;
  failedWebhooksCount: number;
  pendingWebhooksCount: number;
  processedWebhooksCount: number;
  syncHealth: 'healthy' | 'warning' | 'degraded';
  isSyncing: boolean;
  lastSyncedAt: string | null;
}

interface PosWebhookLog {
  id: string;
  orgId: string;
  eventType: string;
  payload: any;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
}

interface PaginationState {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

const toast = useToast();

// State
const loadingStats = ref(false);
const triggeringSync = ref(false);
const loadingLogs = ref(false);
const retryingId = ref<string | null>(null);

const stats = ref<PosDashboardStats>({
  totalOrdersSynced: 0,
  totalDebtRecords: 0,
  totalWebhookEvents: 0,
  failedWebhooksCount: 0,
  pendingWebhooksCount: 0,
  processedWebhooksCount: 0,
  syncHealth: 'healthy',
  isSyncing: false,
  lastSyncedAt: null,
});

const logs = ref<PosWebhookLog[]>([]);
const selectedStatus = ref<string>('');
const searchQuery = ref<string>('');
const pagination = ref<PaginationState>({
  page: 1,
  limit: 20,
  totalItems: 0,
  totalPages: 1,
});

const showDetailModal = ref(false);
const selectedLog = ref<PosWebhookLog | null>(null);

// Computeds
const healthColor = computed(() => {
  if (stats.value.syncHealth === 'degraded') return 'error';
  if (stats.value.syncHealth === 'warning') return 'warning';
  return 'success';
});

const healthIcon = computed(() => {
  if (stats.value.syncHealth === 'degraded') return 'mdi-alert-circle';
  if (stats.value.syncHealth === 'warning') return 'mdi-alert';
  return 'mdi-check-circle';
});

const healthText = computed(() => {
  if (stats.value.syncHealth === 'degraded') return 'Sự cố kết nối POS';
  if (stats.value.syncHealth === 'warning') return 'Cảnh báo lỗi Webhook';
  return 'Kết nối POS bình thường';
});

// Socket
const socket = createAppSocket();

onMounted(() => {
  fetchStats();
  fetchLogs();

  socket.on('pos:webhook:retried', () => {
    fetchStats();
    fetchLogs();
  });
  socket.on('pos:data:updated', () => {
    fetchStats();
    fetchLogs();
  });
  socket.on('pos:sync:progress', () => {
    fetchStats();
  });
});

onUnmounted(() => {
  socket.off('pos:webhook:retried');
  socket.off('pos:data:updated');
  socket.off('pos:sync:progress');
  socket.disconnect();
});

// Fetchers
async function fetchStats() {
  loadingStats.value = true;
  try {
    const res = await api.get('/pos/dashboard/stats');
    if (res.data?.success && res.data?.data) {
      stats.value = res.data.data;
    }
  } catch (err: any) {
    toast.error('Không thể lấy chỉ số thống kê đồng bộ POS');
  } finally {
    loadingStats.value = false;
  }
}

async function fetchLogs() {
  loadingLogs.value = true;
  try {
    const params: Record<string, any> = {
      page: pagination.value.page,
      limit: pagination.value.limit,
    };
    if (selectedStatus.value) {
      params.status = selectedStatus.value;
    }
    if (searchQuery.value) {
      params.search = searchQuery.value.trim();
    }

    const res = await api.get('/pos/webhooks/logs', { params });
    if (res.data?.success && res.data?.data) {
      logs.value = res.data.data.items;
      pagination.value = res.data.data.pagination;
    }
  } catch (err: any) {
    toast.error('Không thể lấy danh sách nhật ký webhook');
  } finally {
    loadingLogs.value = false;
  }
}

let searchTimeout: ReturnType<typeof setTimeout> | null = null;
function onSearchInput() {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    pagination.value.page = 1;
    fetchLogs();
  }, 400);
}

watch(selectedStatus, () => {
  pagination.value.page = 1;
  fetchLogs();
});

function filterByStatus(status: string) {
  selectedStatus.value = status;
}

// Handlers
async function handleTriggerSync() {
  triggeringSync.value = true;
  try {
    const res = await api.post('/pos/sync/trigger');
    if (res.data?.success) {
      toast.success(res.data.message || 'Đã kích hoạt đồng bộ POS');
      stats.value.isSyncing = true;
      fetchStats();
    }
  } catch (err: any) {
    const errMsg = err.response?.data?.error || err.message || 'Lỗi khi kích hoạt đồng bộ';
    toast.error(errMsg);
  } finally {
    triggeringSync.value = false;
  }
}

async function handleRetryWebhook(id: string) {
  retryingId.value = id;
  try {
    const res = await api.post(`/pos/webhooks/logs/${id}/retry`);
    if (res.data?.success) {
      toast.success('Thực thi lại Webhook thành công!');
    } else {
      toast.warn(res.data?.error || 'Thực thi lại Webhook chưa thành công');
    }
    await Promise.all([fetchStats(), fetchLogs()]);
    if (selectedLog.value && selectedLog.value.id === id) {
      const updated = logs.value.find((item) => item.id === id);
      if (updated) selectedLog.value = updated;
    }
  } catch (err: any) {
    const errMsg = err.response?.data?.error || err.message || 'Lỗi khi retry Webhook';
    toast.error(`Retry thất bại: ${errMsg}`);
  } finally {
    retryingId.value = null;
  }
}

function openDetailModal(item: PosWebhookLog) {
  selectedLog.value = item;
  showDetailModal.value = true;
}

// Formatters
function formatNumber(num: number): string {
  return new Intl.NumberFormat('vi-VN').format(num || 0);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function statusChipColor(status: string): string {
  if (status === 'PROCESSED') return 'success';
  if (status === 'FAILED') return 'error';
  return 'warning';
}

function statusChipIcon(status: string): string {
  if (status === 'PROCESSED') return 'mdi-check-circle-outline';
  if (status === 'FAILED') return 'mdi-alert-circle-outline';
  return 'mdi-clock-outline';
}
</script>

<style scoped>
.pos-sync-dashboard-container {
  min-height: calc(100vh - 48px);
  background-color: #f8fafc;
}

.border-b {
  border-bottom: 1px solid #e2e8f0;
}

.border-t {
  border-top: 1px solid #e2e8f0;
}

.border-error {
  border-color: #f87171 !important;
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

.gap-3 {
  gap: 12px;
}

.gap-4 {
  gap: 16px;
}

.bento-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  border-color: #e2e8f0;
}

.bento-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05) !important;
}

.font-mono {
  font-family: monospace, monospace;
}

.max-w-200 {
  max-width: 200px;
}

.payload-json-box {
  background-color: #0f172a;
  color: #38bdf8;
  max-height: 350px;
  overflow-y: auto;
  border-radius: 6px;
}
</style>
