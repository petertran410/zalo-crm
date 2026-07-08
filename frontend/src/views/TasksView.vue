<!--
  TasksView.vue — trang "Công việc" (Task V1, 2026-07-07).

  Filter chips: view "Của tôi"/"Tất cả" (Tất cả chỉ hiện với manager — khớp gate BE),
  status "Đang mở"/"Hoàn thành"/"Tất cả". Checkbox toggle optimistic (revert + toast lỗi).
  Quá hạn: chip đỏ + nổi lên đầu (BE sort dueAt asc nulls last). Responsive ≤768px.
-->
<template>
  <div class="tasks-view">
    <!-- Header -->
    <div class="tv-head">
      <h1><v-icon size="22">mdi-checkbox-marked-outline</v-icon> Công việc</h1>
      <button class="btn btn--primary" @click="openCreate">
        <v-icon size="16">mdi-plus</v-icon> Tạo công việc
      </button>
    </div>

    <!-- Filters -->
    <div class="tv-filters">
      <div v-if="authStore.isManager" class="chip-group">
        <button
          v-for="v in VIEW_CHIPS" :key="v.value"
          class="chip" :class="{ active: filters.view === v.value }"
          @click="filters.view = v.value as 'mine' | 'all'; reload()"
        >{{ v.label }}</button>
      </div>
      <div class="chip-group">
        <button
          v-for="s in STATUS_CHIPS" :key="s.value"
          class="chip" :class="{ active: filters.status === s.value }"
          @click="filters.status = s.value as 'open' | 'done' | 'all'; reload()"
        >{{ s.label }}</button>
      </div>
      <span v-if="!loading" class="tv-count">{{ total }} công việc</span>
    </div>

    <!-- List -->
    <div v-if="loading" class="tv-empty">Đang tải...</div>
    <div v-else-if="tasks.length === 0" class="tv-empty">
      {{ filters.status === 'open' ? 'Chưa có công việc nào — bấm "Tạo công việc" để bắt đầu' : 'Không có công việc nào' }}
    </div>
    <div v-else class="tv-list">
      <div
        v-for="t in tasks" :key="t.id"
        class="task-row"
        :class="{ done: t.status === 'done', overdue: isOverdue(t) }"
        @click="openEdit(t)"
      >
        <!-- Checkbox toggle -->
        <button
          class="t-check" :class="{ checked: t.status === 'done' }"
          :title="t.status === 'done' ? 'Mở lại' : 'Hoàn thành'"
          @click.stop="toggle(t)"
        >
          <v-icon v-if="t.status === 'done'" size="16">mdi-check</v-icon>
        </button>

        <!-- Main -->
        <div class="t-main">
          <div class="t-title">{{ t.title }}</div>
          <div class="t-meta">
            <span v-if="t.dueAt" class="due-chip" :class="{ red: isOverdue(t), orange: !isOverdue(t) && isDueToday(t) }">
              <v-icon size="12">mdi-clock-outline</v-icon> {{ dueLabel(t) }}
            </span>
            <span v-if="t.contact" class="kh-chip" @click.stop="goContact(t)">
              <v-icon size="12">mdi-account-outline</v-icon> {{ t.contact.fullName || 'KH' }}
            </span>
            <span v-if="t.description" class="t-desc">{{ t.description }}</span>
            <span v-if="t.status === 'done' && t.doneBy" class="t-audit">
              ✓ {{ t.doneBy.fullName || '—' }}
            </span>
          </div>
        </div>

        <!-- Assignee (view Tất cả) -->
        <div v-if="filters.view === 'all' && t.assignee" class="t-assignee" :title="t.assignee.fullName || ''">
          <Avatar :name="t.assignee.fullName || '?'" :src="t.assignee.avatarUrl || undefined" :size="26" />
        </div>

        <!-- Delete -->
        <button class="t-del" title="Xóa công việc" @click.stop="remove(t)">
          <v-icon size="15">mdi-trash-can-outline</v-icon>
        </button>
      </div>
    </div>

    <!-- Editor modal -->
    <TaskEditor v-model="showEditor" :task="editingTask" @created="onSaved" @updated="onSaved" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/use-toast';
import { useConfirm } from '@/composables/use-confirm';
import { useTasks, isOverdue, isDueToday, dueLabel, type Task } from '@/composables/use-tasks';
import TaskEditor from '@/components/tasks/TaskEditor.vue';
import Avatar from '@/components/ui/Avatar.vue';

const authStore = useAuthStore();
const router = useRouter();
const toast = useToast();
const { confirm } = useConfirm();
const { tasks, total, loading, filters, fetchTasks, toggleTask, deleteTask } = useTasks();

const VIEW_CHIPS = [
  { label: 'Của tôi', value: 'mine' },
  { label: 'Tất cả', value: 'all' },
];
const STATUS_CHIPS = [
  { label: 'Đang mở', value: 'open' },
  { label: 'Hoàn thành', value: 'done' },
  { label: 'Tất cả', value: 'all' },
];

const showEditor = ref(false);
const editingTask = ref<Task | null>(null);

function reload() {
  fetchTasks();
}

function openCreate() {
  editingTask.value = null;
  showEditor.value = true;
}

function openEdit(t: Task) {
  editingTask.value = t;
  showEditor.value = true;
}

function onSaved() {
  reload();
}

/** Toggle optimistic: đổi UI ngay, revert + toast nếu server từ chối (403...). */
async function toggle(t: Task) {
  const wasDone = t.status === 'done';
  t.status = wasDone ? 'open' : 'done';
  try {
    await toggleTask(t.id, !wasDone);
    // Đang lọc "Đang mở" mà vừa done (hoặc ngược lại) → row không thuộc filter nữa
    if (filters.status !== 'all') reload();
  } catch (err: any) {
    t.status = wasDone ? 'done' : 'open';
    toast.push(err?.response?.data?.error || 'Không cập nhật được công việc', 'error');
  }
}

async function remove(t: Task) {
  const ok = await confirm({
    title: 'Xóa công việc?',
    message: `"${t.title}" sẽ bị xóa vĩnh viễn.`,
    tone: 'danger',
  });
  if (!ok) return;
  try {
    await deleteTask(t.id);
    toast.push('Đã xóa công việc', 'success');
  } catch (err: any) {
    toast.push(err?.response?.data?.error || 'Không xóa được công việc', 'error');
  }
}

function goContact(t: Task) {
  if (t.contactId) router.push(`/customers/${t.contactId}/activity`);
}

onMounted(() => {
  fetchTasks();
});
</script>

<style scoped>
.tasks-view {
  max-width: 860px;
  margin: 0 auto;
  padding: 20px 16px;
}
.tv-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16px;
}
.tv-head h1 {
  font-size: 20px; font-weight: 600; color: #1a1d24; margin: 0;
  display: flex; align-items: center; gap: 8px;
}
.btn {
  padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 500;
  cursor: pointer; border: 1px solid #e5e7eb; background: #fff; color: #374151;
  display: inline-flex; align-items: center; gap: 4px;
}
.btn--primary { background: #2563eb; border-color: #2563eb; color: #fff; }

.tv-filters {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  margin-bottom: 14px;
}
.chip-group {
  display: inline-flex; gap: 4px;
  background: #f1f5f9; border-radius: 999px; padding: 3px;
}
.chip {
  padding: 5px 13px; border-radius: 999px; font-size: 12.5px; font-weight: 500;
  border: none; background: transparent; color: #64748b; cursor: pointer;
}
.chip.active { background: #fff; color: #1a1d24; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.tv-count { font-size: 12px; color: #94a3b8; margin-left: auto; }

.tv-empty {
  text-align: center; padding: 48px 0;
  color: #94a3b8; font-size: 13.5px; font-style: italic;
}

.tv-list { display: flex; flex-direction: column; gap: 6px; }
.task-row {
  display: flex; align-items: center; gap: 10px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-left: 4px solid #2563eb;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s ease;
}
.task-row:hover { background: #f8fafc; }
.task-row.overdue { background: #fef2f2; border-color: #fecaca; border-left-color: #dc2626; }
.task-row.done { background: #f8fafc; border-left-color: #94a3b8; opacity: 0.65; }

.t-check {
  width: 22px; height: 22px; flex-shrink: 0;
  border: 2px solid #cbd5e1; border-radius: 6px;
  background: #fff; cursor: pointer; color: #fff;
  display: inline-flex; align-items: center; justify-content: center;
}
.t-check:hover { border-color: #2563eb; }
.t-check.checked { background: #16a34a; border-color: #16a34a; }

.t-main { flex: 1; min-width: 0; }
.t-title {
  font-size: 13.5px; font-weight: 500; color: #1a1d24;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  line-height: 1.35;
}
.task-row.done .t-title { text-decoration: line-through; color: #64748b; }
.task-row.overdue .t-title { color: #991b1b; }

.t-meta {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-top: 3px;
}
.due-chip, .kh-chip {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 11px; font-weight: 500;
  padding: 1.5px 8px; border-radius: 999px;
  background: #f1f5f9; color: #475569;
}
.due-chip.red { background: #fee2e2; color: #991b1b; }
.due-chip.orange { background: #ffedd5; color: #9a3412; }
.kh-chip { background: #ede9fe; color: #5b21b6; }
.kh-chip:hover { background: #ddd6fe; }
.t-desc {
  font-size: 11.5px; color: #6b7280;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 320px;
}
.t-audit { font-size: 10.5px; color: #6b7280; font-style: italic; }

.t-assignee { flex-shrink: 0; }
.t-del {
  width: 28px; height: 28px; flex-shrink: 0;
  border: none; border-radius: 7px;
  background: transparent; color: #cbd5e1; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.task-row:hover .t-del { color: #6b7280; }
.t-del:hover { background: #fee2e2; color: #dc2626 !important; }

@media (max-width: 768px) {
  .tasks-view { padding: 12px 10px; }
  .t-desc { display: none; }
  .tv-count { display: none; }
}
</style>
