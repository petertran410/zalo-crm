<!--
  TasksView.vue — trang "Công việc" hợp nhất (V2, 2026-07-10): gộp Task (to-do nội bộ)
  + Ticket (khiếu nại/yêu cầu KH) vào 1 danh sách + 1 nút "Tạo" (chọn loại trong modal).

  Filter status là bucket gộp 2 lifecycle khác nhau:
    "Đang xử lý" = task.status=open  ∪ ticket.status ∈ {open,in_progress}
    "Hoàn thành" = task.status=done  ∪ ticket.status=resolved
    "Tất cả"     = mọi status
  Sort: gộp rồi sắp theo createdAt desc (đơn giản hoá — không cố giữ ưu tiên dueAt
  của Task vì không có trục thời gian chung hợp lý giữa 2 loại).
-->
<template>
  <div class="tasks-view">
    <!-- Header -->
    <div class="tv-head">
      <h1><v-icon size="22">mdi-checkbox-marked-outline</v-icon> Công việc</h1>
      <button class="btn btn--primary" @click="openCreate">
        <v-icon size="16">mdi-plus</v-icon> Tạo
      </button>
    </div>

    <!-- Filters -->
    <div class="tv-filters">
      <div v-if="authStore.isManager" class="chip-group">
        <button
          v-for="v in VIEW_CHIPS" :key="v.value"
          class="chip" :class="{ active: view === v.value }"
          @click="view = v.value as 'mine' | 'all'; reload()"
        >{{ v.label }}</button>
      </div>
      <div class="chip-group">
        <button
          v-for="s in STATUS_CHIPS" :key="s.value"
          class="chip" :class="{ active: statusBucket === s.value }"
          @click="statusBucket = s.value as any; reload()"
        >{{ s.label }}</button>
      </div>
      <span v-if="!loading" class="tv-count">{{ items.length }} mục</span>
    </div>

    <!-- List -->
    <div v-if="loading" class="tv-empty">Đang tải...</div>
    <div v-else-if="items.length === 0" class="tv-empty">
      {{ statusBucket === 'active' ? 'Chưa có công việc nào — bấm "Tạo" để bắt đầu' : 'Không có công việc nào' }}
    </div>
    <div v-else class="tv-list">
      <div
        v-for="it in items" :key="`${it.kind}-${it.data.id}`"
        class="task-row"
        :class="{ done: isDone(it), overdue: isOverdue(it), urgent: it.kind === 'complaint' && it.data.priority === 'urgent' && it.data.status !== 'resolved' }"
        @click="openEdit(it)"
      >
        <!-- Task: checkbox toggle. Complaint: type icon. -->
        <button
          v-if="it.kind === 'task'"
          class="t-check" :class="{ checked: it.data.status === 'done' }"
          :title="it.data.status === 'done' ? 'Mở lại' : 'Hoàn thành'"
          @click.stop="toggle(it.data)"
        >
          <v-icon v-if="it.data.status === 'done'" size="16">mdi-check</v-icon>
        </button>
        <span v-else class="kind-ic"><v-icon size="18" color="#B91C1C">mdi-ticket-outline</v-icon></span>

        <!-- Main -->
        <div class="t-main">
          <div class="t-title">{{ it.data.title }}</div>
          <div class="t-meta">
            <template v-if="it.kind === 'task'">
              <span v-if="it.data.dueAt" class="due-chip" :class="{ red: isOverdue(it), orange: !isOverdue(it) && isDueToday({ dueAt: it.data.dueAt }) }">
                <v-icon size="12">mdi-clock-outline</v-icon> {{ dueLabel(it.data) }}
              </span>
              <span v-if="it.data.contact" class="kh-chip" @click.stop="goContact(it.data.contactId)">
                <v-icon size="12">mdi-account-outline</v-icon> {{ it.data.contact.fullName || 'KH' }}
              </span>
              <span v-if="it.data.description" class="t-desc">{{ it.data.description }}</span>
              <span v-if="it.data.status === 'done' && it.data.doneBy" class="t-audit">✓ {{ it.data.doneBy.fullName || '—' }}</span>
            </template>
            <template v-else>
              <span class="priority-chip" :style="{ background: PRIORITY_META[it.data.priority].bg, color: PRIORITY_META[it.data.priority].color }">
                {{ PRIORITY_META[it.data.priority].label }}
              </span>
              <span class="status-chip" :style="{ background: STATUS_META[it.data.status].bg, color: STATUS_META[it.data.status].color }">
                {{ STATUS_META[it.data.status].label }}
              </span>
              <span v-if="it.data.category" class="cat-chip">{{ COMPLAINT_CATEGORY_META[it.data.category].label }}</span>
              <span v-if="it.data.contact" class="kh-chip" @click.stop="goContact(it.data.contactId)">
                <v-icon size="12">mdi-account-outline</v-icon> {{ it.data.contact.fullName || 'KH' }}
              </span>
              <span class="t-desc">{{ it.data.summary }}</span>
            </template>
          </div>
          <ThumbStrip
            v-if="it.data.attachments?.length"
            :items="it.data.attachments"
            @open="openAttachments(it)"
          />
        </div>

        <!-- Assignee (view Tất cả) -->
        <div v-if="view === 'all' && it.data.assignee" class="t-assignee" :title="it.data.assignee.fullName || ''">
          <Avatar :name="it.data.assignee.fullName || '?'" :src="it.data.assignee.avatarUrl || undefined" :size="26" />
        </div>

        <!-- Complaint status actions -->
        <div v-if="it.kind === 'complaint'" class="t-actions" @click.stop>
          <button v-if="it.data.status === 'open'" class="t-action-btn" @click="advance(it.data, 'in_progress')">Nhận xử lý</button>
          <button v-if="it.data.status !== 'resolved'" class="t-action-btn resolve" @click="advance(it.data, 'resolved')">Đánh dấu xong</button>
          <button v-if="it.data.status === 'resolved'" class="t-action-btn reopen" @click="advance(it.data, 'in_progress')">Mở lại</button>
        </div>

        <!-- Delete -->
        <button class="t-del" title="Xóa" @click.stop="remove(it)">
          <v-icon size="15">mdi-trash-can-outline</v-icon>
        </button>
      </div>
    </div>

    <!-- Editor modal -->
    <WorkItemEditor v-model="showEditor" :edit-item="editingItem" @created="onSaved" @updated="onSaved" />

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
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/use-toast';
import { useConfirm } from '@/composables/use-confirm';
import { useTasks, isOverdue as isTaskOverdue, isDueToday, dueLabel, type Task } from '@/composables/use-tasks';
import { useTickets, PRIORITY_META, STATUS_META, COMPLAINT_CATEGORY_META, type Ticket, type TicketStatus } from '@/composables/use-tickets';
import type { WorkAttachment } from '@/composables/work-attachment-types';
import WorkItemEditor, { type WorkEditItem } from '@/components/work/WorkItemEditor.vue';
import ThumbStrip from '@/components/work/ThumbStrip.vue';
import AttachmentManagerPopover from '@/components/work/AttachmentManagerPopover.vue';
import Avatar from '@/components/ui/Avatar.vue';

const authStore = useAuthStore();
const router = useRouter();
const toast = useToast();
const { confirm } = useConfirm();
const { tasks, loading: tasksLoading, filters: taskFilters, fetchTasks, toggleTask, deleteTask } = useTasks();
const { tickets, loading: ticketsLoading, filters: ticketFilters, fetchTickets, changeStatus, deleteTicket } = useTickets();

type WorkItem = { kind: 'task'; data: Task } | { kind: 'complaint'; data: Ticket };

const VIEW_CHIPS = [
  { label: 'Của tôi', value: 'mine' },
  { label: 'Tất cả', value: 'all' },
];
const STATUS_CHIPS = [
  { label: 'Đang xử lý', value: 'active' },
  { label: 'Hoàn thành', value: 'done' },
  { label: 'Tất cả', value: 'all' },
];

const view = ref<'mine' | 'all'>('mine');
const statusBucket = ref<'active' | 'done' | 'all'>('active');
const loading = computed(() => tasksLoading.value || ticketsLoading.value);

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
  const kind = attMgrKind.value;
  if (kind === 'task') {
    const t = tasks.value.find((x) => x.id === id);
    if (t) t.attachments = list;
  } else {
    const t = tickets.value.find((x) => x.id === id);
    if (t) t.attachments = list;
  }
  attMgrList.value = list;
}

function reload() {
  taskFilters.view = view.value;
  taskFilters.status = statusBucket.value === 'active' ? 'open' : statusBucket.value === 'done' ? 'done' : 'all';
  ticketFilters.view = view.value;
  ticketFilters.status = statusBucket.value === 'active' ? 'active' : statusBucket.value === 'done' ? 'resolved' : 'all';
  fetchTasks();
  fetchTickets();
}

function openCreate() {
  editingItem.value = null;
  showEditor.value = true;
}

function openEdit(it: WorkItem) {
  if (it.kind === 'complaint' && it.data.status === 'resolved') {
    toast.push('Ticket đã hoàn thành — bấm "Mở lại" nếu cần sửa', 'default');
    return;
  }
  editingItem.value = it;
  showEditor.value = true;
}

function onSaved() {
  reload();
}

async function toggle(t: Task) {
  const wasDone = t.status === 'done';
  t.status = wasDone ? 'open' : 'done';
  try {
    await toggleTask(t.id, !wasDone);
    if (statusBucket.value !== 'all') reload();
  } catch (err: any) {
    t.status = wasDone ? 'done' : 'open';
    toast.push(err?.response?.data?.error || 'Không cập nhật được công việc', 'error');
  }
}

async function advance(t: Ticket, status: TicketStatus) {
  const prevStatus = t.status;
  t.status = status;
  try {
    await changeStatus(t.id, status);
    if (statusBucket.value !== 'all') reload();
  } catch (err: any) {
    t.status = prevStatus;
    toast.push(err?.response?.data?.error || 'Không cập nhật được trạng thái', 'error');
  }
}

async function remove(it: WorkItem) {
  const ok = await confirm({
    title: it.kind === 'task' ? 'Xóa công việc?' : 'Xóa khiếu nại?',
    message: `"${it.data.title}" sẽ bị xóa vĩnh viễn.`,
    tone: 'danger',
  });
  if (!ok) return;
  try {
    if (it.kind === 'task') await deleteTask(it.data.id);
    else await deleteTicket(it.data.id);
    toast.push('Đã xóa', 'success');
  } catch (err: any) {
    toast.push(err?.response?.data?.error || 'Không xóa được', 'error');
  }
}

function goContact(contactId: string | null) {
  if (contactId) router.push(`/customers/${contactId}/activity`);
}

onMounted(() => {
  reload();
});
</script>

<style scoped>
.tasks-view {
  max-width: 900px;
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
.task-row.urgent { border-left-color: #dc2626; }
.task-row.done { background: #f8fafc; border-left-color: #94a3b8; opacity: 0.65; }

.t-check {
  width: 22px; height: 22px; flex-shrink: 0;
  border: 2px solid #cbd5e1; border-radius: 6px;
  background: #fff; cursor: pointer; color: #fff;
  display: inline-flex; align-items: center; justify-content: center;
}
.t-check:hover { border-color: #2563eb; }
.t-check.checked { background: #16a34a; border-color: #16a34a; }
.kind-ic { width: 22px; height: 22px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; }

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
.due-chip, .kh-chip, .priority-chip, .status-chip, .cat-chip {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 11px; font-weight: 500;
  padding: 1.5px 8px; border-radius: 999px;
  background: #f1f5f9; color: #475569;
}
.due-chip.red { background: #fee2e2; color: #991b1b; }
.due-chip.orange { background: #ffedd5; color: #9a3412; }
.kh-chip { background: #ede9fe; color: #5b21b6; }
.kh-chip:hover { background: #ddd6fe; }
.cat-chip { background: #f1f5f9; color: #475569; }
.t-desc {
  font-size: 11.5px; color: #6b7280;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 320px;
}
.t-audit { font-size: 10.5px; color: #6b7280; font-style: italic; }

.t-assignee { flex-shrink: 0; }
.t-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.t-action-btn {
  padding: 5px 10px; border-radius: 7px; font-size: 11.5px; font-weight: 500;
  border: 1px solid #e5e7eb; background: #fff; color: #374151; cursor: pointer;
  white-space: nowrap;
}
.t-action-btn:hover { background: #f1f5f9; }
.t-action-btn.resolve { border-color: #bbf7d0; color: #166534; background: #f0fdf4; }
.t-action-btn.resolve:hover { background: #dcfce7; }
.t-action-btn.reopen { border-color: #fde68a; color: #92400e; background: #fffbeb; }
.t-action-btn.reopen:hover { background: #fef3c7; }
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
  .t-actions { flex-wrap: wrap; }
}
</style>
