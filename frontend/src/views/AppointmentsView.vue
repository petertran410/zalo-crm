<template>
  <div class="apt-page rail-scope">
    <!-- Tab con Lịch hẹn | Công việc — 1 mặt "Schedule" (2026-08-04) -->
    <ScheduleTabs />

    <!-- ── Hàng tiêu đề: khoảng tuần + điều hướng + đổi view + tạo mới ──── -->
    <header class="apt-top">
      <h1 class="apt-range">{{ weekRangeLabel }}</h1>
      <div class="apt-sub">{{ weekMetaLabel }}</div>

      <div class="apt-nav">
        <button type="button" class="rl-icon-btn" aria-label="Tuần trước" @click="shiftWeek(-1)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 5l-7 7 7 7" /></svg>
        </button>
        <button type="button" class="rl-icon-btn" aria-label="Tuần sau" @click="shiftWeek(1)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.5 5l7 7-7 7" /></svg>
        </button>
        <button type="button" class="rl-btn nav-today" @click="goToToday">Hôm nay</button>
      </div>

      <div class="apt-top-spacer" />

      <div class="apt-seg" role="tablist" aria-label="Kiểu hiển thị">
        <button
          type="button"
          role="tab"
          :aria-selected="viewMode === 'week'"
          :class="{ active: viewMode === 'week' }"
          :disabled="isNarrow"
          :title="isNarrow ? 'Lưới tuần cần màn ≥ 900px' : ''"
          @click="pickView('week')"
        >Tuần</button>
        <button
          type="button"
          role="tab"
          :aria-selected="viewMode === 'agenda'"
          :class="{ active: viewMode === 'agenda' }"
          @click="pickView('agenda')"
        >Danh sách</button>
      </div>

      <button type="button" class="rl-btn rl-btn--primary" @click="openCreate(null)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14" /></svg>
        <span class="btn-label">Tạo lịch hẹn</span>
      </button>
    </header>

    <!-- ── Thanh lọc: gộp sidebar cũ + dải chip trùng lặp thành 1 hàng ──── -->
    <div class="apt-filters">
      <v-menu :close-on-content-click="false" location="bottom start">
        <template #activator="{ props: act }">
          <button type="button" v-bind="act" class="rl-filter" :class="{ 'is-active': scope !== 'me' }">
            <span class="rl-filter__k">Phạm vi</span><span class="rl-filter__v">{{ scopeValueLabel }}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        </template>
        <v-list density="compact" min-width="190" class="rl-menu">
          <v-list-item v-for="o in SCOPE_OPTIONS" :key="o.value" @click="scope = o.value">
            <template #prepend>
              <v-icon size="16" :class="scope === o.value ? 'rl-tick on' : 'rl-tick'">
                {{ scope === o.value ? 'mdi-radiobox-marked' : 'mdi-radiobox-blank' }}
              </v-icon>
            </template>
            <v-list-item-title>{{ o.text }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>

      <v-menu :close-on-content-click="false" location="bottom start">
        <template #activator="{ props: act }">
          <button type="button" v-bind="act" class="rl-filter" :class="{ 'is-active': statusFiltered }">
            <span class="rl-filter__k">Trạng thái</span><span class="rl-filter__v">{{ statusValueLabel }}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        </template>
        <v-list density="compact" min-width="230" class="rl-menu">
          <v-list-item v-for="o in APPOINTMENT_STATUS_OPTIONS" :key="o.value" @click="toggleStatus(o.value)">
            <template #prepend>
              <v-icon size="16" :class="selectedStatuses.has(o.value) ? 'rl-tick on' : 'rl-tick'">
                {{ selectedStatuses.has(o.value) ? 'mdi-checkbox-marked' : 'mdi-checkbox-blank-outline' }}
              </v-icon>
            </template>
            <v-list-item-title class="rl-menu-row">
              <span>{{ o.text }}</span><span class="rl-menu-count">{{ countByStatus[o.value] || 0 }}</span>
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>

      <v-menu :close-on-content-click="false" location="bottom start">
        <template #activator="{ props: act }">
          <button type="button" v-bind="act" class="rl-filter" :class="{ 'is-active': typeFiltered }">
            <span class="rl-filter__k">Loại</span><span class="rl-filter__v">{{ typeValueLabel }}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        </template>
        <v-list density="compact" min-width="230" class="rl-menu">
          <v-list-item v-for="o in APPOINTMENT_TYPE_OPTIONS" :key="o.value" @click="toggleType(o.value)">
            <template #prepend>
              <v-icon size="16" :class="selectedTypes.has(o.value) ? 'rl-tick on' : 'rl-tick'">
                {{ selectedTypes.has(o.value) ? 'mdi-checkbox-marked' : 'mdi-checkbox-blank-outline' }}
              </v-icon>
            </template>
            <v-list-item-title class="rl-menu-row">
              <span>{{ typeIcon(o.value) }} {{ o.text }}</span><span class="rl-menu-count">{{ countByType[o.value] || 0 }}</span>
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>

      <v-menu :close-on-content-click="false" location="bottom start">
        <template #activator="{ props: act }">
          <button type="button" v-bind="act" class="rl-filter" :class="{ 'is-active': source !== 'all' }">
            <span class="rl-filter__k">Nguồn</span><span class="rl-filter__v">{{ sourceValueLabel }}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        </template>
        <v-list density="compact" min-width="180" class="rl-menu">
          <v-list-item v-for="o in SOURCE_OPTIONS" :key="o.value" @click="source = o.value">
            <template #prepend>
              <v-icon size="16" :class="source === o.value ? 'rl-tick on' : 'rl-tick'">
                {{ source === o.value ? 'mdi-radiobox-marked' : 'mdi-radiobox-blank' }}
              </v-icon>
            </template>
            <v-list-item-title>{{ o.text }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>

      <v-menu v-if="scope !== 'me'" :close-on-content-click="false" location="bottom start">
        <template #activator="{ props: act }">
          <button type="button" v-bind="act" class="rl-filter" :class="{ 'is-active': repsFiltered }">
            <span class="rl-filter__k">Sale</span>
            <span class="rep-stack">
              <span
                v-for="u in repPreview"
                :key="u.id"
                class="rl-avatar rep-av"
                :style="{ background: saleColor(u.id).bg }"
                :title="u.fullName"
              >{{ initials(u.fullName) }}</span>
              <span v-if="repOverflow > 0" class="rl-avatar rep-av rep-more">+{{ repOverflow }}</span>
            </span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        </template>
        <v-list density="compact" min-width="250" max-height="340" class="rl-menu">
          <v-list-item v-for="u in users" :key="u.id" @click="toggleSale(u.id)">
            <template #prepend>
              <v-icon size="16" :class="selectedSales.has(u.id) ? 'rl-tick on' : 'rl-tick'">
                {{ selectedSales.has(u.id) ? 'mdi-checkbox-marked' : 'mdi-checkbox-blank-outline' }}
              </v-icon>
            </template>
            <v-list-item-title class="rl-menu-row">
              <span class="rl-menu-sale">
                <span class="swatch" :style="{ background: saleColor(u.id).bg }" />
                {{ u.fullName }}<template v-if="u.id === currentUserId"> (tôi)</template>
              </span>
              <span class="rl-menu-count">{{ countBySale[u.id] || 0 }}</span>
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>

      <button v-if="anyFilterActive" type="button" class="filter-reset" @click="resetFilters">Đặt lại</button>

      <div class="apt-filters-spacer" />

      <div class="apt-tally">
        <b>{{ visibleAppointments.length }}</b> lịch hẹn<template v-if="overdueCount">
          · <span class="tally-overdue">{{ overdueCount }} quá hạn</span>
        </template>
      </div>
    </div>

    <!-- Thanh mảnh khi đang tải lại nhưng đã có dữ liệu cũ trên màn -->
    <div v-if="loading && appointments.length" class="apt-refetch" role="status" aria-label="Đang tải lại lịch hẹn" />

    <!-- ── Cảnh báo bị cắt bớt ───────────────────────────────────────── -->
    <div v-if="truncated" class="apt-truncated" role="status">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 8v5M12 16.5v.01" /><circle cx="12" cy="12" r="9" />
      </svg>
      <span>
        Tuần này có <b>{{ total }}</b> lịch hẹn, chỉ tải được <b>{{ appointments.length }}</b>.
        Thu hẹp phạm vi hoặc bộ lọc để xem đủ.
      </span>
    </div>

    <!-- ── Banner lỗi ────────────────────────────────────────────────── -->
    <div v-if="error" class="apt-error" role="alert">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 8v5M12 16.5v.01" /><circle cx="12" cy="12" r="9" />
      </svg>
      <span>{{ error }}</span>
      <button type="button" class="err-retry" @click="reload">Thử lại</button>
    </div>

    <!-- ── Nội dung ──────────────────────────────────────────────────── -->
    <main class="apt-main">
      <div v-if="loading && !appointments.length" class="apt-loading" aria-busy="true" aria-label="Đang tải lịch hẹn">
        <div v-for="n in 8" :key="n" class="rl-skeleton sk-row" :style="{ width: skeletonWidth(n) }" />
      </div>

      <!-- Lịch luôn render — không có việc thì để lưới trống, không chèn màn rỗng -->
      <AppointmentsWeekView
        v-else-if="viewMode === 'week'"
        :week-start="weekStart"
        :appointments="visibleAppointments"
        :conflict-map="conflictMap"
        :now-ts="nowTs"
        :can-mutate="canMutate"
        :busy-id="busyId"
        @select-appointment="onSelect"
        @create-slot="onCreateSlot"
        @mark-complete="onComplete"
      />

      <AppointmentsAgendaView
        v-else-if="visibleAppointments.length"
        :appointments="visibleAppointments"
        :conflict-map="conflictMap"
        :now-ts="nowTs"
        :can-mutate="canMutate"
        :busy-id="busyId"
        @select-appointment="onSelect"
        @mark-complete="onComplete"
      />

      <div v-else class="apt-empty">
        <div class="empty-card">
          <div class="empty-title">{{ emptyTitle }}</div>
          <div class="empty-actions">
            <button type="button" class="rl-btn rl-btn--primary" @click="openCreate(null)">Tạo lịch hẹn</button>
            <button v-if="anyFilterActive" type="button" class="rl-btn" @click="resetFilters">Bỏ bộ lọc</button>
          </div>
        </div>
      </div>
    </main>

    <AppointmentDetailPopover
      :appointment="selected"
      :anchor="selectedAnchor"
      :pool="appointments as Appointment[]"
      :busy="busyStatus"
      :can-mutate="selected ? canMutate(selected) : false"
      @close="closeDetail"
      @complete="onComplete"
      @cancel="onCancel"
      @no-show="onNoShow"
      @reschedule="onReschedule"
      @open-chat="onOpenChat"
      @open-contact="onOpenContact"
    />

    <!-- Tạo nhanh tại ô giờ — 3 trường, "Thêm chi tiết" mới mở editor đầy đủ -->
    <AppointmentQuickCreate
      v-model="quickOpen"
      :anchor="quickAnchor"
      :slot="quickSlot"
      :current-user-id="currentUserId"
      @created="onEditorSaved"
      @escalate="onEscalate"
    />

    <AppointmentEditor
      v-model="editorOpen"
      :appointment="editAppointment"
      :default-date="createDate"
      :prefill-contact="editorPrefillContact"
      :ai-prefill="editorPrefill"
      :users="users"
      :current-user-id="currentUserId"
      @created="onEditorSaved"
      @updated="onEditorSaved"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * AppointmentsView — revamp theo design "Rail" (direction 1A, 2026-08-01).
 *
 * Thay đổi lớn so với bản Airtable cũ:
 *  - Bỏ hẳn sidebar trái (AppointmentsSidebar) + dải chip "Đang lọc" trùng lặp.
 *    Toàn bộ filter gom vào 1 hàng nút tự hiện giá trị (Phạm vi/Trạng thái/Loại/
 *    Nguồn/Sale). Trước đây cùng 1 bộ lọc có mặt ở 3 chỗ khác nhau trên 1 màn.
 *  - Bảng 7 cột (AppointmentsListView) → AppointmentsAgendaView.
 *  - Cột chi tiết 380px (AppointmentDetailPanel) → popover neo vào event.
 *  - Thêm trạng thái loading / lỗi / rỗng mà bản cũ không có.
 */
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useAppointments } from '@/composables/use-appointments';
import { useUsers } from '@/composables/use-users';
import {
  APPOINTMENT_STATUS_OPTIONS,
  APPOINTMENT_TYPE_OPTIONS,
  saleColor,
  initials,
  typeIcon,
  appointmentOwnerId,
  appointmentStart,
  effectiveStatus,
  canMutateAppointment,
  buildConflictMap,
  type AppointmentEx as Appointment,
} from '@/composables/appointment-helpers';
import { getOrgParts, orgDayKey } from '@/composables/use-org-timezone';
import AppointmentsWeekView from '@/components/appointments/AppointmentsWeekView.vue';
import AppointmentsAgendaView from '@/components/appointments/AppointmentsAgendaView.vue';
import AppointmentDetailPopover from '@/components/appointments/AppointmentDetailPopover.vue';
import AppointmentEditor from '@/components/appointments/AppointmentEditor.vue';
import AppointmentQuickCreate from '@/components/appointments/AppointmentQuickCreate.vue';
import ScheduleTabs from '@/components/schedule/ScheduleTabs.vue';
import type { ContactLite } from '@/composables/use-contact-search';

const router = useRouter();
const authStore = useAuthStore();
const currentUserId = computed<string | null>(() => authStore.user?.id ?? null);
// Ngoài owner/admin, sale chỉ tạo/sửa/xoá lịch của chính mình (2026-08-04).
// Chốt chặn thật ở BE `appointment-routes.ts`; đây chỉ để không bày nút vô dụng.
const isOrgAdmin = computed(() => authStore.isAdmin);
function canMutate(a: Appointment): boolean {
  return canMutateAppointment(a, currentUserId.value, isOrgAdmin.value);
}

const {
  appointments, total, loading, error, filters,
  fetchAppointments, markComplete, cancelAppointment, markNoShow,
} = useAppointments();

/**
 * Mốc "bây giờ" nhích mỗi phút. `effectiveStatus` nhận mốc này làm tham số nên
 * lịch vừa quá giờ tự chuyển sang đỏ, không phải đợi refetch hay cron đêm.
 */
const nowTs = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | null = null;
const { users, fetchUsers } = useUsers();

/* ── Responsive ───────────────────────────────────────────────────── */
const viewportWidth = ref<number>(typeof window !== 'undefined' ? window.innerWidth : 1440);
const isNarrow = computed(() => viewportWidth.value < 900);
function onResize() { viewportWidth.value = window.innerWidth; }

type ViewMode = 'week' | 'agenda';
const viewMode = ref<ViewMode>(isNarrow.value ? 'agenda' : 'week');
/**
 * Người dùng đã tự chọn view chưa. Trước 2026-08-04 chỉ ép week→agenda khi màn
 * hẹp mà không bao giờ quay lại: mở tab ở cửa sổ nhỏ rồi phóng to là kẹt ở danh
 * sách trên màn 1440px. Giờ tự trả về lưới tuần, TRỪ khi người dùng đã chủ động
 * chọn danh sách.
 */
const userPickedView = ref(false);
function pickView(v: ViewMode) {
  userPickedView.value = true;
  viewMode.value = v;
}
watch(isNarrow, (narrow) => {
  if (narrow && viewMode.value === 'week') viewMode.value = 'agenda';
  else if (!narrow && !userPickedView.value) viewMode.value = 'week';
});

/* ── Ngày / tuần ──────────────────────────────────────────────────── */
const today = new Date(); today.setHours(0, 0, 0, 0);
const selectedDate = ref<Date>(new Date(today));

const weekStart = computed(() => {
  const d = new Date(selectedDate.value);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // T2 = đầu tuần
  return d;
});
const weekEnd = computed(() => {
  const d = new Date(weekStart.value);
  d.setDate(d.getDate() + 7);
  return d;
});

function pad(n: number) { return String(n).padStart(2, '0'); }
const weekRangeLabel = computed(() => {
  const s = getOrgParts(weekStart.value);
  const e = getOrgParts(new Date(weekStart.value.getTime() + 6 * 86_400_000));
  if (!s || !e) return '';
  return `${pad(s.day)}/${pad(s.month)} – ${pad(e.day)}/${pad(e.month)}`;
});
const weekMetaLabel = computed(() => {
  const s = getOrgParts(weekStart.value);
  if (!s) return '';
  // ISO week number
  const d = new Date(Date.UTC(s.year, s.month - 1, s.day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${s.year} · tuần ${week}`;
});

/* ── Bộ lọc ───────────────────────────────────────────────────────── */
type Scope = 'me' | 'team' | 'all';
const SCOPE_OPTIONS = [
  { value: 'me' as const, text: 'Của tôi' },
  { value: 'team' as const, text: 'Nhóm' },
  { value: 'all' as const, text: 'Tất cả' },
];
const SOURCE_OPTIONS = [
  { value: 'all' as const, text: 'Tất cả' },
  { value: 'zalo' as const, text: 'Zalo' },
  { value: 'manual' as const, text: 'Thủ công' },
];
const DEFAULT_STATUSES = ['scheduled', 'overdue'];
const KNOWN_TYPES = new Set(APPOINTMENT_TYPE_OPTIONS.map(o => o.value));

const scope = ref<Scope>('me');
const selectedSales = ref<Set<string>>(new Set());
const selectedStatuses = ref<Set<string>>(new Set(DEFAULT_STATUSES));
const selectedTypes = ref<Set<string>>(new Set(APPOINTMENT_TYPE_OPTIONS.map(o => o.value)));
const source = ref<'all' | 'manual' | 'zalo'>('all');

/**
 * Template auto-unwrap ref → không truyền được chính cái ref vào hàm. Tách 3
 * handler riêng thay vì nhận `{ value: Set }`.
 */
function flip(cur: Set<string>, v: string): Set<string> {
  const next = new Set(cur);
  if (next.has(v)) next.delete(v); else next.add(v);
  return next;
}
function toggleStatus(v: string) { selectedStatuses.value = flip(selectedStatuses.value, v); }
function toggleType(v: string) { selectedTypes.value = flip(selectedTypes.value, v); }
function toggleSale(v: string) { selectedSales.value = flip(selectedSales.value, v); }

const statusFiltered = computed(() =>
  selectedStatuses.value.size !== DEFAULT_STATUSES.length ||
  !DEFAULT_STATUSES.every(s => selectedStatuses.value.has(s)),
);
const typeFiltered = computed(() => selectedTypes.value.size < APPOINTMENT_TYPE_OPTIONS.length);
const repsFiltered = computed(() => scope.value !== 'me' && selectedSales.value.size < users.value.length);
const anyFilterActive = computed(() =>
  scope.value !== 'me' || statusFiltered.value || typeFiltered.value || source.value !== 'all' || repsFiltered.value,
);

function resetFilters() {
  scope.value = 'me';
  selectedStatuses.value = new Set(DEFAULT_STATUSES);
  selectedTypes.value = new Set(APPOINTMENT_TYPE_OPTIONS.map(o => o.value));
  source.value = 'all';
}

const scopeValueLabel = computed(() => {
  if (scope.value === 'me') return 'Của tôi';
  if (scope.value === 'team') return `Nhóm (${selectedSales.value.size})`;
  return `Tất cả (${selectedSales.value.size})`;
});
const statusValueLabel = computed(() =>
  statusFiltered.value ? `${selectedStatuses.value.size}/${APPOINTMENT_STATUS_OPTIONS.length}` : 'Đang mở',
);
const typeValueLabel = computed(() =>
  typeFiltered.value ? `${selectedTypes.value.size}/${APPOINTMENT_TYPE_OPTIONS.length}` : 'Tất cả',
);
const sourceValueLabel = computed(
  () => SOURCE_OPTIONS.find(o => o.value === source.value)?.text ?? 'Tất cả',
);

const repPreview = computed(() => users.value.filter(u => selectedSales.value.has(u.id)).slice(0, 4));
const repOverflow = computed(() => Math.max(0, selectedSales.value.size - 4));

/* ── Lọc dữ liệu ──────────────────────────────────────────────────── */
const scopedAppointments = computed<Appointment[]>(() => {
  const list = appointments.value as Appointment[];
  if (scope.value === 'me') {
    return list.filter(a => {
      const o = appointmentOwnerId(a);
      return !o || o === currentUserId.value;
    });
  }
  if (selectedSales.value.size === 0) return [];
  return list.filter(a => {
    const o = appointmentOwnerId(a);
    return !o || selectedSales.value.has(o);
  });
});

const visibleAppointments = computed<Appointment[]>(() =>
  scopedAppointments.value.filter(a => {
    if (!selectedStatuses.value.has(effectiveStatus(a, nowTs.value))) return false;
    // Phân loại tự thêm (nút + trong editor) không nằm trong 4 option gốc → luôn
    // hiện, nếu không nó biến mất khỏi lịch mà sale không hiểu vì sao.
    // Đổi lại: CHƯA lọc được theo phân loại tự thêm — cần list dùng chung ở BE.
    if (a.type && KNOWN_TYPES.has(a.type) && !selectedTypes.value.has(a.type)) return false;
    if (source.value !== 'all' && a.source !== source.value) return false;
    if (viewMode.value === 'week') {
      const s = appointmentStart(a).getTime();
      return s >= weekStart.value.getTime() && s < weekEnd.value.getTime();
    }
    return true;
  }),
);

const overdueCount = computed(
  () => visibleAppointments.value.filter(a => effectiveStatus(a, nowTs.value) === 'overdue').length,
);
const countByStatus = computed<Record<string, number>>(() => {
  const m: Record<string, number> = {};
  for (const a of scopedAppointments.value) {
    const s = effectiveStatus(a, nowTs.value);
    m[s] = (m[s] || 0) + 1;
  }
  return m;
});

/**
 * Bản đồ trùng giờ dựng từ TOÀN BỘ lịch đã tải, KHÔNG phải tập đã lọc.
 * Trước đây popover nhận `visibleAppointments` nên lọc trạng thái là cảnh báo
 * "trùng giờ" biến mất — đúng lúc người dùng thu hẹp view thì nó lại im.
 */
const conflictMap = computed(() => buildConflictMap(appointments.value as Appointment[]));

/** BE cắt còn `PAGE_LIMIT` dòng → báo cho người dùng thay vì hiện lịch thiếu. */
const truncated = computed(() => total.value > (appointments.value as Appointment[]).length);
const countByType = computed<Record<string, number>>(() => {
  const m: Record<string, number> = {};
  for (const a of scopedAppointments.value) if (a.type) m[a.type] = (m[a.type] || 0) + 1;
  return m;
});
const countBySale = computed<Record<string, number>>(() => {
  const m: Record<string, number> = {};
  for (const a of appointments.value as Appointment[]) {
    const id = appointmentOwnerId(a);
    if (id) m[id] = (m[id] || 0) + 1;
  }
  return m;
});

const emptyTitle = computed(() => {
  if (anyFilterActive.value) return 'Không có lịch hẹn khớp bộ lọc';
  return viewMode.value === 'week' ? 'Tuần này chưa có lịch hẹn' : 'Chưa có lịch hẹn nào';
});
function skeletonWidth(n: number): string {
  return [72, 58, 84, 46, 66, 78, 52, 62][n % 8] + '%';
}

/* ── Tải dữ liệu ──────────────────────────────────────────────────── */
async function reload() {
  // 2026-08-04: bỏ đệm +1 tuần. Trước đây tải dư 1 tuần cho view danh sách, nhưng
  // header vẫn ghi tuần hiện tại → danh sách hiện cả lịch ngoài khoảng đang xem.
  // Giờ 2 view cùng đúng 1 tuần, và payload nhẹ đi một nửa.
  filters.from = weekStart.value.toISOString();
  filters.to = weekEnd.value.toISOString();
  filters.source = source.value;
  await fetchAppointments();
}
watch([weekStart, source], () => { reload(); });

/**
 * Seed danh sách sale khi ĐỔI phạm vi. Trước đây watch cả `users`, nên mỗi lần
 * fetchUsers trả về là bỏ chọn thủ công bị ghi đè sạch.
 */
watch([scope, currentUserId], () => {
  if (scope.value === 'me' && currentUserId.value) {
    selectedSales.value = new Set([currentUserId.value]);
  } else if (scope.value !== 'me') {
    selectedSales.value = new Set(users.value.map(u => u.id));
  }
});
// Lần đầu users về mà chưa ai đụng bộ lọc → seed 1 lần rồi thôi.
const salesSeeded = ref(false);
watch(users, (list) => {
  if (salesSeeded.value || !list.length) return;
  salesSeeded.value = true;
  if (scope.value !== 'me') selectedSales.value = new Set(list.map(u => u.id));
});

/* ── Popover chi tiết ─────────────────────────────────────────────── */
const selected = ref<Appointment | null>(null);
const selectedAnchor = ref<DOMRect | null>(null);
const busyStatus = ref<string | null>(null);
// Id lịch đang chờ đổi trạng thái — để agenda chỉ khoá đúng dòng đó, không khoá cả bảng.
const busyId = ref<string | null>(null);

function onSelect(p: { appt: Appointment; rect: DOMRect }) {
  selected.value = p.appt;
  selectedAnchor.value = p.rect;
}
function closeDetail() {
  selected.value = null;
  selectedAnchor.value = null;
}

async function runStatus(a: Appointment, status: string, fn: (id: string) => Promise<boolean>) {
  if (!canMutate(a)) return;
  busyStatus.value = status;
  busyId.value = a.id;
  const ok = await fn(a.id);
  busyStatus.value = null;
  busyId.value = null;
  if (ok) {
    closeDetail();
    await reload();
  }
}
const onComplete = (a: Appointment) => runStatus(a, 'completed', markComplete);
const onCancel = (a: Appointment) => runStatus(a, 'cancelled', cancelAppointment);
const onNoShow = (a: Appointment) => runStatus(a, 'no_show', markNoShow);

function onOpenChat(a: Appointment) {
  if (a.source === 'zalo' && a.conversationId) router.push(`/chat/${a.conversationId}`);
}
function onOpenContact(a: Appointment) {
  if (a.contact?.id) router.push(`/contacts/${a.contact.id}`);
}

/* ── Editor ───────────────────────────────────────────────────────── */
const editorOpen = ref(false);
const editAppointment = ref<Appointment | null>(null);
const createDate = ref<Date | null>(null);
const editorPrefillContact = ref<ContactLite | null>(null);
/** Mang chữ đã gõ ở form tạo nhanh sang editor đầy đủ (dùng kênh aiPrefill sẵn có). */
const editorPrefill = ref<{ title?: string | null; date?: string | null; time?: string | null } | null>(null);

/* ── Tạo nhanh ─────────────────────────────────────────────────────── */
const quickOpen = ref(false);
const quickAnchor = ref<DOMRect | null>(null);
const quickSlot = ref<Date | null>(null);

/** Bấm ô trống trong lưới → popover 3 trường ngay tại chỗ. */
function onCreateSlot(p: { date: Date; rect?: DOMRect }) {
  quickSlot.value = p.date;
  quickAnchor.value = p.rect ?? null;
  quickOpen.value = true;
}
/** Nút "Tạo lịch hẹn" ở header — không có ô neo, popover tự canh giữa. */
function openCreate(date: Date | null) {
  quickSlot.value = date ?? nextSlot();
  quickAnchor.value = null;
  quickOpen.value = true;
}
/** Mốc 30' kế tiếp, để nút tạo ở header luôn có giờ hợp lý sẵn. */
function nextSlot(): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() > 30 ? 60 : 30);
  return d;
}

function openFullEditor(date: Date | null, contact: ContactLite | null, prefill: typeof editorPrefill.value) {
  editAppointment.value = null;
  createDate.value = date;
  editorPrefillContact.value = contact;
  editorPrefill.value = prefill;
  editorOpen.value = true;
}

/** "Thêm chi tiết" — chuyển sang editor đầy đủ, giữ nguyên thứ đã gõ. */
function onEscalate(p: { slot: Date | null; contact: ContactLite | null; title: string; durationMin: number; time: string }) {
  const d = p.slot ? getOrgParts(p.slot) : null;
  openFullEditor(p.slot, p.contact, {
    title: p.title || null,
    date: d ? `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` : null,
    time: p.time || null,
  });
}

function onReschedule(a: Appointment) {
  if (!canMutate(a)) return;
  closeDetail();
  editAppointment.value = a;
  createDate.value = null;
  editorPrefillContact.value = null;
  editorPrefill.value = null;
  editorOpen.value = true;
}
async function onEditorSaved() { await reload(); }

/* ── Điều hướng + phím tắt ────────────────────────────────────────── */
function shiftWeek(delta: number) {
  const d = new Date(selectedDate.value);
  d.setDate(d.getDate() + delta * 7);
  selectedDate.value = d;
}
function goToToday() { selectedDate.value = new Date(today); }

function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  if (editorOpen.value) return;
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openCreate(null); }
  else if (e.key === 'ArrowRight') shiftWeek(1);
  else if (e.key === 'ArrowLeft') shiftWeek(-1);
  else if (e.key === 't' || e.key === 'T') goToToday();
  else if (e.key === 'Escape') closeDetail();
}

onMounted(() => {
  fetchUsers();
  reload();
  nowTimer = setInterval(() => { nowTs.value = Date.now(); }, 60_000);
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize, { passive: true });
  onResize();
});
onBeforeUnmount(() => {
  if (nowTimer) clearInterval(nowTimer);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('resize', onResize);
});

void orgDayKey;
</script>

<style scoped>
@import '@/assets/appointments-rail.css';

.apt-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--smax-topnav-h, 52px));
  width: 100%;
  background: var(--rl-canvas);
  overflow: hidden;
}

/* ── Hàng tiêu đề ─────────────────────────────────────────────────── */
.apt-top {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 18px;
  height: 62px;
  background: var(--rl-surface);
  border-bottom: 1px solid var(--rl-hairline);
}
.apt-range {
  margin: 0;
  font-family: var(--rl-font-head);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--rl-ink);
  white-space: nowrap;
}
.apt-sub {
  font-size: 13px;
  color: var(--rl-dim);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.apt-nav { display: flex; align-items: center; gap: 4px; margin-left: 6px; }
.nav-today { height: 28px; padding: 0 11px; font-size: 12.5px; }
.apt-top-spacer { flex: 1; }

.apt-seg {
  display: flex;
  gap: 2px;
  padding: 3px;
  background: var(--rl-hairline-soft);
  border-radius: var(--rl-r-lg);
}
.apt-seg button {
  min-width: 58px;
  height: 26px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--rl-r-sm);
  background: transparent;
  color: var(--rl-muted);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
}
.apt-seg button.active {
  background: var(--rl-surface);
  color: var(--rl-ink);
  box-shadow: 0 1px 2px var(--rl-ink-a12);
}
.apt-seg button:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Thanh lọc ────────────────────────────────────────────────────── */
.apt-filters {
  flex: none;
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 46px;
  padding: 8px 18px;
  background: var(--rl-surface-soft);
  border-bottom: 1px solid var(--rl-hairline);
  flex-wrap: wrap;
}
.apt-filters-spacer { flex: 1; }
.filter-reset {
  border: 0;
  background: transparent;
  padding: 0 4px;
  font-family: inherit;
  font-size: 12px;
  color: var(--rl-dim);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.filter-reset:hover { color: var(--rl-body); }

.rep-stack { display: flex; }
.rep-av {
  width: 17px;
  height: 17px;
  font-size: 8px;
  border: 1.5px solid #fff;
}
.rep-av + .rep-av { margin-left: -5px; }
.rep-more { background: var(--rl-border-mid); color: var(--rl-body); }

.apt-tally {
  font-size: 12.5px;
  color: var(--rl-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.apt-tally b { color: var(--rl-ink); font-weight: 500; }
.tally-overdue { color: var(--rl-danger); }

/* ── Đang tải lại (đã có dữ liệu cũ) ──────────────────────────────── */
.apt-refetch {
  flex: none;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--rl-accent), transparent);
  background-size: 40% 100%;
  background-repeat: no-repeat;
  animation: rlSweep 1s linear infinite;
}
@keyframes rlSweep {
  from { background-position: -40% 0; }
  to   { background-position: 140% 0; }
}

/* ── Cảnh báo cắt bớt ─────────────────────────────────────────────── */
.apt-truncated {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  background: var(--rl-warn-bg);
  border-bottom: 1px solid var(--rl-warn-border);
  color: var(--rl-warn-text);
  font-size: 12.5px;
}
.apt-truncated svg { flex: none; }
.apt-truncated b { font-weight: 500; }

/* ── Lỗi ──────────────────────────────────────────────────────────── */
.apt-error {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 18px;
  background: var(--rl-danger-bg);
  border-bottom: 1px solid var(--rl-danger-border);
  color: var(--rl-danger-text);
  font-size: 12.5px;
}
.err-retry {
  margin-left: auto;
  border: 1px solid currentColor;
  border-radius: var(--rl-r-md);
  background: transparent;
  padding: 3px 10px;
  font-family: inherit;
  font-size: 12px;
  color: inherit;
  cursor: pointer;
}

/* ── Nội dung ─────────────────────────────────────────────────────── */
.apt-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--rl-surface);
}

.apt-loading { padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; }
.sk-row { height: 34px; }

.apt-empty { flex: 1; display: grid; place-items: center; padding: 24px; }
.empty-card { text-align: center; max-width: 380px; }
.empty-title {
  font-family: var(--rl-font-head);
  font-size: 17px;
  font-weight: 600;
  margin-bottom: 7px;
}
.empty-sub {
  margin: 0 0 18px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--rl-muted);
}
.empty-sub b { font-weight: 500; color: var(--rl-ink); }
.empty-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }

/* ── Menu (Vuetify) ───────────────────────────────────────────────── */
:global(.rl-menu .v-list-item) { min-height: 36px !important; }
:global(.rl-menu .v-list-item-title) { font-size: 13px; }
:global(.rl-menu-row) { display: flex; align-items: center; gap: 8px; }
:global(.rl-menu-sale) { display: flex; align-items: center; gap: 7px; min-width: 0; }
:global(.rl-menu-sale .swatch) { width: 9px; height: 9px; border-radius: 50%; flex: none; }
:global(.rl-menu-count) {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--rl-muted, #736f84);
  font-variant-numeric: tabular-nums;
}
/* v-menu teleport ra body → ngoài .rail-scope, nên phải có fallback cho token. */
:global(.rl-menu .rl-tick) { color: var(--rl-dim, #9a96a8); }
:global(.rl-menu .rl-tick.on) { color: var(--rl-accent, #5b4be6); }

/* ── Responsive ───────────────────────────────────────────────────── */
@media (max-width: 1100px) {
  .apt-sub { display: none; }
}
@media (max-width: 900px) {
  .apt-top { height: auto; flex-wrap: wrap; padding: 10px 14px; gap: 8px; }
  .apt-range { font-size: 17px; }
  .apt-top-spacer { display: none; }
  .apt-seg { margin-left: auto; }
  .apt-filters { padding: 8px 14px; }
}
@media (max-width: 600px) {
  .apt-seg { flex: 1 1 100%; margin-left: 0; }
  .apt-seg button { flex: 1; }
  .apt-filters { flex-wrap: nowrap; overflow-x: auto; }
  .apt-filters-spacer { display: none; }
  .apt-tally { display: none; }
  .btn-label { display: none; }
}
</style>
