import { ref, onMounted, onUnmounted, computed } from 'vue';
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

const activeJobs = ref<SyncJob[]>([]);
const syncHistory = ref<SyncJob[]>([]);
const isFetching = ref(false);

let socket: Socket | null = null;
let listenersCount = 0;

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
    } catch (err) {
      console.error('[useSync] Failed to fetch sync jobs:', err);
    } finally {
      isFetching.value = false;
    }
  };

  const startSync = async (entity: 'Customer' | 'Product') => {
    if (!authStore.isAdmin) return;
    try {
      const path = entity === 'Customer' ? '/sync/customers' : '/sync/products';
      const res = await api.post(path);
      await fetchJobs();
      return res.data;
    } catch (err: any) {
      console.error('[useSync] Start sync failed:', err);
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
      });

      socket.on('pos:sync:update', (data: any) => {
        handleSyncUpdate(data);
      });
    }
  };

  onMounted(() => {
    listenersCount++;
    ensureSocket();
    if (authStore.isAdmin) {
      fetchJobs();
    }
  });

  onUnmounted(() => {
    listenersCount--;
    if (listenersCount <= 0 && socket) {
      socket.disconnect();
      socket = null;
    }
  });

  const overallRunningJob = computed(() => {
    return activeJobs.value.find(j => j.status === 'Running') || null;
  });

  return {
    activeJobs,
    syncHistory,
    isFetching,
    overallRunningJob,
    fetchJobs,
    startSync,
    retryJob
  };
}
