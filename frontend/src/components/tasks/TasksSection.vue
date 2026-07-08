<!--
  TasksSection.vue — section "Công việc" gọn trong panel KH (tab Hoạt động của
  ChatContactPanel), model theo ChatAppointments.vue: header + nút Tạo (prefill KH),
  rows checkbox toggle + due label. Task V1 2026-07-07.
-->
<template>
  <div class="tasks-section">
    <v-divider class="my-3" />
    <div class="d-flex align-center mb-2">
      <v-icon size="16" color="primary" class="mr-1">mdi-checkbox-marked-outline</v-icon>
      <span class="text-caption font-weight-bold">Công việc ({{ tasks.length }})</span>
      <v-spacer />
      <v-btn size="x-small" variant="tonal" color="primary" rounded @click="openEditor(null)">
        <v-icon size="14" class="mr-1">mdi-plus</v-icon>
        Tạo
      </v-btn>
    </div>

    <TaskEditor
      v-model="showEditor"
      :task="editingTask"
      :prefill-contact="!editingTask ? { id: contactId, fullName: contactName || null, phone: null } : null"
      @created="reload"
      @updated="reload"
    />

    <div
      v-for="t in tasks" :key="t.id"
      class="task-row"
      :class="{ done: t.status === 'done', overdue: isOverdue(t) }"
      @click="openEditor(t)"
    >
      <button
        class="t-check" :class="{ checked: t.status === 'done' }"
        :title="t.status === 'done' ? 'Mở lại' : 'Hoàn thành'"
        @click.stop="toggle(t)"
      >
        <v-icon v-if="t.status === 'done'" size="14">mdi-check</v-icon>
      </button>
      <div class="t-main">
        <div class="t-title">{{ t.title }}</div>
        <div class="t-meta">
          <span v-if="t.dueAt" class="due" :class="{ red: isOverdue(t), orange: !isOverdue(t) && isDueToday(t) }">
            {{ dueLabel(t) }}
          </span>
          <span v-if="t.assignee" class="assignee">👤 {{ t.assignee.fullName || '—' }}</span>
        </div>
      </div>
    </div>

    <div v-if="!loading && tasks.length === 0" class="t-empty">Chưa có công việc nào</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useToast } from '@/composables/use-toast';
import { useTasks, isOverdue, isDueToday, dueLabel, type Task } from '@/composables/use-tasks';
import TaskEditor from '@/components/tasks/TaskEditor.vue';

const props = defineProps<{
  contactId: string;
  contactName?: string | null;
}>();

const toast = useToast();
const { fetchContactTasks, toggleTask } = useTasks();

const tasks = ref<Task[]>([]);
const loading = ref(false);
const showEditor = ref(false);
const editingTask = ref<Task | null>(null);

async function reload() {
  loading.value = true;
  showEditor.value = false;
  editingTask.value = null;
  try {
    tasks.value = await fetchContactTasks(props.contactId);
  } finally {
    loading.value = false;
  }
}

function openEditor(t: Task | null) {
  editingTask.value = t;
  showEditor.value = true;
}

async function toggle(t: Task) {
  const wasDone = t.status === 'done';
  t.status = wasDone ? 'open' : 'done';
  try {
    await toggleTask(t.id, !wasDone);
  } catch (err: any) {
    t.status = wasDone ? 'done' : 'open';
    toast.push(err?.response?.data?.error || 'Không cập nhật được công việc', 'error');
  }
}

watch(() => props.contactId, () => { if (props.contactId) reload(); });
onMounted(() => { if (props.contactId) reload(); });
</script>

<style scoped>
/* Card row — kế thừa 3-tier urgency từ ChatAppointments (overdue đỏ / open xanh / done xám) */
.task-row {
  display: flex; align-items: flex-start; gap: 8px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-left: 4px solid #2563eb;
  border-radius: 10px;
  padding: 8px 10px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
}
.task-row.overdue { background: #fef2f2; border-color: #fecaca; border-left-color: #dc2626; }
.task-row.done { background: #f8fafc; border-left-color: #94a3b8; opacity: 0.65; }

.t-check {
  width: 20px; height: 20px; flex-shrink: 0; margin-top: 1px;
  border: 2px solid #cbd5e1; border-radius: 6px;
  background: #fff; cursor: pointer; color: #fff;
  display: inline-flex; align-items: center; justify-content: center;
}
.t-check:hover { border-color: #2563eb; }
.t-check.checked { background: #16a34a; border-color: #16a34a; }

.t-main { flex: 1; min-width: 0; }
.t-title {
  font-size: 12.5px; font-weight: 500; color: #1a1d24;
  line-height: 1.35;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.task-row.done .t-title { text-decoration: line-through; color: #64748b; }
.task-row.overdue .t-title { color: #991b1b; }

.t-meta {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-top: 2px;
  font-size: 10.5px; color: #6b7280;
}
.t-meta .due {
  font-weight: 500; padding: 1px 7px; border-radius: 999px;
  background: #f1f5f9; color: #475569;
}
.t-meta .due.red { background: #fee2e2; color: #991b1b; }
.t-meta .due.orange { background: #ffedd5; color: #9a3412; }

.t-empty {
  font-size: 11.5px; color: #94a3b8;
  text-align: center; padding: 14px 0; font-style: italic;
}
</style>
