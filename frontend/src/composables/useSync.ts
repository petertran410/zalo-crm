import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { type Socket } from 'socket.io-client';
import { createAppSocket } from '@/api/socket';
import { api } from '@/api/index';
import { useAuthStore } from '@/stores/auth';

export interface SyncJob {
  id: string;
  entity: string;
  status: 'Pending' | 'Running' | 'Completed' | 'Failed' | 'Cancelled';
  total: number;
  processed: number;
  currentPage: number;
  errorCount: number;
  lastError: string | null;
  startTime: string;
  endTime: string | null;
}

export interface CustomerCohortState {
  rule: string;
  preview?: {
    completedAt: string;
    stats: {
      eligibleCustomers: number;
      debtPositive: number;
      debtNotPositive: number;
    };
    invoiceTimestamp: string | null;
    customerTimestamp: string | null;
  };
  import: {
    status: 'not_started' | 'archiving' | 'projecting' | 'completed' | 'failed';
    lastError?: string;
  };
}

const activeJobs = ref<SyncJob[]>([]);
const syncHistory = ref<SyncJob[]>([]);
const isFetching = ref(false);
/**
 * Đã lấy danh sách job từ server lần nào chưa (kể từ khi tải trang).
 * F5 giữa lúc đang đồng bộ: activeJobs rỗng cho tới khi GET /sync/jobs trả về.
 * Không có cờ này thì UI vẽ nhầm trạng thái "không có gì chạy" trong ~200ms
 * đầu, nhấp nháy rồi mới hiện lại thanh tiến trình.
 */
const hasLoadedOnce = ref(false);
/** Gỡ listener visibilitychange khi listener cuối cùng unmount. */
let onVisibilityChange: (() => void) | null = null;

let socket: Socket | null = null;
let listenersCount = 0;
/** Polling dự phòng khi socket trễ hoặc mất gói — chỉ chạy khi còn job active. */
let pollTimer: ReturnType<typeof setInterval> | null = null;

// Dynamic stats helper: calculates speed (records/sec) and ETA (seconds)
export function getJobStats(job: SyncJob) {
  if (job.status !== 'Running' || job.processed === 0) {
    return { speed: 0, eta: null };
  }
  const startTime = new Date(job.startTime).getTime();
  const now = Date.now();
  const elapsedSec = (now - startTime) / 1000;
  if (elapsedSec <= 0.5) return { speed: 0, eta: null };

  const speed = Math.round(job.processed / elapsedSec);
  // Chưa biết tổng (delta sync) thì không đoán ETA.
  if (job.total <= 0) return { speed, eta: null };

  const remaining = job.total - job.processed;
  if (remaining <= 0) return { speed, eta: 0 };

  const eta = speed > 0 ? Math.round(remaining / speed) : null;
  return { speed, eta };
}

export function useSync() {
  const authStore = useAuthStore();

  const fetchJobs = async () => {
    // Only fetch if admin
    if (!authStore.isAdmin) return;

    isFetching.value = true;
    try {
      const res = await api.get('/sync/jobs');
      const allJobs = (res.data || []) as SyncJob[];

      activeJobs.value = allJobs.filter(j => ['Pending', 'Running'].includes(j.status));
      syncHistory.value = allJobs.filter(j => ['Completed', 'Failed', 'Cancelled'].includes(j.status));
      hasLoadedOnce.value = true;
    } catch (err) {
      console.error('[useSync] Failed to fetch sync jobs:', err);
    } finally {
      isFetching.value = false;
    }
  };

  const startSync = async (entity: 'Customer' | 'Product' | 'Order' | 'Invoice' | 'BranchInventory' | 'All') => {
    if (!authStore.isAdmin) return;
    try {
      let path = '/sync/all';
      switch (entity) {
        case 'Customer': path = '/sync/customers'; break;
        case 'Product': path = '/sync/products'; break;
        case 'Order': path = '/sync/orders'; break;
        case 'Invoice': path = '/sync/invoices'; break;
        case 'BranchInventory': path = '/sync/inventory'; break;
        case 'All': path = '/sync/all'; break;
      }
      const res = await api.post(path);
      await fetchJobs();
      return res.data;
    } catch (err: any) {
      console.error('[useSync] Start sync failed:', err);
      throw err;
    }
  };

  const startCustomerPreview = async () => {
    if (!authStore.isAdmin) return;
    const res = await api.post('/sync/customer-cohort/preview');
    await fetchJobs();
    return res.data;
  };

  const startCustomerInitialImport = async () => {
    if (!authStore.isOwner) return;
    const res = await api.post('/sync/customer-cohort/initial-import');
    await fetchJobs();
    return res.data;
  };

  const fetchCustomerCohortState = async (): Promise<CustomerCohortState | undefined> => {
    if (!authStore.isAdmin) return undefined;
    const res = await api.get('/sync/customer-cohort');
    return res.data as CustomerCohortState;
  };

  const cancelJob = async (jobId: string) => {
    if (!authStore.isAdmin) return;
    try {
      const res = await api.post(`/sync/jobs/${jobId}/cancel`);
      await fetchJobs();
      return res.data;
    } catch (err: any) {
      console.error('[useSync] Cancel job failed:', err);
      throw err;
    }
  };

  const retryJob = async (jobId: string) => {
    if (!authStore.isAdmin) return;
    try {
      const res = await api.post(`/sync/jobs/${jobId}/retry`);
      await fetchJobs();
      return res.data;
    } catch (err: any) {
      console.error('[useSync] Retry job failed:', err);
      throw err;
    }
  };

  const handleSyncUpdate = (update: {
    jobId: string;
    entity: string;
    processed: number;
    total: number;
    status: SyncJob['status'];
    lastError?: string | null;
  }) => {
    // Update active jobs
    const activeIdx = activeJobs.value.findIndex(j => j.id === update.jobId);
    if (activeIdx !== -1) {
      const job = activeJobs.value[activeIdx];
      // Pending → Running: lấy lại mốc thời gian để tốc độ/ETA tính từ lúc
      // thực sự chạy, không tính cả quãng nằm chờ trong hàng đợi.
      if (job.status !== 'Running' && update.status === 'Running') {
        job.startTime = new Date().toISOString();
      }
      job.processed = update.processed;
      job.total = update.total;
      job.status = update.status;
      if (update.lastError !== undefined) job.lastError = update.lastError;

      // If status changed to finished, move it to history
      if (['Completed', 'Failed', 'Cancelled'].includes(update.status)) {
        activeJobs.value.splice(activeIdx, 1);
        job.endTime = new Date().toISOString();
        syncHistory.value.unshift(job);
      }
    } else {
      // Check history
      const histIdx = syncHistory.value.findIndex(j => j.id === update.jobId);
      if (histIdx !== -1) {
        const job = syncHistory.value[histIdx];
        job.processed = update.processed;
        job.total = update.total;
        job.status = update.status;
        if (update.lastError !== undefined) job.lastError = update.lastError;
      } else {
        // New job detected via socket, add to active or history
        const newJob: SyncJob = {
          id: update.jobId,
          entity: update.entity,
          status: update.status,
          total: update.total,
          processed: update.processed,
          currentPage: 0,
          errorCount: update.lastError ? 1 : 0,
          lastError: update.lastError ?? null,
          startTime: new Date().toISOString(),
          endTime: ['Completed', 'Failed', 'Cancelled'].includes(update.status) ? new Date().toISOString() : null
        };

        if (['Pending', 'Running'].includes(update.status)) {
          activeJobs.value.unshift(newJob);
        } else {
          syncHistory.value.unshift(newJob);
        }
      }
    }
  };

  const ensureSocket = () => {
    if (!authStore.isAuthenticated || !authStore.isAdmin) return;

    if (!socket) {
      socket = createAppSocket();
      
      socket.on('connect', () => {
        const orgId = authStore.user?.orgId;
        if (orgId && socket) {
          socket.emit('org:join', { orgId });
        }
        // Mọi event phát ra trong lúc socket chưa nối/bị rớt đều mất vĩnh viễn.
        // Refetch sau mỗi lần (re)connect để trạng thái job khớp lại với DB,
        // nếu không UI kẹt ở "Đang khởi tạo tiến trình" dù backend đã chạy.
        void fetchJobs();
      });

      socket.on('pos:sync:update', (data: any) => {
        handleSyncUpdate(data);
      });
    }
  };

  // Widget nằm trong layout nên mount NGAY lúc boot, trước khi fetchProfile()
  // trả về → isAdmin còn false. Trước đây socket + poll chỉ khởi tạo một lần
  // trong onMounted với guard isAdmin, nên khi profile về muộn thì KHÔNG bao
  // giờ có socket lẫn poll: job đứng mãi ở Pending dù backend đã Running.
  // Tách ra hàm riêng và watch isAdmin để khởi tạo lại đúng thời điểm.
  const startWatching = () => {
    if (!authStore.isAdmin) return;
    ensureSocket();
    void fetchJobs();
    // Socket có thể rớt gói hoặc mất kết nối giữa chừng; poll nhẹ 3 giây một
    // lần khi đang có job chạy để thanh tiến trình không đứng hình.
    if (!pollTimer) {
      pollTimer = setInterval(() => {
        if (activeJobs.value.length > 0) void fetchJobs();
      }, 3000);
    }

    // Trình duyệt bóp timer của tab chạy nền (throttle tới 1 phút), và socket
    // hay bị ngắt khi máy ngủ. Quay lại tab thì đồng bộ lại ngay từ DB.
    if (!onVisibilityChange) {
      onVisibilityChange = () => {
        if (document.visibilityState === 'visible') void fetchJobs();
      };
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
  };

  onMounted(() => {
    listenersCount++;
    startWatching();
  });

  // Profile về sau lúc mount (F5 trang) → khởi tạo socket/poll ngay khi biết
  // user là admin.
  watch(
    () => authStore.isAdmin && authStore.isAuthenticated,
    (ok) => { if (ok) startWatching(); },
  );

  onUnmounted(() => {
    listenersCount--;
    if (listenersCount <= 0) {
      if (socket) {
        socket.disconnect();
        socket = null;
      }
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (onVisibilityChange) {
        document.removeEventListener('visibilitychange', onVisibilityChange);
        onVisibilityChange = null;
      }
    }
  });

  const overallRunningJob = computed(() => {
    return activeJobs.value.find(j => j.status === 'Running') || null;
  });

  return {
    activeJobs,
    syncHistory,
    isFetching,
    hasLoadedOnce,
    overallRunningJob,
    fetchJobs,
    startSync,
    startCustomerPreview,
    startCustomerInitialImport,
    fetchCustomerCohortState,
    cancelJob,
    retryJob
  };
}
