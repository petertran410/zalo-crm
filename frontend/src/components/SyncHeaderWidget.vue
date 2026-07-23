<template>
  <div v-if="authStore.isAdmin" class="sync-widget-container">
    <!-- Topnav Trigger Button -->
    <v-menu v-model="menuOpen" :close-on-content-click="false" location="bottom end" offset="6">
      <template #activator="{ props }">
        <button v-bind="props" class="sync-trigger-btn" :class="{ 'is-running': runningJob }">
          <v-icon :class="{ 'spin-anim': runningJob }" size="16">mdi-sync</v-icon>
          <span v-if="runningJob" class="btn-text">
            {{ runningJob.entity === 'Customer' ? 'Khách hàng' : 'Sản phẩm' }}
            <span class="pct">{{ percent }}%</span>
          </span>
          <span v-else class="btn-text font-weight-medium">Đồng bộ</span>
        </button>
      </template>

      <!-- Sync Center Dropdown Panel -->
      <v-card class="sync-center-card" width="380">
        <div class="panel-header d-flex align-items-center justify-content-between px-4 py-3">
          <span class="panel-title font-weight-bold text-subtitle-1">Trung tâm đồng bộ POS</span>
          <v-btn icon="mdi-refresh" variant="text" size="small" :loading="isFetching" @click="fetchJobs" />
        </div>
        <v-divider />

        <!-- Trigger Sync Actions -->
        <div class="px-4 py-3 bg-grey-lighten-4 d-flex gap-2">
          <v-btn
            size="small"
            color="primary"
            prepend-icon="mdi-account-sync"
            :disabled="hasRunningJob"
            @click="triggerSync('Customer')"
          >
            Đồng bộ Khách hàng
          </v-btn>
          <v-btn
            size="small"
            color="secondary"
            prepend-icon="mdi-package-variant-closed"
            :disabled="hasRunningJob"
            @click="triggerSync('Product')"
          >
            Đồng bộ Sản phẩm
          </v-btn>
        </div>
        <v-divider />

        <v-card-text class="pa-0 sync-panel-body">
          <!-- Active Job Section -->
          <div v-if="runningJob" class="active-job-section px-4 py-3">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span class="font-weight-bold text-body-2">
                Đang đồng bộ {{ runningJob.entity === 'Customer' ? 'Khách hàng' : 'Sản phẩm' }}
              </span>
              <span class="text-caption text-primary font-weight-medium">{{ percent }}%</span>
            </div>

            <v-progress-linear
              :model-value="percent"
              color="primary"
              height="8"
              rounded
              class="mb-2"
            />

            <div class="d-flex justify-content-between align-items-center text-caption text-grey-darken-1">
              <span>{{ runningJob.processed.toLocaleString() }} / {{ runningJob.total.toLocaleString() }}</span>
              <span v-if="stats.speed > 0">{{ stats.speed }} req/s</span>
            </div>
            
            <div v-if="formattedEta" class="eta-badge mt-2 d-flex align-items-center gap-1 text-caption font-weight-medium">
              <v-icon size="12" color="warning">mdi-clock-outline</v-icon>
              <span>Thời gian còn lại: {{ formattedEta }}</span>
            </div>
          </div>

          <!-- Pending Job Section -->
          <div v-else-if="pendingJob" class="pending-job-section px-4 py-3 text-center text-grey-darken-1">
            <v-progress-circular indeterminate size="20" width="2" class="mr-2" color="primary" />
            <span class="text-body-2">Đang chờ khởi tạo tiến trình...</span>
          </div>

          <!-- History Section -->
          <div class="history-section">
            <div class="history-header px-4 py-2 text-caption text-grey font-weight-bold">
              LỊCH SỬ ĐỒNG BỘ GẦN ĐÂY
            </div>
            <v-divider />

            <div v-if="syncHistory.length === 0" class="px-4 py-6 text-center text-grey text-body-2">
              Chưa có lịch sử đồng bộ nào
            </div>

            <div v-else class="history-list">
              <div v-for="job in syncHistory.slice(0, 5)" :key="job.id" class="history-item px-4 py-2">
                <div class="d-flex justify-content-between align-items-center">
                  <div>
                    <div class="font-weight-medium text-body-2">
                      {{ job.entity === 'Customer' ? 'Khách hàng' : 'Sản phẩm' }}
                    </div>
                    <div class="text-caption text-grey">
                      {{ formatDate(job.startTime) }} • {{ job.processed.toLocaleString() }} dòng
                    </div>
                  </div>

                  <!-- Status Chip -->
                  <div class="d-flex align-items-center gap-2">
                    <span
                      class="status-dot"
                      :class="{
                        'status-completed': job.status === 'Completed',
                        'status-failed': job.status === 'Failed',
                        'status-cancelled': job.status === 'Cancelled'
                      }"
                    />
                    <span class="text-caption font-weight-medium text-capitalize text-grey-darken-2">
                      {{ translateStatus(job.status) }}
                    </span>
                    
                    <v-btn
                      v-if="job.status === 'Failed'"
                      icon="mdi-replay"
                      variant="text"
                      density="compact"
                      size="small"
                      color="error"
                      title="Thử lại"
                      @click="retrySync(job.id)"
                    />
                  </div>
                </div>

                <!-- Error message if Failed -->
                <div v-if="job.status === 'Failed' && job.lastError" class="error-msg-box mt-1 px-2 py-1 text-caption text-red-darken-3 bg-red-lighten-5 rounded">
                  Lỗi: {{ job.lastError }}
                </div>
              </div>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </v-menu>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useSync, getJobStats } from '@/composables/useSync';
import { useAuthStore } from '@/stores/auth';

const menuOpen = ref(false);
const authStore = useAuthStore();
const { activeJobs, syncHistory, isFetching, overallRunningJob, fetchJobs, startSync, retryJob } = useSync();

// Stats calculation ticker
const now = ref(Date.now());
let tickerInterval: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  tickerInterval = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (tickerInterval) clearInterval(tickerInterval);
});

const runningJob = computed(() => {
  return activeJobs.value.find(j => j.status === 'Running') || null;
});

const pendingJob = computed(() => {
  return activeJobs.value.find(j => j.status === 'Pending') || null;
});

const hasRunningJob = computed(() => !!runningJob.value || !!pendingJob.value);

const percent = computed(() => {
  const job = runningJob.value;
  if (!job || job.total <= 0) return 0;
  return Math.min(Math.round((job.processed / job.total) * 100), 100);
});

const stats = computed(() => {
  const job = runningJob.value;
  if (!job) return { speed: 0, eta: null };
  
  // Trick reactivity by referencing now.value
  const t = now.value;
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

const triggerSync = async (entity: 'Customer' | 'Product') => {
  try {
    await startSync(entity);
  } catch (err: any) {
    // Error is handled/logged in composable
  }
};

const retrySync = async (jobId: string) => {
  try {
    await retryJob(jobId);
  } catch (err: any) {
    // Error is handled
  }
};

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
  display: inline-block;
  margin-left: 2px;
}

.sync-trigger-btn {
  height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border-radius: 7px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.sync-trigger-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: white;
}

.sync-trigger-btn.is-running {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 0 10px rgba(91, 184, 229, 0.3);
}

.btn-text {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.pct {
  font-weight: 700;
  color: var(--nav-accent, #5bb8e5);
}

/* Dropdown Panel */
.sync-center-card {
  border-radius: 12px !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15) !important;
  overflow: hidden;
}

.panel-header {
  background: #f8fafc;
}

.sync-panel-body {
  max-height: 400px;
  overflow-y: auto;
}

.active-job-section {
  background: #f0f9ff;
  border-bottom: 1px solid #e0f2fe;
}

.eta-badge {
  background: #fffbeb;
  border: 1px solid #fef3c7;
  color: #b45309;
  padding: 4px 8px;
  border-radius: 6px;
  display: inline-flex;
  width: 100%;
}

.history-header {
  background: #f8fafc;
}

.history-list {
  display: flex;
  flex-direction: column;
}

.history-item {
  border-bottom: 1px solid #f1f5f9;
  transition: background 0.15s ease;
}

.history-item:last-child {
  border-bottom: none;
}

.history-item:hover {
  background: #f8fafc;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
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
  border: 1px solid #fca5a5;
  word-break: break-all;
}

/* Animations */
.spin-anim {
  animation: spin 2s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.gap-2 {
  gap: 8px;
}
</style>
