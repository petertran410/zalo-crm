<template>
  <div v-if="authStore.isAdmin" ref="menuRoot" class="sync-widget-container">
    <!-- Topnav Trigger Button -->
    <button
      ref="activator"
      type="button"
      class="sync-trigger-btn"
      :class="{ 'is-running': runningJob, 'is-open': menuOpen }"
      :title="runningJob ? `Đang đồng bộ ${getEntityName(runningJob.entity)}${hasKnownTotal ? `: ${percent}%` : ''}` : 'Mở trung tâm đồng bộ POS'"
      :aria-label="runningJob ? `Đang đồng bộ ${getEntityName(runningJob.entity)}${hasKnownTotal ? `: ${percent}%` : ''}` : 'Mở trung tâm đồng bộ POS'"
      :aria-expanded="menuOpen"
      aria-haspopup="dialog"
      @click.stop="toggleMenu"
      @keydown.escape="closeMenu"
    >
      <RefreshCw :class="{ 'spin-anim': runningJob }" :size="17" :stroke-width="1.9" />
      <span v-if="runningJob" class="btn-text">
        {{ getEntityName(runningJob.entity) }}
        <span v-if="hasKnownTotal" class="pct">{{ percent }}%</span>
      </span>
      <span v-else class="btn-text font-weight-medium">Đồng bộ POS</span>
    </button>

    <!--
      Không dùng v-menu/VOverlay: overlay Vuetify teleport sang document.body.
      Khi mở, overlay + scrim/layer che toàn bộ WorkspaceShell phía sau → màn trắng.
      Pattern giống NavSettingsMenu: panel DOM nội tuyến, position absolute.
    -->
    <div
      v-if="menuOpen"
      class="sync-center-card"
      role="dialog"
      aria-label="Trung tâm đồng bộ POS"
      @click.stop
    >
      <div class="panel-header">
        <div class="panel-header-left">
          <CloudSync class="panel-header-icon" :size="20" :stroke-width="1.9" />
          <span class="panel-title">Trung tâm đồng bộ POS</span>
        </div>
        <button
          type="button"
          class="panel-icon-btn"
          :disabled="isFetching"
          title="Tải lại"
          aria-label="Tải lại"
          @click="fetchJobs"
        >
          <RefreshCw :class="{ 'spin-anim': isFetching }" :size="16" :stroke-width="1.9" />
        </button>
      </div>
      <div class="panel-divider" />

      <!-- Customer initialization is intentionally separate from ordinary sync:
           preview has no writes, while the first owner import archives contacts reversibly. -->
      <div class="customer-cohort-actions">
        <button
          type="button"
          class="sync-action-btn sync-action-btn--preview"
          :disabled="hasRunningJob"
          title="Quét cohort khách POS, không ghi dữ liệu"
          @click="triggerCustomerPreview"
        >
          Xem trước KH
        </button>
        <button
          v-if="authStore.isOwner && customerCohortState?.import.status !== 'completed'"
          type="button"
          class="sync-action-btn sync-action-btn--initial-import"
          :disabled="hasRunningJob || !hasFreshCustomerPreview"
          :title="hasFreshCustomerPreview
            ? 'Archive mềm Contact hiện có rồi nhập cohort POS đã xem trước'
            : 'Cần xem trước cohort thành công trong 24 giờ trước'"
          @click="triggerCustomerInitialImport"
        >
          Nhập KH lần đầu
        </button>
        <span v-if="customerCohortState?.preview" class="customer-cohort-summary">
          {{ customerCohortState.preview.stats.eligibleCustomers.toLocaleString() }} KH đã chọn
        </span>
        <span
          class="customer-cohort-status"
          :class="{
            'customer-cohort-status--ready': customerCohortState?.import.status === 'completed',
            'customer-cohort-status--error': customerCohortState?.import.status === 'failed',
          }"
        >
          {{ customerCohortStatusText }}
        </span>
      </div>
      <div class="actions-bar">
        <button
          type="button"
          class="sync-action-btn sync-action-btn--primary"
          :disabled="hasRunningJob || customerCohortState?.import.status !== 'completed'"
          :title="customerCohortState?.import.status === 'completed'
            ? 'Đồng bộ cohort khách hàng POS'
            : 'Hoàn tất nhập khách hàng POS lần đầu trước'"
          @click="triggerSync('Customer')"
        >
          KH
        </button>
        <button type="button" class="sync-action-btn sync-action-btn--secondary" :disabled="hasRunningJob" @click="triggerSync('Product')">
          Sản phẩm
        </button>
        <button type="button" class="sync-action-btn sync-action-btn--info" :disabled="hasRunningJob" @click="triggerSync('Order')">
          Đơn hàng
        </button>
        <button type="button" class="sync-action-btn sync-action-btn--warning" :disabled="hasRunningJob" @click="triggerSync('BranchInventory')">
          Tồn kho
        </button>
        <button
          type="button"
          class="sync-action-btn sync-action-btn--success"
          :disabled="hasRunningJob || customerCohortState?.import.status !== 'completed'"
          :title="customerCohortState?.import.status === 'completed'
            ? 'Đồng bộ toàn bộ dữ liệu POS'
            : 'Hoàn tất nhập khách hàng POS lần đầu trước'"
          @click="triggerSync('All')"
        >
          Tất cả
        </button>
      </div>
      <div class="panel-divider" />

      <div class="sync-panel-body">
        <!-- Active Job Progress Section -->
        <div v-if="runningJob" class="active-job-section">
          <div class="active-job-row">
            <span class="active-job-title">
              Đang đồng bộ {{ getEntityName(runningJob.entity) }}
            </span>
            <div class="active-job-right">
              <span class="active-job-pct">{{ hasKnownTotal ? `${percent}%` : '…' }}</span>
              <button
                type="button"
                class="stop-btn"
                :disabled="cancelling"
                title="Dừng tiến trình đồng bộ"
                aria-label="Dừng tiến trình đồng bộ"
                @click="cancelSync(runningJob.id)"
              >
                <Square :size="12" :stroke-width="2.4" />
                <span>{{ cancelling ? 'Đang dừng…' : 'Dừng' }}</span>
              </button>
            </div>
          </div>

          <!--
            Chưa biết tổng (delta sync, hoặc trang đầu chưa trả total) thì dùng
            thanh chạy vô định thay vì để thanh 0% đứng im như bị treo.
          -->
          <div
            class="progress-track"
            role="progressbar"
            :aria-valuenow="hasKnownTotal ? percent : undefined"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div
              v-if="hasKnownTotal"
              class="progress-fill"
              :style="{ width: `${percent}%` }"
            />
            <div v-else class="progress-fill progress-fill--indeterminate" />
          </div>

          <div class="active-job-meta">
            <span>
              {{ runningJob.processed.toLocaleString() }}
              <template v-if="hasKnownTotal"> / {{ runningJob.total.toLocaleString() }}</template>
              bản ghi
            </span>
            <span v-if="stats.speed > 0">{{ stats.speed }} bản ghi/s</span>
          </div>

          <div v-if="formattedEta" class="eta-badge">
            <Clock :size="14" :stroke-width="1.9" />
            <span>Thời gian còn lại: {{ formattedEta }}</span>
          </div>
        </div>

        <!-- Khôi phục sau F5: chưa fetch xong thì chưa biết có job đang chạy hay
             không. Hiện dòng chờ thay vì để trống rồi nhấp nháy ra thanh tiến trình. -->
        <div v-else-if="!hasLoadedOnce" class="pending-job-section">
          <span class="pending-spinner" aria-hidden="true" />
          <span class="pending-text">Đang tải trạng thái đồng bộ...</span>
        </div>

        <!-- Pending Job Section -->
        <div v-else-if="pendingJob" class="pending-job-section">
          <span class="pending-spinner" aria-hidden="true" />
          <span class="pending-text">Đang khởi tạo tiến trình {{ getEntityName(pendingJob.entity) }}...</span>
          <button
            type="button"
            class="stop-btn"
            :disabled="cancelling"
            title="Hủy tiến trình đồng bộ"
            aria-label="Hủy tiến trình đồng bộ"
            @click="cancelSync(pendingJob.id)"
          >
            <Square :size="12" :stroke-width="2.4" />
            <span>{{ cancelling ? 'Đang hủy…' : 'Hủy' }}</span>
          </button>
        </div>

        <!-- History Section -->
        <div class="history-section">
          <div class="history-header">
            LỊCH SỬ ĐỒNG BỘ GẦN ĐÂY
          </div>
          <div class="panel-divider" />

          <div v-if="syncHistory.length === 0" class="history-empty">
            Chưa có lịch sử đồng bộ nào
          </div>

          <div v-else class="history-list">
            <div v-for="job in syncHistory.slice(0, 5)" :key="job.id" class="history-item">
              <div class="history-item-row">
                <div>
                  <div class="history-item-title">
                    {{ getEntityName(job.entity) }}
                  </div>
                  <div class="history-item-meta">
                    {{ formatDate(job.startTime) }} • {{ job.processed.toLocaleString() }} bản ghi
                  </div>
                </div>

                <div class="history-item-status">
                  <span
                    class="status-dot"
                    :class="{
                      'status-completed': job.status === 'Completed',
                      'status-failed': job.status === 'Failed',
                      'status-cancelled': job.status === 'Cancelled'
                    }"
                  />
                  <span class="status-label">
                    {{ translateStatus(job.status) }}
                  </span>

                  <button
                    v-if="['Failed', 'Cancelled'].includes(job.status)"
                    type="button"
                    class="panel-icon-btn panel-icon-btn--error"
                    title="Chạy lại"
                    aria-label="Chạy lại"
                    @click="retrySync(job.id)"
                  >
                    <RotateCcw :size="15" :stroke-width="1.9" />
                  </button>
                </div>
              </div>

              <div v-if="job.status === 'Failed' && job.lastError" class="error-msg-box">
                Lỗi: {{ job.lastError }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Trung tâm đồng bộ POS trên header.
 * Panel DOM nội tuyến (không v-menu/VOverlay) — tránh overlay teleport body
 * che trắng toàn bộ app khi mở dropdown.
 */
import { ref, computed, onMounted, onUnmounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { RefreshCw, CloudSync, Clock, RotateCcw, Square } from 'lucide-vue-next';
import { useSync, getJobStats, type CustomerCohortState } from '@/composables/useSync';
import { useAuthStore } from '@/stores/auth';

const menuOpen = ref(false);
const menuRoot = ref<HTMLElement | null>(null);
const activator = ref<HTMLButtonElement | null>(null);
const authStore = useAuthStore();
const {
  activeJobs,
  syncHistory,
  isFetching,
  hasLoadedOnce,
  fetchJobs,
  startSync,
  startCustomerPreview,
  startCustomerInitialImport,
  fetchCustomerCohortState,
  cancelJob,
  retryJob,
} = useSync();
const customerCohortState = ref<CustomerCohortState | null>(null);
const cancelling = ref(false);

const now = ref(Date.now());
let tickerInterval: ReturnType<typeof setInterval> | null = null;

function closeMenu() {
  menuOpen.value = false;
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!menuRoot.value?.contains(event.target as Node)) closeMenu();
}

function onDocumentKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeMenu();
    void nextTick(() => activator.value?.focus());
  }
}

watch(menuOpen, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onDocumentPointerDown);
    document.addEventListener('keydown', onDocumentKeyDown);
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown);
    document.removeEventListener('keydown', onDocumentKeyDown);
  }
});

onMounted(() => {
  tickerInterval = setInterval(() => {
    now.value = Date.now();
  }, 1000);
  void loadCustomerCohortState();
});

onUnmounted(() => {
  if (tickerInterval) clearInterval(tickerInterval);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  document.removeEventListener('keydown', onDocumentKeyDown);
});

const runningJob = computed(() => {
  return activeJobs.value.find(j => j.status === 'Running') || null;
});

const pendingJob = computed(() => {
  return activeJobs.value.find(j => j.status === 'Pending') || null;
});

const hasRunningJob = computed(() => !!runningJob.value || !!pendingJob.value);

const hasFreshCustomerPreview = computed(() => {
  // The preview expires while this panel can remain open for hours.
  void now.value;
  const completedAt = customerCohortState.value?.preview?.completedAt;
  if (!completedAt) return false;
  const completedMs = new Date(completedAt).getTime();
  return Number.isFinite(completedMs) && Date.now() - completedMs <= 24 * 60 * 60 * 1000;
});

const customerCohortStatusText = computed(() => {
  const status = customerCohortState.value?.import.status;
  if (status === 'completed') return 'Đã nhập — đồng bộ thường kỳ sẵn sàng';
  if (status === 'failed') return 'Lần nhập trước thất bại — cần chạy lại';
  if (status === 'archiving' || status === 'projecting') return 'Đang nhập cohort khách hàng';
  if (hasFreshCustomerPreview.value) return 'Preview còn hiệu lực 24 giờ';
  if (customerCohortState.value?.preview) return 'Preview đã hết hạn — cần quét lại';
  return 'Preview chỉ đọc trước khi nhập lần đầu';
});

const hasKnownTotal = computed(() => {
  const job = runningJob.value;
  return !!job && job.total > 0 && job.total >= job.processed;
});

const percent = computed(() => {
  const job = runningJob.value;
  if (!job || job.total <= 0) return 0;
  return Math.min(Math.round((job.processed / job.total) * 100), 100);
});

const stats = computed(() => {
  const job = runningJob.value;
  if (!job || now.value <= 0) return { speed: 0, eta: null };
  return getJobStats(job);
});

const formattedEta = computed(() => {
  const etaSec = stats.value.eta;
  if (etaSec === null) return '';
  if (etaSec < 60) return `${etaSec} giây`;
  const mins = Math.floor(etaSec / 60);
  const secs = etaSec % 60;
  return `${mins} phút ${secs} giây`;
});

const triggerSync = async (entity: 'Customer' | 'Product' | 'Order' | 'Invoice' | 'BranchInventory' | 'All') => {
  try {
    await startSync(entity);
  } catch (err: any) {
    console.error('[SyncHeaderWidget] Trigger sync failed:', err);
  }
};

const triggerCustomerPreview = async () => {
  try {
    await startCustomerPreview();
  } catch (err: any) {
    console.error('[SyncHeaderWidget] Customer preview failed to start:', err);
  }
};

const triggerCustomerInitialImport = async () => {
  if (!hasFreshCustomerPreview.value) return;
  try {
    await startCustomerInitialImport();
  } catch (err: any) {
    console.error('[SyncHeaderWidget] Initial customer import failed to start:', err);
  }
};

async function loadCustomerCohortState() {
  try {
    customerCohortState.value = (await fetchCustomerCohortState()) ?? null;
  } catch (err: any) {
    console.error('[SyncHeaderWidget] Failed to fetch customer cohort state:', err);
  }
}

const cancelSync = async (jobId: string) => {
  if (cancelling.value) return;
  cancelling.value = true;
  try {
    await cancelJob(jobId);
  } catch (err: any) {
    console.error('[SyncHeaderWidget] Cancel job failed:', err);
  } finally {
    cancelling.value = false;
  }
};

const retrySync = async (jobId: string) => {
  try {
    await retryJob(jobId);
  } catch (err: any) {
    console.error('[SyncHeaderWidget] Retry job failed:', err);
  }
};

watch(
  () => activeJobs.value.length,
  (length, previousLength) => {
    if (previousLength > 0 && length === 0) void loadCustomerCohortState();
  },
);

function getEntityName(entity: string): string {
  switch (entity) {
    case 'Customer': return 'Khách hàng';
    case 'Product': return 'Sản phẩm';
    case 'Order': return 'Đơn hàng';
    case 'Invoice': return 'Hóa đơn';
    case 'BranchInventory': return 'Tồn kho chi nhánh';
    case 'All': return 'Toàn bộ dữ liệu';
    default: return entity;
  }
}

function formatDate(isoString: string) {
  try {
    const d = new Date(isoString);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} ${d.getDate()}/${d.getMonth() + 1}`;
  } catch {
    return isoString;
  }
}

function translateStatus(status: string) {
  switch (status) {
    case 'Completed': return 'Hoàn thành';
    case 'Failed': return 'Thất bại';
    case 'Cancelled': return 'Đã hủy';
    case 'Running': return 'Đang chạy';
    case 'Pending': return 'Đang chờ';
    default: return status;
  }
}
</script>

<style scoped>
.sync-widget-container {
  position: relative;
  display: inline-block;
  margin-left: 2px;
}

.sync-trigger-btn {
  width: 32px;
  height: 32px;
  min-width: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0;
  border-radius: var(--app-radius-md);
  font-size: 13px;
  color: var(--shell-ink-2, #a8b0c0);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background .15s ease, color .15s ease;
  white-space: nowrap;
}
.sync-trigger-btn:hover,
.sync-trigger-btn.is-open {
  background: rgba(255, 255, 255, 0.08);
  color: var(--shell-ink, #f2f4f8);
}
.sync-trigger-btn:focus-visible { outline: 2px solid var(--nav-accent, var(--app-accent)); outline-offset: 2px; }
/* Only a running operation may expand into a compact progress label. Idle sync
   stays icon-only, so it no longer competes with the global nav or search. */
.sync-trigger-btn.is-running {
  width: auto;
  max-width: 150px;
  padding: 0 9px;
  background: color-mix(in srgb, var(--nav-accent, var(--app-accent)) 18%, transparent);
  color: var(--shell-ink, #f2f4f8);
  border: 1px solid color-mix(in srgb, var(--nav-accent, var(--app-accent)) 45%, transparent);
}
.sync-trigger-btn.is-running .btn-text { overflow: hidden; text-overflow: ellipsis; }
.sync-trigger-btn:not(.is-running) .btn-text { display: none; }

.btn-text {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.pct {
  font-weight: 700;
  /* Fallback đồng bộ bảng màu nav mới (revamp 2026-08-05). Widget này mount ở cả
     DefaultLayout lẫn SalesLayout; SalesLayout tự ghim --nav-accent màu cũ nên
     vỏ Sales không đổi. */
  color: var(--nav-accent, var(--app-accent));
}

/* Panel nội tuyến — không teleport, không scrim full-screen */
.sync-center-card {
  position: absolute;
  z-index: 2100;
  top: calc(100% + 8px);
  right: 0;
  width: 400px;
  max-width: min(400px, calc(100vw - 24px));
  border-radius: 12px;
  border: 1px solid var(--app-border-subtle, #e2e8f0);
  background: var(--app-surface-panel, #fff);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  color: var(--app-text-primary, #252a36);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #f8fafc;
}

.panel-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.panel-header-icon {
  flex: 0 0 auto;
  color: var(--app-accent, #0068ff);
}

.panel-title {
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.3;
}

.panel-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--app-text-secondary, #64748b);
  cursor: pointer;
}
.panel-icon-btn:hover:not(:disabled) {
  background: var(--app-surface-hover, #f1f5f9);
  color: var(--app-text-primary, #252a36);
}
.panel-icon-btn:disabled {
  opacity: 0.55;
  cursor: default;
}
.panel-icon-btn--error {
  color: #dc2626;
}

.panel-divider {
  height: 1px;
  background: var(--app-border-subtle, #e2e8f0);
}

.customer-cohort-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px 4px;
  background: #f8fafc;
}

.customer-cohort-actions .sync-action-btn {
  flex: 0 0 auto;
}

.sync-action-btn--preview {
  background: color-mix(in srgb, #0f766e 14%, #fff);
  color: #0f766e;
}

.sync-action-btn--initial-import {
  background: color-mix(in srgb, #c2410c 14%, #fff);
  color: #c2410c;
}

.customer-cohort-summary,
.customer-cohort-status {
  font-size: 0.7rem;
  line-height: 1.3;
}

.customer-cohort-summary {
  padding: 3px 7px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #475569;
  font-weight: 700;
}

.customer-cohort-status {
  flex-basis: 100%;
  color: #64748b;
}

.customer-cohort-status--ready {
  color: #15803d;
}

.customer-cohort-status--error {
  color: #b91c1c;
}

.actions-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px 12px;
  background: #f1f5f9;
}

.sync-action-btn {
  appearance: none;
  border: none;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  cursor: pointer;
  transition: opacity .15s ease, filter .15s ease;
}
.sync-action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.sync-action-btn--primary {
  background: color-mix(in srgb, var(--app-accent, #0068ff) 16%, #fff);
  color: var(--app-accent, #0068ff);
}
.sync-action-btn--secondary {
  background: color-mix(in srgb, #7c3aed 14%, #fff);
  color: #6d28d9;
}
.sync-action-btn--info {
  background: color-mix(in srgb, #0ea5e9 16%, #fff);
  color: #0284c7;
}
.sync-action-btn--warning {
  background: color-mix(in srgb, #f59e0b 18%, #fff);
  color: #b45309;
}
.sync-action-btn--success {
  background: #16a34a;
  color: #fff;
}
.sync-action-btn:not(:disabled):hover {
  filter: brightness(0.97);
}

.sync-panel-body {
  max-height: 420px;
  overflow-y: auto;
}

.active-job-section {
  padding: 12px 16px;
  background: #f0f9ff;
  border-bottom: 1px solid #e0f2fe;
}

.active-job-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.active-job-title {
  font-size: 0.875rem;
  font-weight: 700;
}

.active-job-pct {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--app-accent, #0068ff);
}

.active-job-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stop-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border: 1px solid #fecaca;
  border-radius: 999px;
  background: #fef2f2;
  color: #dc2626;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease;
}

.stop-btn:hover:not(:disabled) {
  background: #fee2e2;
  border-color: #fca5a5;
}

.stop-btn:disabled {
  opacity: .6;
  cursor: not-allowed;
}

.pending-text {
  flex: 1;
}

.progress-track {
  height: 8px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--app-accent, #0068ff);
  transition: width .25s ease;
}

/* Chưa biết tổng số bản ghi: chạy qua lại để thể hiện "đang chạy". */
.progress-fill--indeterminate {
  width: 35%;
  transition: none;
  animation: progress-slide 1.1s ease-in-out infinite;
}

@keyframes progress-slide {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(320%); }
}

@media (prefers-reduced-motion: reduce) {
  .progress-fill--indeterminate {
    animation-duration: 2.4s;
  }
}

.active-job-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  color: #64748b;
}

.eta-badge {
  margin-top: 8px;
  background: #fffbeb;
  border: 1px solid #fef3c7;
  color: #b45309;
  padding: 4px 8px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  font-size: 0.75rem;
  font-weight: 600;
  box-sizing: border-box;
}

.pending-job-section {
  padding: 12px 16px;
  color: #64748b;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 8px;
}

.pending-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #cbd5e1;
  border-top-color: var(--app-accent, #0068ff);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex: 0 0 auto;
}

.history-header {
  padding: 8px 16px;
  background: #f8fafc;
  font-size: 0.75rem;
  font-weight: 700;
  color: #94a3b8;
  letter-spacing: 0.02em;
}

.history-empty {
  padding: 24px 16px;
  text-align: center;
  color: #94a3b8;
  font-size: 0.875rem;
}

.history-list {
  display: flex;
  flex-direction: column;
}

.history-item {
  padding: 8px 16px;
  border-bottom: 1px solid #f1f5f9;
  transition: background 0.15s ease;
}

.history-item:last-child {
  border-bottom: none;
}

.history-item:hover {
  background: #f8fafc;
}

.history-item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.history-item-title {
  font-size: 0.875rem;
  font-weight: 600;
}

.history-item-meta {
  font-size: 0.75rem;
  color: #94a3b8;
}

.history-item-status {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.status-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #475569;
  text-transform: capitalize;
}

.status-completed {
  background-color: #22c55e;
  box-shadow: 0 0 6px #22c55e;
}

.status-failed {
  background-color: #ef4444;
  box-shadow: 0 0 6px #ef4444;
}

.status-cancelled {
  background-color: #64748b;
}

.error-msg-box {
  margin-top: 4px;
  padding: 4px 8px;
  border: 1px solid #fca5a5;
  border-radius: 6px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 0.75rem;
  word-break: break-all;
}

.spin-anim {
  animation: spin 2s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* topnav / actions bar thường overflow:hidden — nới khi panel mở để không cắt dropdown */
:global(.smax-topnav .topnav-actions:has(.sync-center-card)),
:global(.smax-topnav:has(.sync-center-card)) {
  overflow: visible;
}
</style>
