<!--
  WorkItemEditor.vue — modal hợp nhất tạo/sửa "Công việc" (V2, 2026-07-10).

  Gộp Task (to-do nội bộ) + Ticket (khiếu nại/yêu cầu KH) vào MỘT modal: khi tạo mới,
  người dùng chọn loại ("Công việc thường" / "Khiếu nại") bằng toggle ở đầu form —
  chọn xong thì field tương ứng hiện ra. Khi sửa, loại đã cố định (ẩn toggle).

  KHÔNG có bước AI draft trong bản này (chưa có API key AI provider — bỏ theo yêu cầu
  2026-07-10). Field vẫn giữ contact-autocomplete pattern rút gọn từ TaskEditor/TicketEditor cũ.
-->
<template>
  <Teleport to="body">
    <div v-if="modelValue" class="editor-backdrop" @click.self="requestClose">
      <div class="editor" @keydown.escape="requestClose" @keydown.ctrl.enter="submit" tabindex="-1">
        <!-- Header -->
        <div class="editor-head">
          <h2>
            <v-icon size="19" class="head-ic">{{ kind === 'task' ? 'mdi-checkbox-marked-outline' : 'mdi-ticket-outline' }}</v-icon>
            {{ headTitle }}
          </h2>
          <button class="close" @click="requestClose" title="Đóng (Esc)"><v-icon size="18">mdi-close</v-icon></button>
        </div>

        <!-- Body -->
        <div class="editor-body">
          <!-- Toggle loại (chỉ khi tạo mới) -->
          <div v-if="!isEdit" class="kind-toggle">
            <button
              type="button" class="kind-btn" :class="{ active: kind === 'task' }"
              @click="kind = 'task'"
            ><v-icon size="15">mdi-checkbox-marked-outline</v-icon> Công việc thường</button>
            <button
              type="button" class="kind-btn" :class="{ active: kind === 'complaint' }"
              @click="kind = 'complaint'"
            ><v-icon size="15">mdi-ticket-outline</v-icon> Khiếu nại</button>
          </div>

          <!-- Tiêu đề -->
          <div class="tfield">
            <span class="tfield-label">Tiêu đề</span>
            <input
              ref="titleInputRef"
              v-model="form.title"
              class="title-input"
              type="text"
              maxlength="300"
              :placeholder="kind === 'task' ? 'Vd: Gửi báo giá cho khách, gọi xác nhận lịch...' : 'Vd: KH khiếu nại giao hàng chậm...'"
            />
          </div>

          <!-- ── Field riêng: Công việc thường ── -->
          <template v-if="kind === 'task'">
            <div class="tfield">
              <span class="tfield-label">Mô tả (tuỳ chọn)</span>
              <textarea v-model="form.description" class="desc-area" rows="2" placeholder="Chi tiết thêm về công việc..."></textarea>
            </div>
            <div class="row-2">
              <div class="tfield">
                <span class="tfield-label">Người phụ trách</span>
                <select v-model="form.assigneeUserId" class="assignee-select">
                  <option v-for="u in users" :key="u.id" :value="u.id">
                    {{ u.fullName || u.email }}{{ u.id === currentUserId ? ' (tôi)' : '' }}
                  </option>
                </select>
              </div>
              <div class="tfield">
                <span class="tfield-label">Hạn (tuỳ chọn)</span>
                <div class="due-row">
                  <input v-model="form.dueDate" class="due-date" type="date" />
                  <button
                    v-if="form.dueDate" type="button" class="due-clear" title="Bỏ hạn"
                    @click="form.dueDate = ''; form.dueTime = ''; form.hasTime = false"
                  ><v-icon size="14">mdi-close</v-icon></button>
                </div>
                <label v-if="form.dueDate" class="time-toggle">
                  <input type="checkbox" v-model="form.hasTime" />
                  Giờ cụ thể
                  <input v-if="form.hasTime" v-model="form.dueTime" class="due-time" type="time" />
                </label>
              </div>
            </div>
          </template>

          <!-- ── Field riêng: Khiếu nại ── -->
          <template v-else>
            <div class="tfield">
              <span class="tfield-label">Mô tả vấn đề</span>
              <textarea v-model="form.summary" class="desc-area" rows="4" maxlength="5000" placeholder="Chi tiết vấn đề của khách hàng..."></textarea>
            </div>
            <div class="row-2">
              <div class="tfield">
                <span class="tfield-label">Mức ưu tiên</span>
                <select v-model="form.priority" class="assignee-select">
                  <option v-for="p in PRIORITIES" :key="p" :value="p">{{ PRIORITY_META[p].label }}</option>
                </select>
              </div>
              <div class="tfield">
                <span class="tfield-label">Phân loại khiếu nại</span>
                <select v-model="form.category" class="assignee-select">
                  <option value="">— Chưa phân loại —</option>
                  <option v-for="c in COMPLAINT_CATEGORIES" :key="c" :value="c">{{ COMPLAINT_CATEGORY_META[c].label }}</option>
                </select>
              </div>
            </div>
            <div class="tfield">
              <span class="tfield-label">Người phụ trách</span>
              <select v-model="form.assigneeUserId" class="assignee-select">
                <option v-for="u in users" :key="u.id" :value="u.id">
                  {{ u.fullName || u.email }}{{ u.id === currentUserId ? ' (tôi)' : '' }}
                </option>
              </select>
            </div>
          </template>

          <!-- Liên kết KH — bắt buộc với khiếu nại (không thể xử lý khiếu nại không rõ KH nào),
               tuỳ chọn với công việc thường. -->
          <div class="tfield">
            <span class="tfield-label">
              Liên kết khách hàng{{ fromMessageState ? ' (từ tin nhắn)' : (kind === 'task' ? ' (tuỳ chọn)' : '') }}
            </span>
            <!-- Chế độ từ tin nhắn chat nhóm: KH khoá theo người gửi, BE tự resolve + cấp quyền. -->
            <div v-if="fromMessageState" class="from-msg-row">
              <v-icon size="16" class="from-msg-ic">mdi-message-reply-text-outline</v-icon>
              <div class="linked-info">
                <span class="name">{{ fromMessageState.senderName || 'Khách hàng trong nhóm' }}</span>
                <span class="phone-row">{{ fromMessageState.senderIsCustomer ? 'Tự động gắn từ người gửi tin' : 'Người gửi không phải KH — chỉ tạo công việc' }}</span>
              </div>
            </div>
            <div v-else-if="selectedContact" class="linked-kh-row">
              <span class="av" :style="!selectedContact.avatarUrl ? { background: contactColor(selectedContact.id) } : {}">
                <img v-if="selectedContact.avatarUrl" :src="selectedContact.avatarUrl" alt="" @error="onAvatarError" />
                <template v-else>{{ initials(selectedContact.fullName) }}</template>
              </span>
              <div class="linked-info">
                <span class="name">{{ selectedContact.fullName || 'Khách hàng' }}</span>
                <span v-if="selectedContact.phone" class="phone-row">{{ selectedContact.phone }}</span>
              </div>
              <button
                v-if="kind === 'task'" type="button" class="remove"
                @click="selectedContact = null" title="Bỏ link KH"
              ><v-icon size="13">mdi-close</v-icon></button>
              <button
                v-else type="button" class="remove" title="Đổi khách hàng"
                @click="selectedContact = null; openCustSuggest()"
              ><v-icon size="13">mdi-pencil-outline</v-icon></button>
            </div>
            <div v-else-if="custSuggestOpen" class="cust-suggest">
              <input
                ref="custSearchInputRef" v-model="custQuery" class="cust-suggest-search" type="text"
                placeholder="Tìm tên / SĐT..." autocomplete="off" @input="onCustSearch"
              />
              <div v-if="custSearching" class="cust-loading">Đang tìm...</div>
              <div v-for="c in custSuggestions" :key="c.id" class="cust-item" @mousedown.prevent="pickContact(c)">
                <span class="av" :style="!c.avatarUrl ? { background: contactColor(c.id) } : {}">
                  <img v-if="c.avatarUrl" :src="c.avatarUrl" alt="" />
                  <template v-else>{{ initials(c.fullName) }}</template>
                </span>
                <span class="name">{{ c.fullName || 'Khách hàng' }}</span>
                <span v-if="c.phone" class="phone">{{ c.phone }}</span>
              </div>
              <div v-if="!custSearching && custQuery && custSuggestions.length === 0" class="cust-empty">
                Không tìm thấy KH "{{ custQuery }}"
              </div>
              <div v-if="kind === 'task'" class="cust-item skip" @mousedown.prevent="custSuggestOpen = false">→ Không gắn khách</div>
            </div>
            <button v-else type="button" class="link-kh-btn" @click="openCustSuggest">+ Liên kết khách hàng</button>
          </div>

          <!-- Hình ảnh & tệp — chỉ khi tạo từ chat (fromMessage) -->
          <div v-if="fromMessageState" class="tfield media-section">
            <div class="media-head">
              <span class="tfield-label">Hình ảnh &amp; tệp ({{ attachments.length }})</span>
              <button
                type="button" class="add-media-btn"
                :disabled="!conversationId"
                @click="showPicker = true"
                title="Thêm từ media hội thoại Zalo"
              >
                <v-icon size="16">mdi-plus</v-icon> Thêm
              </button>
            </div>
            <div v-if="attachments.length" class="media-grid" ref="mediaGridRef">
              <div
                v-for="(a, idx) in attachments"
                :key="a.key"
                class="media-tile"
                :class="{ dragging: drag.activeKey.value === a.key, ghost: drag.ghostIndex.value === idx }"
                :data-drag-key="a.key"
                @pointerdown="onTilePointerDown($event, a)"
                @pointermove="drag.onPointerMove"
                @pointerup="drag.onPointerUp"
                @pointercancel="drag.onPointerCancel"
              >
                <img v-if="displayAttachUrl(a)" :src="displayAttachUrl(a)!" alt="" draggable="false" />
                <span v-else class="media-ph">{{ a.kind === 'video' ? '▶' : 'F' }}</span>
                <div class="media-tile-actions">
                  <button
                    v-if="a.kind === 'image' && a.mediaAssetId" type="button" class="tile-btn" title="Annotate"
                    @click.stop="openAnnotate(a)"
                  ><v-icon size="13">mdi-pencil</v-icon></button>
                  <button type="button" class="tile-btn danger" title="Gỡ" @click.stop="removeAttach(a.key)">
                    <v-icon size="13">mdi-close</v-icon>
                  </button>
                </div>
                <span class="media-tile-name">{{ a.name }}</span>
              </div>
            </div>
            <div v-else class="media-empty">
              Chưa chọn media — bấm Thêm để mở gallery ảnh/video/tệp của hội thoại này
            </div>
            <p v-if="pendingSourceCount > 0" class="media-hint">
              {{ pendingSourceCount }} media sẽ đính kèm khi lưu
            </p>
          </div>

          <div v-if="error" class="error-banner"><v-icon size="15">mdi-alert-outline</v-icon> {{ error }}</div>
        </div>

        <!-- Pop-out drag clone -->
        <Teleport to="body">
          <div
            v-if="drag.popOut.value"
            class="drag-clone"
            :style="{
              left: drag.popOut.value.x + 'px',
              top: drag.popOut.value.y + 'px',
              width: drag.popOut.value.w + 'px',
              height: drag.popOut.value.h + 'px',
            }"
          >
            <img v-if="drag.popOut.value.src" :src="drag.popOut.value.src" alt="" />
          </div>
        </Teleport>

        <WorkMediaPickerDialog
          v-model="showPicker"
          :conversation-id="conversationId"
          @pick="onPickerPick"
        />
        <WorkImageAnnotator
          v-model="showAnnotate"
          :media-asset-id="annotateTarget?.mediaAssetId || ''"
          :image-url="annotateTarget ? (displayAttachUrl(annotateTarget) || '') : ''"
          @applied="onAnnotated"
        />

        <!-- Footer -->
        <div class="editor-foot">
          <span class="tip"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> lưu · <kbd>Esc</kbd> huỷ</span>
          <div class="actions">
            <button type="button" class="btn btn--secondary" @click="close">Huỷ</button>
            <button type="button" class="btn btn--primary" :disabled="!canSubmit || saving" @click="submit">
              <v-icon v-if="!saving" size="16">mdi-check</v-icon>
              {{ saving ? 'Đang lưu...' : (isEdit ? 'Cập nhật' : (kind === 'task' ? 'Tạo công việc' : 'Tạo khiếu nại')) }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from 'vue';
import { api } from '@/api/index';
import { useAuthStore } from '@/stores/auth';
import { useUsers } from '@/composables/use-users';
import { useConfirm } from '@/composables/use-confirm';
import { orgWallClockToUtc, orgDayKey, getOrgParts } from '@/composables/use-org-timezone';
import { initials } from '@/composables/appointment-helpers';
import { useTasks, type Task, type TaskContactLite } from '@/composables/use-tasks';
import { useTickets, PRIORITY_META, COMPLAINT_CATEGORY_META, type Ticket, type TicketPriority, type ComplaintCategory } from '@/composables/use-tickets';
import {
  displayAttachUrl,
  type WorkAttachLocal,
} from '@/composables/work-attachment-types';
import { usePointerDragReorder } from '@/composables/usePointerDragReorder';
import WorkMediaPickerDialog from '@/components/work/WorkMediaPickerDialog.vue';
import WorkImageAnnotator from '@/components/work/WorkImageAnnotator.vue';

const { confirm } = useConfirm();
const { createTask, updateTask } = useTasks();
const { createTicket, updateTicket } = useTickets();

const PRIORITIES: TicketPriority[] = ['low', 'normal', 'high', 'urgent'];
const COMPLAINT_CATEGORIES: ComplaintCategory[] = ['refund', 'return', 'quality', 'shipping', 'other'];

export type WorkEditItem = { kind: 'task'; data: Task } | { kind: 'complaint'; data: Ticket };

const props = defineProps<{
  modelValue: boolean;
  /** Truyền → edit mode (loại cố định theo item.kind); null/absent → create */
  editItem?: WorkEditItem | null;
  /** Loại mặc định khi tạo mới (mở từ nút "+ Khiếu nại" riêng chẳng hạn) */
  defaultKind?: 'task' | 'complaint';
  /** Prefill KH khi mở từ panel chat */
  prefillContact?: TaskContactLite | null;
  /** Tạo từ 1 tin nhắn chat nhóm (2026-07-10). KH resolve ở BE từ người gửi → không dùng picker;
   *  hiện chip khoá "Từ tin nhắn của: {senderName}". senderIsCustomer=false ⇒ chỉ tạo task được. */
  fromMessage?: {
    kind: 'task' | 'complaint';
    text: string;
    sourceMessageId: string;
    /** Album / multi image — BE auto-attach all */
    sourceMessageIds?: string[];
    senderName: string | null;
    senderIsCustomer: boolean;
  } | null;
  /** Hội thoại Zalo đang mở — gallery "Thêm" lấy media từ chat này (không phải kho CRM). */
  conversationId?: string | null;
  /** Prefill attachments already in kho (optional) */
  prefillAttachments?: WorkAttachLocal[] | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'created', item: WorkEditItem): void;
  (e: 'updated', item: WorkEditItem): void;
}>();

const isEdit = computed(() => !!props.editItem);
const kind = ref<'task' | 'complaint'>('task');
const titleInputRef = ref<HTMLInputElement | null>(null);
const custSearchInputRef = ref<HTMLInputElement | null>(null);

const headTitle = computed(() => {
  if (kind.value === 'task') return isEdit.value ? 'Sửa công việc' : 'Tạo công việc';
  return isEdit.value ? 'Sửa khiếu nại' : 'Tạo khiếu nại';
});

const auth = useAuthStore();
const { users: fetchedUsers, fetchUsers } = useUsers();
const currentUserId = computed<string | null>(() => auth.user?.id ?? null);
const users = computed(() => {
  const list = [...(fetchedUsers.value as { id: string; fullName: string | null; email: string }[] ?? [])];
  const meId = currentUserId.value;
  if (meId && !list.some(u => u.id === meId)) {
    list.unshift({ id: meId, fullName: auth.user?.fullName ?? auth.user?.email ?? 'Tôi', email: auth.user?.email ?? '' });
  }
  return list;
});

const form = reactive({
  title: '',
  // task
  description: '',
  dueDate: '',
  dueTime: '',
  hasTime: false,
  // complaint
  summary: '',
  priority: 'normal' as TicketPriority,
  category: '' as ComplaintCategory | '',
  // shared
  assigneeUserId: '' as string,
});
const saving = ref(false);
const error = ref('');

// ── Chế độ "từ tin nhắn" (chat nhóm) ──────────────────────────────────────
// Khi set: KH resolve ở BE từ sourceMessageId (không dùng picker). Giữ trong session modal.
const fromMessageState = ref<{
  sourceMessageId: string;
  sourceMessageIds?: string[];
  senderName: string | null;
  senderIsCustomer: boolean;
} | null>(null);

// ── Attachments (chỉ khi fromMessage) ─────────────────────────────────────
const attachments = ref<WorkAttachLocal[]>([]);
const showPicker = ref(false);
const showAnnotate = ref(false);
const annotateTarget = ref<WorkAttachLocal | null>(null);
const mediaGridRef = ref<HTMLElement | null>(null);

const drag = usePointerDragReorder({
  items: attachments,
  getKey: (a) => a.key,
  onReorder: (next) => { attachments.value = next; },
});

function onTilePointerDown(e: PointerEvent, a: WorkAttachLocal) {
  if (!mediaGridRef.value) return;
  drag.onPointerDown(e, a.key, mediaGridRef.value, displayAttachUrl(a));
}
function removeAttach(key: string) {
  attachments.value = attachments.value.filter((x) => x.key !== key);
}
function onPickerPick(list: WorkAttachLocal[]) {
  // Gallery chat: dedupe theo sourceMessageId (message trong hội thoại).
  const existingMsg = new Set(
    attachments.value.map((a) => a.sourceMessageId).filter(Boolean) as string[],
  );
  const existingAsset = new Set(
    attachments.value.map((a) => a.mediaAssetId).filter(Boolean),
  );
  for (const a of list) {
    if (a.sourceMessageId && existingMsg.has(a.sourceMessageId)) continue;
    if (a.mediaAssetId && existingAsset.has(a.mediaAssetId)) continue;
    attachments.value.push(a);
  }
}
function openAnnotate(a: WorkAttachLocal) {
  // Annotate cần mediaAssetId trong kho — gallery chat chưa save thì bỏ qua (annotate sau khi tạo).
  if (!a.mediaAssetId) return;
  annotateTarget.value = a;
  showAnnotate.value = true;
}
function onAnnotated(payload: { blobId: string; url: string }) {
  const t = annotateTarget.value;
  if (!t) return;
  const idx = attachments.value.findIndex((x) => x.key === t.key);
  if (idx >= 0) {
    attachments.value[idx] = {
      ...attachments.value[idx],
      variantBlobId: payload.blobId,
      variantUrl: payload.url,
    };
  }
}
const conversationId = computed(() => props.conversationId || null);

/** Số media sẽ gửi lên BE (gallery đã chọn + tin nguồn image/video/file). */
const pendingSourceCount = computed(() => {
  if (!fromMessageState.value) return 0;
  const fromPicker = attachments.value
    .map((a) => a.sourceMessageId)
    .filter((id): id is string => !!id);
  // Chỉ đếm tin nguồn context nếu đó là media (image/video/file), không đếm text thuần.
  // Heuristic: nếu user đã pick gallery thì ưu tiên list pick; nếu attachments rỗng
  // nhưng sourceMessageIds có nhiều (album) hoặc tin gốc là media → đếm context.
  const fromContext = fromMessageState.value.sourceMessageIds ?? [fromMessageState.value.sourceMessageId];
  return new Set([...fromContext, ...fromPicker].filter(Boolean)).size;
});

function buildAttachmentPayload() {
  if (!fromMessageState.value) return {};
  // Gộp: tin nguồn lúc right-click + tin user chọn thêm trong gallery chat.
  const fromPicker = attachments.value
    .map((a) => a.sourceMessageId)
    .filter((id): id is string => !!id);
  const fromContext = fromMessageState.value.sourceMessageIds?.length
    ? fromMessageState.value.sourceMessageIds
    : [fromMessageState.value.sourceMessageId];
  // Nếu user đã chọn gallery: chỉ attach những gì họ chọn + (nếu tin gốc là media và chưa nằm trong pick) tin gốc.
  // Nếu chưa chọn gì: gửi sourceMessageIds context (album / image right-click auto-attach).
  const sourceMessageIds = fromPicker.length
    ? [...new Set([...fromPicker, ...fromContext])].filter(Boolean)
    : [...new Set(fromContext)].filter(Boolean);
  // Chỉ gửi mediaAssetIds đã có trong kho (annotate / prefill). Gallery chat → rỗng, BE dùng sourceMessageIds.
  const mediaAssetIds = attachments.value.map((a) => a.mediaAssetId).filter(Boolean);
  const attachmentsPayload = attachments.value
    .filter((a) => a.mediaAssetId)
    .map((a) => ({
      mediaAssetId: a.mediaAssetId,
      variantBlobId: a.variantBlobId,
      sourceMessageId: a.sourceMessageId ?? null,
    }));
  return {
    sourceMessageIds,
    mediaAssetIds: mediaAssetIds.length ? mediaAssetIds : undefined,
    attachments: attachmentsPayload.length ? attachmentsPayload : undefined,
  };
}

// ── Contact autocomplete ──────────────────────────────────────────────────
const selectedContact = ref<TaskContactLite | null>(null);
const custSuggestOpen = ref(false);
const custQuery = ref('');
const custSuggestions = ref<TaskContactLite[]>([]);
const custSearching = ref(false);
let custSearchHandle: number | null = null;

function openCustSuggest() {
  custSuggestOpen.value = true;
  nextTick(() => custSearchInputRef.value?.focus());
}

function onCustSearch() {
  if (custSearchHandle) window.clearTimeout(custSearchHandle);
  const q = custQuery.value.trim();
  if (!q) { custSuggestions.value = []; return; }
  custSearching.value = true;
  custSearchHandle = window.setTimeout(async () => {
    try {
      const res = await api.get('/contacts', { params: { search: q, limit: 8 } });
      const raw = (res.data.contacts ?? res.data ?? []).slice(0, 8);
      custSuggestions.value = raw.map((c: any) => ({
        id: c.id, fullName: c.fullName ?? null, phone: c.phone ?? null, avatarUrl: c.avatarUrl ?? null,
      }));
    } catch {
      custSuggestions.value = [];
    } finally {
      custSearching.value = false;
    }
  }, 220);
}

function pickContact(c: TaskContactLite) {
  selectedContact.value = c;
  custSuggestOpen.value = false;
  custQuery.value = '';
}

function onAvatarError() {
  if (selectedContact.value?.avatarUrl) {
    selectedContact.value = { ...selectedContact.value, avatarUrl: null };
  }
}

const PALETTE = ['#aa2d00', '#0a2e0e', '#d9a441', '#fcab79', '#a8d8c4', '#1b61c9'];
function contactColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// ── Init khi mở modal ────────────────────────────────────────────────────────
watch(() => props.modelValue, (open) => {
  if (!open) return;
  error.value = '';
  saving.value = false;
  custSuggestOpen.value = false;
  custQuery.value = '';
  fromMessageState.value = null;
  attachments.value = [];
  showPicker.value = false;
  showAnnotate.value = false;
  annotateTarget.value = null;
  if (!fetchedUsers.value.length) fetchUsers().catch(() => {});

  if (props.editItem) {
    kind.value = props.editItem.kind;
    if (props.editItem.kind === 'task') {
      const t = props.editItem.data;
      form.title = t.title;
      form.description = t.description || '';
      form.assigneeUserId = t.assigneeUserId;
      if (t.dueAt) {
        form.dueDate = orgDayKey(t.dueAt);
        form.hasTime = t.dueHasTime;
        if (t.dueHasTime) {
          const p = getOrgParts(t.dueAt);
          form.dueTime = p ? `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}` : '';
        } else {
          form.dueTime = '';
        }
      } else {
        form.dueDate = '';
        form.dueTime = '';
        form.hasTime = false;
      }
      selectedContact.value = t.contact
        ? { id: t.contact.id, fullName: t.contact.fullName, phone: t.contact.phone, avatarUrl: t.contact.avatarUrl ?? null }
        : null;
    } else {
      const t = props.editItem.data;
      form.title = t.title;
      form.summary = t.summary;
      form.priority = t.priority;
      form.category = t.category || '';
      form.assigneeUserId = t.assigneeUserId;
      selectedContact.value = t.contact
        ? { id: t.contact.id, fullName: t.contact.fullName, phone: t.contact.phone, avatarUrl: t.contact.avatarUrl ?? null }
        : null;
    }
  } else if (props.fromMessage) {
    // Tạo từ tin nhắn chat nhóm — KH resolve ở BE, prefill nội dung tin làm mô tả/summary.
    const fm = props.fromMessage;
    kind.value = fm.kind;
    form.title = '';
    form.description = fm.kind === 'task' ? fm.text : '';
    form.summary = fm.kind === 'complaint' ? fm.text : '';
    form.dueDate = '';
    form.dueTime = '';
    form.hasTime = false;
    form.priority = 'normal';
    form.category = '';
    form.assigneeUserId = currentUserId.value || '';
    selectedContact.value = null;
    fromMessageState.value = {
      sourceMessageId: fm.sourceMessageId,
      sourceMessageIds: fm.sourceMessageIds?.length ? fm.sourceMessageIds : [fm.sourceMessageId],
      senderName: fm.senderName,
      senderIsCustomer: fm.senderIsCustomer,
    };
    attachments.value = props.prefillAttachments ? props.prefillAttachments.map((a) => ({ ...a })) : [];
  } else {
    kind.value = props.defaultKind || 'task';
    form.title = '';
    form.description = '';
    form.dueDate = '';
    form.dueTime = '';
    form.hasTime = false;
    form.summary = '';
    form.priority = 'normal';
    form.category = '';
    form.assigneeUserId = currentUserId.value || '';
    selectedContact.value = props.prefillContact ? { ...props.prefillContact } : null;
  }
  nextTick(() => titleInputRef.value?.focus());
});

const canSubmit = computed(() => {
  if (!form.title.trim() || !form.assigneeUserId) return false;
  if (kind.value === 'complaint') {
    if (!form.summary.trim()) return false;
    // KH: chế độ "từ tin nhắn" dựa vào người gửi là KH (BE resolve); chế độ thường cần picker.
    const hasContact = fromMessageState.value ? fromMessageState.value.senderIsCustomer : !!selectedContact.value;
    if (!hasContact) return false;
  }
  return true;
});

/** Build dueAt UTC-instant từ wall-clock org. Không giờ cụ thể → 00:00 org-midnight. */
function buildDueAt(): string | null {
  if (!form.dueDate) return null;
  const d = orgWallClockToUtc(form.dueDate, form.hasTime ? form.dueTime : '00:00');
  return d ? d.toISOString() : null;
}

async function submit() {
  if (!canSubmit.value) {
    error.value = kind.value === 'complaint' ? 'Điền tiêu đề, mô tả và liên kết khách hàng trước khi lưu' : 'Điền tiêu đề trước khi lưu';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    const attPayload = buildAttachmentPayload();
    if (kind.value === 'task') {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        assigneeUserId: form.assigneeUserId,
        dueAt: buildDueAt(),
        dueHasTime: !!form.dueDate && form.hasTime && !!form.dueTime,
        // Từ tin nhắn → gửi sourceMessageId (BE resolve + gắn KH); thường → contactId từ picker.
        ...(fromMessageState.value
          ? { sourceMessageId: fromMessageState.value.sourceMessageId, ...attPayload }
          : { contactId: selectedContact.value?.id ?? null }),
      };
      if (isEdit.value && props.editItem?.kind === 'task') {
        const t = await updateTask(props.editItem.data.id, payload);
        if (t) emit('updated', { kind: 'task', data: t });
      } else {
        const t = await createTask(payload);
        if (t) emit('created', { kind: 'task', data: t });
      }
    } else {
      const payload = {
        title: form.title.trim(),
        summary: form.summary.trim(),
        priority: form.priority,
        category: form.category || null,
        assigneeUserId: form.assigneeUserId,
        ...(fromMessageState.value
          ? { sourceMessageId: fromMessageState.value.sourceMessageId, ...attPayload }
          : { contactId: selectedContact.value?.id ?? null }),
      };
      if (isEdit.value && props.editItem?.kind === 'complaint') {
        const t = await updateTicket(props.editItem.data.id, payload);
        if (t) emit('updated', { kind: 'complaint', data: t });
      } else {
        const t = await createTicket(payload);
        if (t) emit('created', { kind: 'complaint', data: t });
      }
    }
    close();
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'Không lưu được';
  } finally {
    saving.value = false;
  }
}

function close() {
  emit('update:modelValue', false);
}

const hasUnsavedChanges = computed(() => !!form.title.trim() || !!form.summary.trim() || !!form.description.trim());

async function requestClose() {
  if (!hasUnsavedChanges.value) {
    close();
    return;
  }
  const ok = await confirm({
    title: kind.value === 'task' ? 'Bỏ công việc đang tạo?' : 'Bỏ khiếu nại đang tạo?',
    message: 'Nội dung bạn vừa nhập sẽ không được lưu.',
    tone: 'danger',
  });
  if (ok) close();
}
</script>

<style scoped>
.editor-backdrop {
  position: fixed; inset: 0;
  background: rgba(24, 29, 38, 0.55);
  backdrop-filter: blur(4px);
  z-index: 100;
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.editor {
  width: 480px; max-width: 100%;
  max-height: 94vh;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.32), 0 2px 8px rgba(0, 0, 0, 0.12);
  display: flex; flex-direction: column;
  overflow: hidden; outline: none;
  color: #1a1d24;
}
.editor-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid #e5e7eb;
}
.editor-head h2 { font-size: 17px; font-weight: 500; margin: 0; display: flex; align-items: center; gap: 6px; }
.editor-head .close {
  width: 32px; height: 32px; border-radius: 8px;
  background: transparent; border: none; color: #6b7280; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.editor-body {
  flex: 1; overflow-y: auto;
  padding: 14px 18px;
  display: flex; flex-direction: column; gap: 14px;
}
.editor-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
  padding: 10px 18px;
  background: #f8fafc;
  border-top: 1px solid #e5e7eb;
}
.editor-foot .tip { font-size: 11.5px; color: #6b7280; }
.editor-foot kbd {
  display: inline-block; padding: 1px 5px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 4px;
  font-family: ui-monospace, Consolas, monospace; font-size: 10.5px;
}
.editor-foot .actions { display: flex; gap: 6px; }
.btn {
  padding: 7px 14px; border-radius: 8px; font-size: 13px; font-weight: 500;
  cursor: pointer; border: 1px solid #e5e7eb; background: #fff; color: #374151;
  display: inline-flex; align-items: center; gap: 4px;
}
.btn--primary { background: #2563eb; border-color: #2563eb; color: #fff; }
.btn--primary:disabled { opacity: 0.55; cursor: not-allowed; }

.kind-toggle {
  display: flex; gap: 4px;
  background: #f1f5f9; border-radius: 10px; padding: 3px;
}
.kind-btn {
  flex: 1; padding: 8px 10px; border-radius: 8px; font-size: 12.5px; font-weight: 500;
  border: none; background: transparent; color: #64748b; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 5px;
}
.kind-btn.active { background: #fff; color: #1a1d24; box-shadow: 0 1px 3px rgba(0,0,0,0.12); }

.tfield { display: flex; flex-direction: column; gap: 5px; }
.tfield-label {
  font-size: 11.5px; font-weight: 500; color: #6b7280;
  text-transform: uppercase; letter-spacing: 0.08em;
}
.row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

.title-input {
  width: 100%; height: 44px; padding: 0 12px;
  border: 1px solid #e5e7eb; border-radius: 8px;
  font-family: inherit; font-size: 15px; font-weight: 500; color: #1a1d24;
  outline: none;
}
.title-input:focus { border-color: #2563eb; }
.desc-area {
  width: 100%; padding: 8px 12px;
  border: 1px solid #e5e7eb; border-radius: 8px;
  font-family: inherit; font-size: 13px; color: #1a1d24;
  outline: none; resize: vertical;
}
.desc-area:focus { border-color: #2563eb; }
.assignee-select {
  width: 100%; height: 38px; padding: 0 10px;
  border: 1px solid #e5e7eb; border-radius: 8px;
  font-family: inherit; font-size: 13px; color: #1a1d24;
  background: #fff;
}
.due-row { display: flex; align-items: center; gap: 4px; }
.due-date {
  flex: 1; height: 38px; padding: 0 10px;
  border: 1px solid #e5e7eb; border-radius: 8px;
  font-family: inherit; font-size: 13px; color: #1a1d24;
}
.due-clear {
  width: 28px; height: 28px; border-radius: 6px;
  border: none; background: #f1f5f9; color: #6b7280; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.time-toggle {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: #4b5563; margin-top: 4px;
  cursor: pointer;
}
.due-time {
  height: 30px; padding: 0 8px;
  border: 1px solid #e5e7eb; border-radius: 6px;
  font-family: inherit; font-size: 12.5px;
}

.linked-kh-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px;
  background: #eff6ff; border: 1px solid #bfdbfe;
  border-radius: 8px; min-height: 52px;
}
/* Chế độ từ tin nhắn — KH khoá, không cho đổi (BE resolve theo người gửi). */
.from-msg-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px;
  background: #f5f3ff; border: 1px solid #ddd6fe;
  border-radius: 8px; min-height: 52px;
}
.from-msg-row .from-msg-ic { color: #7c3aed; flex-shrink: 0; }
.from-msg-row .linked-info { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
.from-msg-row .name { font-weight: 500; font-size: 13.5px; }
.from-msg-row .phone-row { font-size: 11.5px; color: #6b7280; }
.linked-kh-row .av,
.cust-item .av {
  width: 36px; height: 36px; border-radius: 50%;
  color: #fff;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 500; flex-shrink: 0; overflow: hidden;
}
.linked-kh-row .av img, .cust-item .av img {
  width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block;
}
.linked-kh-row .linked-info { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
.linked-kh-row .name { font-weight: 500; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.linked-kh-row .phone-row { font-size: 12px; color: #6b7280; }
.linked-kh-row .remove {
  width: 24px; height: 24px; border-radius: 50%;
  background: rgba(0, 0, 0, 0.08); border: none; cursor: pointer; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
}
.link-kh-btn {
  height: 38px; border: 1px dashed #cbd5e1; border-radius: 8px;
  background: transparent; color: #2563eb; font-size: 13px; font-weight: 500;
  cursor: pointer;
}
.link-kh-btn:hover { background: #eff6ff; }

.cust-suggest { border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
.cust-suggest-search {
  width: 100%; height: 38px; padding: 0 12px;
  border: none; border-bottom: 1px solid #e5e7eb;
  font-family: inherit; font-size: 13px; outline: none;
}
.cust-loading, .cust-empty { padding: 10px 12px; font-size: 12px; color: #94a3b8; }
.cust-item {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 12px; cursor: pointer; font-size: 13px;
}
.cust-item:hover { background: #f8fafc; }
.cust-item .name { font-weight: 500; }
.cust-item .phone { color: #6b7280; font-size: 12px; }
.cust-item.skip { color: #6b7280; font-size: 12px; justify-content: center; border-top: 1px dashed #e5e7eb; }

.error-banner {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 10px; border-radius: 8px;
  background: #fee2e2; color: #991b1b; font-size: 12.5px;
}

.media-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}
.add-media-btn {
  display: inline-flex; align-items: center; gap: 3px;
  height: 28px; padding: 0 10px; border-radius: 7px;
  border: 1px solid #bfdbfe; background: #eff6ff; color: #2563eb;
  font-size: 12px; font-weight: 600; cursor: pointer;
}
.add-media-btn:hover { background: #dbeafe; }
.media-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
  touch-action: none;
}
.media-tile {
  position: relative; aspect-ratio: 1; border-radius: 10px; overflow: hidden;
  background: #e5e7eb; border: 1.5px solid #e5e7eb; cursor: grab;
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
}
.media-tile.dragging { opacity: 0.35; }
.media-tile.ghost { outline: 2px dashed #2563eb; outline-offset: -2px; }
.media-tile img { width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none; }
.media-ph {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #64748b;
}
.media-tile-actions {
  position: absolute; top: 4px; right: 4px; display: flex; gap: 3px;
}
.tile-btn {
  width: 22px; height: 22px; border: none; border-radius: 6px;
  background: rgba(0,0,0,.55); color: #fff; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.tile-btn.danger:hover { background: #dc2626; }
.media-tile-name {
  position: absolute; left: 0; right: 0; bottom: 0; font-size: 10px; color: #fff;
  background: linear-gradient(transparent, rgba(0,0,0,.72)); padding: 10px 4px 3px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.media-empty {
  font-size: 12px; color: #94a3b8; font-style: italic;
  padding: 12px; text-align: center; border: 1px dashed #e5e7eb; border-radius: 8px;
}
.media-hint { font-size: 11px; color: #64748b; margin: 0; }
.drag-clone {
  position: fixed; z-index: 200; pointer-events: none;
  border-radius: 10px; overflow: hidden;
  box-shadow: 0 12px 32px rgba(0,0,0,.35);
  transform: scale(1.05) rotate(2deg); opacity: 0.95;
}
.drag-clone img { width: 100%; height: 100%; object-fit: cover; display: block; }

@media (max-width: 768px) {
  .row-2 { grid-template-columns: 1fr; }
  .editor { width: 100%; }
  .media-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
