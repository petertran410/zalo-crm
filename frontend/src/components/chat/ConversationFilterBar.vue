<template>
  <div class="cfb">
    <div class="cfb-mini">
      <span class="mini-count">
        <strong>{{ totalCount }}</strong> hội thoại
        <template v-if="counts.unread">
          <span class="dot">·</span>
          <span class="accent">{{ counts.unread }} chưa đọc</span>
        </template>
      </span>

      <button
        class="mini-sort"
        type="button"
        :title="filters.state.sortMode === 'unread-first' ? 'Đang ưu tiên chưa đọc' : 'Đang sắp xếp tin mới nhất'"
        @click="toggleSort"
      >
        {{ filters.state.sortMode === 'unread-first' ? 'Chưa đọc trước' : 'Mới nhất' }}
        <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { api } from '@/api/index';
import {
  Tag as TagIcon,
  Inbox as InboxIcon,
  CalendarClock as CalendarClockIcon,
  UserRoundCog as UserRoundCogIcon,
  ChevronDown as ChevronDownIcon,
  X as XIcon,
  Search as SearchIcon,
  Bot as BotIcon,
  MailQuestion as MailQuestionIcon,
  MailCheck as MailCheckIcon,
} from 'lucide-vue-next';
import type { AutoTagKey, MessageReplyState } from '@/composables/use-inbox-filters';

const props = defineProps<{
  filters: any;
  totalCount: number;
  counts: {
    unread?: number;
    unanswered?: number;
    stuck?: number;
    ready?: number;
    individual?: number;
    group?: number;
    main?: number;
    other?: number;
  };
  /** 2026-06-11 — tab Ưu tiên KHÔNG hiện số đếm, nhưng IN ĐẬM hơn khi có hội thoại
   *  chưa đọc trong tab này. Đọc hết → hết đậm. ChatView truyền cờ này xuống. */
  priorityHasUnread?: boolean;
  /** 2026-07-22 — v-model:collapsed cho phép parent (SalesChatView) ẩn cả search row. */
  collapsed?: boolean;
  /** 2026-07-22 — Role hiện tại (sales / manager / cs). Sales hiện dropdown filter bar. */
  currentRole?: string;
}>();

// 2026-06-20: phát khi click LẠI tab đang active → ChatView clear ô tìm kiếm.
const emit = defineEmits<{ 'reselect-tab': []; 'update:collapsed': [value: boolean] }>();

type TabKey = 'personal' | 'group' | 'main' | 'other';

const TABS: Array<{
  key: TabKey;
  label: string;
  tooltip: string;
}> = [
  { key: 'personal', label: 'Cá nhân', tooltip: 'Chỉ hội thoại 1-1 (user với user)' },
  { key: 'group',    label: 'Nhóm',    tooltip: 'Chỉ hội thoại nhóm' },
  { key: 'main',     label: 'Chính',   tooltip: 'Hộp thư chính (cả user lẫn nhóm)' },
  // 2026-06-11 — đổi "Khác" → "Ưu tiên" (key 'other' giữ nguyên, load-bearing
  // ở use-inbox-filters + PATCH /:id/tab). Hội thoại chuyển vào đây sẽ KHÔNG còn
  // ở tab Cá nhân nữa (loại trừ lẫn nhau, xử lý ở backend).
  { key: 'other',    label: 'Ưu tiên', tooltip: 'Hội thoại ưu tiên (đã ghim từ menu chuột phải)' },
];

function setActiveTab(key: TabKey) {
  // 2026-06-20 (anh báo): click LẠI tab đang active cũng phải clear ô tìm kiếm. activeTab
  // không đổi → watch ở ChatView không fire → emit 'reselect-tab' để parent tự clear search.
  const sameTab = props.filters.state.activeTab === key;
  // Single-active: tab khác sẽ tự deselect.
  props.filters.state.activeTab = key;
  if (sameTab) emit('reselect-tab');
}

function toggleSort() {
  props.filters.setSortMode(
    props.filters.state.sortMode === 'unread-first' ? 'recent' : 'unread-first'
  );
}

// ─── Filter collapse state ─────────────────────────────────────────────
/** Badge dot: true khi có bất kỳ filter nào đang bật (dùng khi thu gọn) */
const hasAnyActiveFilter = computed(() => {
  const s = props.filters.state;
  return (
    s.quickPills.size > 0 ||
    (s.tagsCrm?.length ?? 0) > 0 ||
    (s.tagsZalo?.length ?? 0) > 0 ||
    (s.autoTags?.length ?? 0) > 0 ||
    s.messageReplyState != null ||
    s.customerWaitingReply ||
    s.saleWaitingReply ||
    s.birthdayWithin7d ||
    s.appointmentWithin24h ||
    s.appointmentOverdue ||
    (s.saleAssigneeId != null && s.saleAssigneeId !== null)
  );
});

// ═══════════════════════════════════════════════════════════════════════
// SALES FILTER BAR — chỉ hoạt động khi currentRole === 'sales'
// 2026-07-22 (anh chốt): chuyển 4 bộ lọc (Tag, Tin nhắn, Lịch hẹn,
// Phụ trách) từ cột 1 sidebar sang dropdown bar ở đầu cột 2.
// ═══════════════════════════════════════════════════════════════════════

// ─── Dropdown state ───────────────────────────────────────────────────
type DropdownKey = 'tag' | 'message' | 'event' | 'sale';
const openDropdown = ref<DropdownKey | null>(null);
const salesBarRef = ref<HTMLElement | null>(null);

function toggleDropdown(key: DropdownKey) {
  openDropdown.value = openDropdown.value === key ? null : key;
}

function onDocClick(e: MouseEvent) {
  if (!openDropdown.value) return;
  const target = e.target as HTMLElement;
  if (target.closest('.cfb-sales-bar')) return;
  openDropdown.value = null;
}
function onDocKey(e: KeyboardEvent) {
  if (e.key === 'Escape') openDropdown.value = null;
}

// ─── Tags data (fetch từ backend khi role = sales) ────────────────────
type SidebarTag = { id: string; name: string; emoji: string | null; color: string | null };
const crmTagsList = ref<SidebarTag[]>([]);
const zaloTagsList = ref<SidebarTag[]>([]);
const tagSearch = ref('');

async function loadSidebarTags() {
  if (props.currentRole !== 'sales') return;
  try {
    const { data } = await api.get('/conversations/sidebar-tags');
    crmTagsList.value = (data.crmTags || []).map((name: string, i: number) => ({
      id: `crm-${name}`, name, emoji: null, color: null,
    }));
    zaloTagsList.value = (data.zaloTags || []).map(
      (t: { name: string; color: string; emoji: string | null }, i: number) => ({
        id: `zalo-${i}-${t.name}`, name: t.name, emoji: t.emoji, color: t.color,
      }),
    );
  } catch { /* im lặng */ }
}

const filteredCrmTags = computed(() => {
  const q = tagSearch.value.trim().toLowerCase();
  return q ? crmTagsList.value.filter(t => t.name.toLowerCase().includes(q)) : crmTagsList.value;
});

const filteredZaloTags = computed(() => {
  const q = tagSearch.value.trim().toLowerCase();
  return q ? zaloTagsList.value.filter(t => t.name.toLowerCase().includes(q)) : zaloTagsList.value;
});

// ─── Event counts (số đếm cho badge lịch hẹn / tin nhắn) ─────────────
const eventCounts = ref({
  birthday: 0, appointmentSoon: 0, appointmentOverdue: 0,
  msgUnanswered: 0, msgBotNoSale: 0, msgSaleReplied: 0,
});

async function loadEventCounts() {
  if (props.currentRole !== 'sales') return;
  try {
    const params: Record<string, string> = {};
    switch (props.filters.state.activeTab) {
      case 'personal': params.threadType = 'user'; break;
      case 'group':    params.threadType = 'group'; break;
      case 'main':     params.tab = 'main'; break;
      case 'other':    params.tab = 'other'; break;
    }
    const { data } = await api.get('/conversations/event-counts', { params });
    eventCounts.value = {
      birthday: data.birthday ?? 0,
      appointmentSoon: data.appointmentSoon ?? 0,
      appointmentOverdue: data.appointmentOverdue ?? 0,
      msgUnanswered: data.msgUnanswered ?? 0,
      msgBotNoSale: data.msgBotNoSale ?? 0,
      msgSaleReplied: data.msgSaleReplied ?? 0,
    };
  } catch { /* badge ẩn khi = 0 */ }
}

// Reload khi tab thay đổi
watch(() => props.filters.state.activeTab, () => {
  if (props.currentRole === 'sales') loadEventCounts();
});

// ─── Auto-tags ────────────────────────────────────────────────────────
const AUTO_TAGS: Array<{ key: AutoTagKey; icon: string; label: string; tip: string }> = [
  { key: 'active', icon: '🔥', label: 'Hoạt động', tip: 'KH vừa nhắn tin trong 24h qua — đang tương tác tích cực.' },
  { key: 'ready',  icon: '💯', label: 'Sẵn sàng chốt', tip: 'Điểm tiềm năng ≥ 80 — nên đẩy báo giá/booking ngay.' },
  { key: 'stuck',  icon: '⏰', label: 'Đình trệ', tip: 'KH kẹt một trạng thái quá lâu — cần rà soát lý do.' },
  { key: 'cold',   icon: '🧊', label: 'Nguội', tip: 'KH im lặng 15–60 ngày — cần hâm nóng lại.' },
];

// ─── Message reply states ─────────────────────────────────────────────
const MESSAGE_REPLY_STATES: Array<{
  key: NonNullable<MessageReplyState>;
  icon: unknown;
  label: string;
  tip: string;
  countKey: 'msgUnanswered' | 'msgBotNoSale' | 'msgSaleReplied';
}> = [
  { key: 'unanswered',  icon: MailQuestionIcon, label: 'Chưa trả lời',        countKey: 'msgUnanswered',
    tip: 'Khách nhắn cuối, chưa có sale lẫn bot trả lời — cần xử lý ngay.' },
  { key: 'bot_no_sale', icon: BotIcon,          label: 'Bot trả lời (No Sale)', countKey: 'msgBotNoSale',
    tip: 'Khách nhắn xong chỉ có bot trả lời, chưa sale nào vào — dễ bị bỏ sót.' },
  { key: 'sale_replied',icon: MailCheckIcon,    label: 'Sale đã trả lời',     countKey: 'msgSaleReplied',
    tip: 'Đã có sale thật trả lời sau lượt khách nhắn cuối.' },
];

// ─── Active counts (badge trên mỗi nút dropdown) ─────────────────────
const tagActiveCount = computed(() =>
  (props.filters.state.tagsCrm?.length ?? 0) +
  (props.filters.state.tagsZalo?.length ?? 0) +
  (props.filters.state.autoTags?.length ?? 0)
);
const msgActiveCount = computed(() =>
  (props.filters.state.messageReplyState ? 1 : 0) +
  (props.filters.state.customerWaitingReply ? 1 : 0) +
  (props.filters.state.saleWaitingReply ? 1 : 0)
);
const eventActiveCount = computed(() =>
  (props.filters.state.birthdayWithin7d ? 1 : 0) +
  (props.filters.state.appointmentWithin24h ? 1 : 0) +
  (props.filters.state.appointmentOverdue ? 1 : 0)
);
const saleActiveCount = computed(() =>
  props.filters.state.saleAssigneeId === 'all' ? 1 :
  props.filters.state.saleAssigneeId === 'unassigned' ? 1 : 0
);

const salesHasActiveFilter = computed(() =>
  tagActiveCount.value > 0 ||
  msgActiveCount.value > 0 ||
  eventActiveCount.value > 0 ||
  saleActiveCount.value > 0
);

// ─── Active chips (hiển thị phía dưới để xoá từng filter) ────────────
const salesActiveChips = computed(() => {
  const chips: Array<{ key: string; label: string; remove: () => void }> = [];
  for (const t of props.filters.state.tagsCrm as string[]) {
    chips.push({ key: `crm:${t}`, label: `🏷 ${t}`,
      remove: () => { props.filters.state.tagsCrm = props.filters.state.tagsCrm.filter((x: string) => x !== t); } });
  }
  for (const t of props.filters.state.tagsZalo as string[]) {
    chips.push({ key: `zalo:${t}`, label: `🔵 ${t}`,
      remove: () => { props.filters.state.tagsZalo = props.filters.state.tagsZalo.filter((x: string) => x !== t); } });
  }
  const AUTO_LABELS: Record<string, string> = {
    active: '🔥 Hoạt động', ready: '💯 Sẵn sàng', stuck: '⏰ Đình trệ', cold: '🧊 Nguội',
  };
  for (const at of props.filters.state.autoTags as string[]) {
    chips.push({ key: `auto:${at}`, label: AUTO_LABELS[at] ?? at,
      remove: () => { props.filters.state.autoTags = props.filters.state.autoTags.filter((x: string) => x !== at); } });
  }
  if (props.filters.state.messageReplyState) {
    const MSG_LABELS: Record<string, string> = { unanswered: '✉️ Chưa reply', bot_no_sale: '🤖 Bot reply', sale_replied: '✅ Sale reply' };
    chips.push({ key: 'msg', label: MSG_LABELS[props.filters.state.messageReplyState] ?? props.filters.state.messageReplyState,
      remove: () => { props.filters.state.messageReplyState = null; } });
  }
  if (props.filters.state.customerWaitingReply) chips.push({ key: 'kh-wait', label: 'KH chờ reply', remove: () => { props.filters.state.customerWaitingReply = false; } });
  if (props.filters.state.saleWaitingReply)     chips.push({ key: 'sale-wait', label: 'Sale chờ reply', remove: () => { props.filters.state.saleWaitingReply = false; } });
  if (props.filters.state.birthdayWithin7d)     chips.push({ key: 'bday', label: '🎂 SN 7d', remove: () => { props.filters.state.birthdayWithin7d = false; } });
  if (props.filters.state.appointmentWithin24h) chips.push({ key: 'appt', label: '📞 Hẹn 24h', remove: () => { props.filters.state.appointmentWithin24h = false; } });
  if (props.filters.state.appointmentOverdue)   chips.push({ key: 'appt-ov', label: '⚠️ Quá hạn', remove: () => { props.filters.state.appointmentOverdue = false; } });
  if (props.filters.state.saleAssigneeId === 'all')         chips.push({ key: 'sale-all',  label: '👥 Tất cả sale', remove: () => { props.filters.state.saleAssigneeId = null; } });
  if (props.filters.state.saleAssigneeId === 'unassigned')  chips.push({ key: 'sale-none', label: '🆕 Chưa giao',    remove: () => { props.filters.state.saleAssigneeId = null; } });
  return chips;
});

// ─── Toggle helpers ───────────────────────────────────────────────────
function toggleCrmTag(name: string) {
  const arr = props.filters.state.tagsCrm as string[];
  const idx = arr.indexOf(name);
  if (idx >= 0) arr.splice(idx, 1); else arr.push(name);
}
function toggleZaloTag(name: string) {
  const arr = props.filters.state.tagsZalo as string[];
  const idx = arr.indexOf(name);
  if (idx >= 0) arr.splice(idx, 1); else arr.push(name);
}
function toggleAutoTag(key: AutoTagKey) {
  const arr = props.filters.state.autoTags as AutoTagKey[];
  const idx = arr.indexOf(key);
  if (idx >= 0) arr.splice(idx, 1); else arr.push(key);
}
function selectMessageReplyState(key: NonNullable<MessageReplyState>) {
  props.filters.state.messageReplyState = props.filters.state.messageReplyState === key ? null : key;
}
function clearSalesFilters() {
  props.filters.state.tagsCrm = [];
  props.filters.state.tagsZalo = [];
  props.filters.state.autoTags = [];
  props.filters.state.messageReplyState = null;
  props.filters.state.customerWaitingReply = false;
  props.filters.state.saleWaitingReply = false;
  props.filters.state.birthdayWithin7d = false;
  props.filters.state.appointmentWithin24h = false;
  props.filters.state.appointmentOverdue = false;
  props.filters.state.saleAssigneeId = null;
  openDropdown.value = null;
}

// ─── Lifecycle ───────────────────────────────────────────────────────
onMounted(() => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onDocKey);
  if (props.currentRole === 'sales') {
    loadSidebarTags();
    loadEventCounts();
  }
});
onUnmounted(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onDocKey);
});
</script>

<style scoped>
.cfb { display: none; }
.cfb-mini {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 5px 13px;
  background: var(--app-surface-panel);
  font-size: 10.5px;
  color: var(--app-text-muted);
  border-bottom: 1px solid var(--app-border-subtle);
}
.mini-count strong { color: var(--app-text-primary); font-weight: 700; }
.mini-count .dot { margin: 0 4px; color: var(--app-text-muted); }
.mini-count .accent { color: var(--app-accent); font-weight: 700; }
.mini-sort {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  padding: 3px 6px;
  border-radius: var(--app-radius-sm);
  background: transparent;
  border: 1px solid transparent;
  color: var(--app-text-secondary);
  font-weight: 600;
  font-size: 10.5px;
  font-family: inherit;
  white-space: nowrap;
  transition: color .15s ease, background .15s ease, border-color .15s ease;
}
.mini-sort:hover { color: var(--app-accent); background: var(--app-accent-soft); border-color: color-mix(in srgb, var(--app-accent) 20%, transparent); }
.mini-sort .ic { width: 10px; height: 10px; opacity: .7; }

/* ① Quick pills — compact 2-line layout, tiết kiệm chiều cao */
.cfb-pills-wrap {
  border-bottom: 1px solid #F3F4F6;
}
.cfb-pills {
  display: flex;
  gap: 4px;
  padding: 5px 10px;
  align-items: center;
}

.pill {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 4px 4px 3px;
  border-radius: 10px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;
  border: 1px solid #E5E7EB;
  background: white;
  color: #4B5563;
  font-family: inherit;
  line-height: 1.2;
}
.pill .pill-label {
  font-size: 10px;
  white-space: nowrap;
  font-weight: 500;
}
.pill:hover {
  background: #FAFBFC;
  border-color: #D1D5DB;
  color: #111827;
}

/* Active state */
.pill.alert.active   { background: #FEF2F2; border-color: #FCA5A5; color: #B91C1C; font-weight: 600; }
.pill.warning.active { background: #FFFBEB; border-color: #FCD34D; color: #B45309; font-weight: 600; }
.pill.danger.active  { background: #FEF2F2; border-color: #F87171; color: #B91C1C; font-weight: 600; }
.pill.success.active { background: #F0FDF4; border-color: #86EFAC; color: #047857; font-weight: 600; }

/* Count */
.pill .count {
  color: #6B7280;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  transition: color 0.18s ease;
}
.pill.alert.active .count   { color: #B91C1C; }
.pill.warning.active .count { color: #B45309; }
.pill.danger.active .count  { color: #B91C1C; }
.pill.success.active .count { color: #047857; }

/* ══════════════════════════════════════════════════════════════════════
   ② SALES FILTER BAR — chip tích hợp inline cùng hàng nút dropdown
   2026-07-22: Không còn dòng chip riêng bên dưới tiết kiệm ~24px.
   ══════════════════════════════════════════════════════════════════════ */
.cfb-sales-bar {
  position: relative;
  border-bottom: 1px solid #F0F1F3;
  background: #FAFBFC;
}

.cfb-sales-btns {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  flex-wrap: wrap;
}

/* Dropdown trigger button — compact */
.sfb-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 7px 3px 6px;
  border-radius: 7px;
  border: 1px solid #E5E7EB;
  background: white;
  color: #4B5563;
  font-size: 11px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  line-height: 1.3;
}
.sfb-btn:hover {
  border-color: #6366F1;
  color: #6366F1;
  background: #F5F5FF;
}
.sfb-btn.active {
  background: #EEF2FF;
  border-color: #6366F1;
  color: #4338CA;
  font-weight: 600;
}
.sfb-btn.open {
  background: #EEF2FF;
  border-color: #6366F1;
  color: #4338CA;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
}

/* Badge */
.sfb-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: #6366F1;
  color: white;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
}

.sfb-caret {
  opacity: 0.5;
  transition: transform 0.2s ease;
  flex-shrink: 0;
}
.sfb-caret.open {
  transform: rotate(180deg);
  opacity: 0.8;
}

/* Nut Xoa loc — compact */
.sfb-clear {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  border-radius: 6px;
  border: 1px dashed #FCA5A5;
  background: #FEF2F2;
  color: #DC2626;
  font-size: 10px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-left: auto;
}
.sfb-clear:hover {
  background: #FEE2E2;
  border-color: #F87171;
}

/* Divider ngan giua nut va chip inline */
.sfb-divider {
  width: 1px;
  height: 16px;
  background: #E5E7EB;
  margin: 0 2px;
  flex-shrink: 0;
}

/* Chip inline (cung hang voi nut, khong co dong rieng) */
.sfb-chip-inline {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid #C7D2FE;
  background: #EEF2FF;
  color: #4338CA;
  font-size: 10px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.12s;
  white-space: nowrap;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sfb-chip-inline:hover {
  background: #E0E7FF;
  border-color: #A5B4FC;
}

/* Panel dropdown (floating) */
.sfb-panel {
  position: absolute;
  top: calc(100% + 2px);
  left: 10px;
  z-index: 120;
  width: 260px;
  max-height: 380px;
  display: flex;
  flex-direction: column;
  background: white;
  border: 1px solid #E5E7EB;
  border-radius: 14px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06);
  overflow: hidden;
  animation: sfb-panel-in 0.15s ease;
}
@keyframes sfb-panel-in {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}

.sfb-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 8px;
  border-bottom: 1px solid #F3F4F6;
  flex-shrink: 0;
}
.sfb-panel-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 700;
  color: #374151;
}
.sfb-panel-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #9CA3AF;
  cursor: pointer;
  transition: background 0.15s;
}
.sfb-panel-close:hover { background: #F3F4F6; color: #374151; }

.sfb-panel-body {
  overflow-y: auto;
  padding: 8px 12px 12px;
  flex: 1;
}

.sfb-sub-label {
  font-size: 10px;
  font-weight: 600;
  color: #9CA3AF;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 8px 0 5px;
}
.sfb-sub-label:first-child { margin-top: 0; }

/* Tag chips ben trong panel */
.sfb-chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 4px;
}
.sfb-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 9px;
  border-radius: 8px;
  border: 1px solid #E5E7EB;
  background: white;
  color: #4B5563;
  font-size: 11px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.12s ease;
}
.sfb-chip:hover  { border-color: #6366F1; color: #4338CA; background: #F0F0FF; }
.sfb-chip.selected { background: #EEF2FF; border-color: #6366F1; color: #4338CA; font-weight: 600; }
.sfb-chip--zalo  { border-color: #BFDBFE; color: #1D4ED8; }
.sfb-chip--zalo.selected { background: #DBEAFE; border-color: #3B82F6; }
.sfb-chip-emoji  { font-size: 11px; }

/* Search input trong panel */
.sfb-search-row {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #F9FAFB;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  padding: 5px 8px;
  margin-bottom: 8px;
  color: #9CA3AF;
}
.sfb-search-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 11.5px;
  color: #374151;
  font-family: inherit;
}
.sfb-search-input::placeholder { color: #9CA3AF; }
.sfb-search-clear {
  border: none;
  background: transparent;
  color: #9CA3AF;
  cursor: pointer;
  display: flex;
  align-items: center;
}
.sfb-search-clear:hover { color: #6B7280; }

/* Row hang radio/checkbox */
.sfb-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s ease;
}
.sfb-row:hover { background: #F9FAFB; }
.sfb-row.checked { background: #EEF2FF; }
.sfb-row-left {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: #374151;
}
.sfb-row.checked .sfb-row-left { color: #4338CA; font-weight: 600; }
.sfb-row-icon { width: 16px; text-align: center; font-size: 13px; flex-shrink: 0; }
.sfb-row-lbl  { font-size: 12px; }
.sfb-row-count {
  font-size: 10.5px;
  font-weight: 700;
  color: #6B7280;
  background: #F3F4F6;
  padding: 1px 6px;
  border-radius: 6px;
  font-variant-numeric: tabular-nums;
}
.sfb-row-count.red   { background: #FEE2E2; color: #DC2626; }
.sfb-row-count.amber { background: #FEF3C7; color: #B45309; }

/* Checkbox / radio visual */
.sfb-check-box,
.sfb-radio {
  width: 14px;
  height: 14px;
  border: 1.5px solid #D1D5DB;
  border-radius: 3px;
  flex-shrink: 0;
  transition: all 0.12s;
}
.sfb-radio { border-radius: 50%; }
.sfb-row.checked .sfb-check-box,
.sfb-row.checked .sfb-radio {
  border-color: #6366F1;
  background: #6366F1;
  box-shadow: inset 0 0 0 2px white;
}

.sfb-empty {
  text-align: center;
  color: #9CA3AF;
  font-size: 11.5px;
  padding: 16px 0;
}

/* ③ Main Tab style — 4 tabs compact */
.cfb-tabs.main-tab-style {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: 5px;
  margin: 6px 10px 0;
  background: #F3F4F6;
  border-radius: 10px;
  gap: 2px;
  border-bottom: none;
}
.cfb-tabs.main-tab-style .cfb-tab {
  padding: 6px 1px;
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: -0.2px;
  color: #6B7280;
  cursor: pointer;
  border: none;
  background: transparent;
  border-radius: 7px;
  transition: background-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  overflow: hidden;
  font-family: inherit;
}
.cfb-tabs.main-tab-style .cfb-tab:hover {
  background: rgba(255, 255, 255, 0.6);
  color: #4338CA;
}
.cfb-tabs.main-tab-style .cfb-tab.active {
  background: white;
  color: #6366F1;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(99, 102, 241, 0.1);
}
.cfb-tabs.main-tab-style .cfb-tab.has-unread:not(.active) {
  color: #111827;
  font-weight: 800;
}
.cfb-tabs.main-tab-style .cfb-tab.has-unread .tab-label::after {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-left: 5px;
  border-radius: 50%;
  background: #EF4444;
  vertical-align: middle;
}
.cfb-tab .tab-label { overflow: hidden; text-overflow: ellipsis; }
.cfb-tabs.main-tab-style .cfb-tab .tab-label { overflow: visible; text-overflow: clip; }
.cfb-tabs.main-tab-style + .cfb-mini { margin-top: 6px; }

/* Mini row styles are defined with the primary header controls above. */

/* ══ MINI-RIGHT: group sort + collapse btn ══════════════════════════════ */
.mini-right {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* ══ COLLAPSE TOGGLE BUTTON ══════════════════════════════════════════════
   Nút mũi tên nhỏ ở cuối mini-row để thu gọn / mở phần filter phía trên.
   Mũi tên xoay 180° khi collapsed để chỉ hướng "bấm để mở ra".           */
.mini-collapse-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid #D1D5DB; /* Gray-300 — luôn hiển thị để dễ nhận diện */
  background: #F9FAFB;        /* Gray-50 nền nhạt */
  color: #6B7280;             /* Gray-500 — màu xám rõ ràng */
  cursor: pointer;
  padding: 0;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  flex-shrink: 0;
}
.mini-collapse-btn svg {
  width: 12px;
  height: 12px;
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}
.mini-collapse-btn:hover {
  background: white;
  border-color: #9CA3AF;
  color: #374151;
}
/* Khi thu gọn: mũi tên xoay 180° chỉ xuống "bấm để mở" */
.mini-collapse-btn.is-collapsed svg {
  transform: rotate(180deg);
}
/* Khi có filter đang active & đang thu gọn: tô màu để alert user */
.mini-collapse-btn.has-active {
  color: #6366F1;
  border-color: #C7D2FE;
  background: #EEF2FF;
}

/* Badge dot đỏ nhỏ khi có filter active mà đang thu gọn */
.collapse-dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #EF4444;
  border: 1px solid white;
}

/* ══ COLLAPSIBLE FILTER AREA ════════════════════════════════════════════
   Dùng max-height + overflow hidden để animate đóng/mở mượt mà.
   Không dùng v-show trực tiếp để tránh mất transition khi display: none.  */
.cfb-collapsible {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.cfb-collapsible.cfb-collapsible--open {
  max-height: 400px; /* đủ rộng để chứa pills + sales bar + 4 tabs */
}
</style>
