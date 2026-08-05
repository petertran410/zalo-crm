<!--
  WorkSection.vue — section "Công việc" hợp nhất trong panel KH (tab Hoạt động của
  ChatContactPanel). Gộp Task + Ticket (khiếu nại) thành 1 danh sách, sort theo
  createdAt desc. V2 2026-07-10 — thay TasksSection + TicketsSection cũ.
-->
<template>
  <div class="work-section">
    <v-divider class="my-3" />
    <div class="d-flex align-center mb-2">
      <v-icon size="16" color="primary" class="mr-1">mdi-checkbox-marked-outline</v-icon>
      <span class="text-caption font-weight-bold">Công việc ({{ items.length }})</span>
      <v-spacer />
      <v-btn size="x-small" variant="tonal" color="primary" rounded @click="openEditor(null)">
        <v-icon size="14" class="mr-1">mdi-plus</v-icon>
        Tạo
      </v-btn>
    </div>

    <WorkItemEditor
      v-model="showEditor"
      :edit-item="editingItem"
      :prefill-contact="!editingItem ? { id: contactId, fullName: contactName || null, phone: null } : null"
      @created="reload"
      @updated="reload"
    />

    <div
      v-for="it in items" :key="`${it.kind}-${it.data.id}`"
      class="work-row"
      :class="{ done: isDone(it), overdue: isOverdue(it), urgent: it.kind === 'complaint' && it.data.priority === 'urgent' && it.data.status !== 'resolved' }"
      @click="openEditor(it)"
    >
      <button
        v-if="it.kind === 'task'"
        class="t-check" :class="{ checked: it.data.status === 'done' }"
        :title="it.data.status === 'done' ? 'Mở lại' : 'Hoàn thành'"
        @click.stop="toggleTaskDone(it.data)"
      >
        <v-icon v-if="it.data.status === 'done'" size="14">mdi-check</v-icon>
      </button>
      <span v-else class="kind-ic"><v-icon size="15" color="#B91C1C">mdi-ticket-outline</v-icon></span>

      <div class="t-main">
        <div class="t-title">{{ it.data.title }}</div>
        <div class="t-meta">
          <template v-if="it.kind === 'task'">
            <span v-if="it.data.dueAt" class="chip due" :class="{ red: isOverdue(it), orange: !isOverdue(it) && isDueToday({ dueAt: it.data.dueAt }) }">
              {{ dueLabel(it.data) }}
            </span>
            <span v-if="it.data.assignee" class="assignee">👤 {{ it.data.assignee.fullName || '—' }}</span>
          </template>
          <template v-else>
            <span class="chip priority" :style="{ background: PRIORITY_META[it.data.priority].bg, color: PRIORITY_META[it.data.priority].color }">
              {{ PRIORITY_META[it.data.priority].label }}
            </span>
            <span class="chip status" :style="{ background: STATUS_META[it.data.status].bg, color: STATUS_META[it.data.status].color }">
              {{ STATUS_META[it.data.status].label }}
            </span>
            <button v-if="it.data.status === 'resolved'" class="chip reopen-btn" @click.stop="reopenTicket(it.data)">Mở lại</button>
          </template>
        </div>
        <ThumbStrip
          v-if="it.data.attachments?.length"
          :items="it.data.attachments"
          @open="openAttachments(it)"
        />
      </div>
    </div>

    <div v-if="!loading && items.length === 0" class="t-empty">Chưa có công việc nào</div>

    <AttachmentManagerPopover
      v-model="showAttMgr"
      :work-kind="attMgrKind"
      :work-item-id="attMgrId"
      :attachments="attMgrList"
      @changed="onAttachmentsChanged"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useToast } from '@/composables/use-toast';
import { useTasks, isOverdue as isTaskOverdue, isDueToday, dueLabel, type Task } from '@/composables/use-tasks';
import { useTickets, PRIORITY_META, STATUS_META, type Ticket } from '@/composables/use-tickets';
import type { WorkAttachment } from '@/composables/work-attachment-types';
import WorkItemEditor, { type WorkEditItem } from '@/components/work/WorkItemEditor.vue';
import ThumbStrip from '@/components/work/ThumbStrip.vue';
import AttachmentManagerPopover from '@/components/work/AttachmentManagerPopover.vue';

const props = defineProps<{
  contactId: string;
  contactName?: string | null;
}>();

const toast = useToast();
const { fetchContactTasks, toggleTask } = useTasks();
const { fetchContactTickets, changeStatus } = useTickets();

type WorkItem = { kind: 'task'; data: Task } | { kind: 'complaint'; data: Ticket };

const tasks = ref<Task[]>([]);
const tickets = ref<Ticket[]>([]);
const loading = ref(false);
const showEditor = ref(false);
const editingItem = ref<WorkEditItem | null>(null);

const showAttMgr = ref(false);
const attMgrKind = ref<'task' | 'complaint'>('task');
const attMgrId = ref('');
const attMgrList = ref<WorkAttachment[]>([]);

function openAttachments(it: WorkItem) {
  attMgrKind.value = it.kind;
  attMgrId.value = it.data.id;
  attMgrList.value = it.data.attachments ?? [];
  showAttMgr.value = true;
}

function onAttachmentsChanged(list: WorkAttachment[]) {
  const id = attMgrId.value;
  if (attMgrKind.value === 'task') {
    const t = tasks.value.find((x) => x.id === id);
    if (t) t.attachments = list;
  } else {
    const t = tickets.value.find((x) => x.id === id);
    if (t) t.attachments = list;
  }
  attMgrList.value = list;
}

const items = computed<WorkItem[]>(() => {
  const merged: WorkItem[] = [
    ...tasks.value.map(t => ({ kind: 'task' as const, data: t })),
    ...tickets.value.map(t => ({ kind: 'complaint' as const, data: t })),
  ];
  return merged.sort((a, b) => new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime());
});

function isDone(it: WorkItem): boolean {
  return it.kind === 'task' ? it.data.status === 'done' : it.data.status === 'resolved';
}

function isOverdue(it: WorkItem): boolean {
  return it.kind === 'task' && isTaskOverdue(it.data);
}

async function reload() {
  loading.value = true;
  showEditor.value = false;
  editingItem.value = null;
  try {
    const [t1, t2] = await Promise.all([
      fetchContactTasks(props.contactId),
      fetchContactTickets(props.contactId),
    ]);
    tasks.value = t1;
    tickets.value = t2;
  } finally {
    loading.value = false;
  }
}

function openEditor(it: WorkItem | null) {
  if (it && it.kind === 'complaint' && it.data.status === 'resolved') {
    toast.push('Ticket đã hoàn thành — bấm "Mở lại" nếu cần sửa', 'default');
    return;
  }
  editingItem.value = it;
  showEditor.value = true;
}

async function reopenTicket(t: Ticket) {
  try {
    await changeStatus(t.id, 'in_progress');
    t.status = 'in_progress';
  } catch (err: any) {
    toast.push(err?.response?.data?.error || 'Không mở lại được ticket', 'error');
  }
}

async function toggleTaskDone(t: Task) {
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
.work-row {
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
.work-row.overdue { background: #fef2f2; border-color: #fecaca; border-left-color: #dc2626; }
.work-row.urgent { border-left-color: #dc2626; }
.work-row.done { background: #f8fafc; border-left-color: #94a3b8; opacity: 0.65; }

.t-check {
  width: 20px; height: 20px; flex-shrink: 0; margin-top: 1px;
  border: 2px solid #cbd5e1; border-radius: 6px;
  background: #fff; cursor: pointer; color: #fff;
  display: inline-flex; align-items: center; justify-content: center;
}
.t-check:hover { border-color: #2563eb; }
.t-check.checked { background: #16a34a; border-color: #16a34a; }
.kind-ic { width: 20px; height: 20px; flex-shrink: 0; margin-top: 1px; display: inline-flex; align-items: center; justify-content: center; }

.t-main { flex: 1; min-width: 0; }
.t-title {
  font-size: 12.5px; font-weight: 500; color: #1a1d24;
  line-height: 1.35;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.work-row.done .t-title { text-decoration: line-through; color: #64748b; }
.work-row.overdue .t-title { color: #991b1b; }

.t-meta {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  margin-top: 2px;
  font-size: 10.5px; color: #6b7280;
}
.chip { font-weight: 500; padding: 1px 7px; border-radius: 999px; }
.chip.due { background: #f1f5f9; color: #475569; }
.chip.due.red { background: #fee2e2; color: #991b1b; }
.chip.due.orange { background: #ffedd5; color: #9a3412; }
.chip.reopen-btn {
  border: 1px solid #fde68a; background: #fffbeb; color: #92400e;
  cursor: pointer; font-size: 10.5px;
}
.chip.reopen-btn:hover { background: #fef3c7; }

.t-empty {
  font-size: 11.5px; color: #94a3b8;
  text-align: center; padding: 14px 0; font-style: italic;
}
</style>
