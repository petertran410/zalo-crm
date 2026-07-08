/**
 * use-tasks.ts — Công việc (Task V1, 2026-07-07): composable CRUD + helpers hạn.
 *
 * Pattern theo use-appointments.ts: interface + state + API calls tại đây,
 * view/component gọi composable, KHÔNG qua Pinia store.
 *
 * Hạn (dueAt) là UTC instant; so sánh "quá hạn / hôm nay" bằng orgDayKey (múi giờ ORG,
 * offset cố định) — khớp công thức backend (task-time.ts) để bell và UI thống nhất.
 * Luật V1: task có giờ, đến hạn HÔM NAY nhưng qua giờ → vẫn "Hôm nay" (chưa quá hạn);
 * chỉ quá hạn khi qua nửa đêm org.
 */
import { ref, reactive } from 'vue';
import { api } from '@/api/index';
import { orgDayKey, getOrgParts, formatInOrgTz } from '@/composables/use-org-timezone';

export interface TaskUserLite {
  id: string;
  fullName: string | null;
  email?: string;
  avatarUrl?: string | null;
}

export interface TaskContactLite {
  id: string;
  fullName: string | null;
  phone: string | null;
  avatarUrl?: string | null;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'done';
  dueAt: string | null;
  dueHasTime: boolean;
  assigneeUserId: string;
  assignee?: TaskUserLite | null;
  createdBy?: TaskUserLite | null;
  contactId: string | null;
  contact?: TaskContactLite | null;
  doneAt: string | null;
  doneBy?: TaskUserLite | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskFilters {
  view: 'mine' | 'all';
  status: 'open' | 'done' | 'all';
  assigneeUserId: string;
}

export interface TaskPayload {
  title: string;
  description?: string | null;
  assigneeUserId?: string;
  contactId?: string | null;
  dueAt?: string | null;
  dueHasTime?: boolean;
}

/** Quá hạn = đang mở + có hạn + NGÀY hạn (org TZ) < NGÀY hôm nay (org TZ). */
export function isOverdue(t: Pick<Task, 'status' | 'dueAt'>, now: Date = new Date()): boolean {
  if (t.status !== 'open' || !t.dueAt) return false;
  const due = orgDayKey(t.dueAt);
  const today = orgDayKey(now);
  return !!due && !!today && due < today;
}

/** Đến hạn hôm nay (org TZ) — dùng cho chip cam "Hôm nay". */
export function isDueToday(t: Pick<Task, 'dueAt'>, now: Date = new Date()): boolean {
  if (!t.dueAt) return false;
  const due = orgDayKey(t.dueAt);
  return !!due && due === orgDayKey(now);
}

/** Nhãn hạn thân thiện: Hôm qua/Hôm nay/Ngày mai, xa hơn → dd/mm/yyyy (+ giờ nếu dueHasTime). */
export function dueLabel(t: Pick<Task, 'dueAt' | 'dueHasTime'>, now: Date = new Date()): string {
  if (!t.dueAt) return '';
  const dueKey = orgDayKey(t.dueAt);
  const todayKey = orgDayKey(now);
  let day: string;
  if (dueKey === todayKey) {
    day = 'Hôm nay';
  } else {
    // diff ngày qua epoch-ngày org (dayKey dạng YYYY-MM-DD so sánh chuẩn từ điển)
    const d1 = new Date(dueKey + 'T00:00:00Z').getTime();
    const d0 = new Date(todayKey + 'T00:00:00Z').getTime();
    const diff = Math.round((d1 - d0) / 86400000);
    if (diff === -1) day = 'Hôm qua';
    else if (diff === 1) day = 'Ngày mai';
    else if (diff === 2) day = 'Ngày mốt';
    else day = formatInOrgTz(t.dueAt, undefined, { dateOnly: true });
  }
  if (t.dueHasTime) {
    const p = getOrgParts(t.dueAt);
    if (p) return `${day} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
  }
  return day;
}

export function useTasks() {
  const tasks = ref<Task[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const saving = ref(false);

  const filters = reactive<TaskFilters>({
    view: 'mine',
    status: 'open',
    assigneeUserId: '',
  });

  async function fetchTasks(page = 1, limit = 100): Promise<void> {
    loading.value = true;
    try {
      const res = await api.get('/tasks', {
        params: {
          view: filters.view,
          status: filters.status,
          assigneeUserId: filters.view === 'all' && filters.assigneeUserId ? filters.assigneeUserId : undefined,
          page,
          limit,
        },
      });
      tasks.value = res.data.tasks ?? [];
      total.value = res.data.total ?? tasks.value.length;
    } catch (err) {
      console.error('[tasks] fetch error', err);
    } finally {
      loading.value = false;
    }
  }

  /** List task của 1 KH (panel chat) — trả trực tiếp, không đụng state list chính. */
  async function fetchContactTasks(contactId: string): Promise<Task[]> {
    try {
      const res = await api.get(`/contacts/${contactId}/tasks`);
      return res.data.tasks ?? [];
    } catch (err) {
      console.error('[tasks] contact fetch error', err);
      return [];
    }
  }

  async function createTask(payload: TaskPayload): Promise<Task | null> {
    saving.value = true;
    try {
      const res = await api.post('/tasks', payload);
      return res.data.task;
    } catch (err) {
      console.error('[tasks] create error', err);
      throw err;
    } finally {
      saving.value = false;
    }
  }

  async function updateTask(id: string, payload: Partial<TaskPayload>): Promise<Task | null> {
    saving.value = true;
    try {
      const res = await api.put(`/tasks/${id}`, payload);
      const idx = tasks.value.findIndex(t => t.id === id);
      if (idx !== -1) tasks.value[idx] = res.data.task;
      return res.data.task;
    } catch (err) {
      console.error('[tasks] update error', err);
      throw err;
    } finally {
      saving.value = false;
    }
  }

  /** Toggle done qua PATCH riêng — trả task server-state (caller tự optimistic/revert). */
  async function toggleTask(id: string, done: boolean): Promise<Task | null> {
    try {
      const res = await api.patch(`/tasks/${id}/toggle`, { done });
      const idx = tasks.value.findIndex(t => t.id === id);
      if (idx !== -1) tasks.value[idx] = res.data.task;
      return res.data.task;
    } catch (err) {
      console.error('[tasks] toggle error', err);
      throw err;
    }
  }

  async function deleteTask(id: string): Promise<boolean> {
    try {
      await api.delete(`/tasks/${id}`);
      const before = tasks.value.length;
      tasks.value = tasks.value.filter(t => t.id !== id);
      if (tasks.value.length < before) total.value = Math.max(0, total.value - 1);
      return true;
    } catch (err) {
      console.error('[tasks] delete error', err);
      throw err;
    }
  }

  return {
    tasks, total, loading, saving, filters,
    fetchTasks, fetchContactTasks, createTask, updateTask, toggleTask, deleteTask,
  };
}
