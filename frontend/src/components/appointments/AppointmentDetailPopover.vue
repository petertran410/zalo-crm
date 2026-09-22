<template>
  <Teleport to="body">
    <div v-if="appointment" class="rl-pop-root rail-scope">
      <div class="pop-scrim" @click="$emit('close')" />
      <div
        ref="popEl"
        class="pop rl-rise"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        :aria-label="headline"
        :style="posStyle"
        @keydown.esc.stop="$emit('close')"
      >
        <div class="pop-accent" :style="{ background: tone.bar }" />

        <div class="pop-inner">
          <div class="pop-head">
            <div class="pop-head-txt">
              <div class="pop-title" :title="headline">{{ headline }}</div>
              <div class="pop-when">{{ whenLabel }}</div>
            </div>
            <button type="button" class="pop-x" aria-label="Đóng" @click="$emit('close')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div class="pop-chips">
            <span class="rl-chip rl-chip--accent" :style="{ background: tone.bg, color: tone.sub }">{{ statusText }}</span>
            <span v-if="appointment.type" class="rl-chip">{{ typeText }}</span>
            <span class="rl-chip">{{ appointment.source === 'zalo' ? 'Zalo' : 'Thủ công' }}</span>
          </div>

          <!-- Khách hàng -->
          <div class="pop-cust">
            <span class="rl-avatar cust-av" :style="avatarUrl ? {} : { background: ownerColor }">
              <img v-if="avatarUrl" :src="avatarUrl" alt="" @error="avatarBroken = true" />
              <template v-else>{{ custInitials }}</template>
            </span>
            <span class="cust-info">
              <span class="cust-name" :title="customerName">{{ customerName }}</span>
              <span class="cust-sub">{{ appointment.contact?.phone || 'Chưa có số' }}</span>
            </span>
            <button
              v-if="appointment.contact?.id"
              type="button"
              class="cust-open"
              @click="$emit('open-contact', appointment)"
            >Mở</button>
          </div>

          <!-- Chi tiết -->
          <div class="pop-kv">
            <template v-if="appointment.location">
              <div class="k">Địa điểm</div>
              <div class="v clamp2">{{ appointment.location }}</div>
            </template>
            <div class="k">Phụ trách</div>
            <div class="v owner-v">
              <span class="rl-avatar owner-av" :style="{ background: ownerColor }">{{ ownerInitials }}</span>
              <span class="clamp1">{{ ownerName }}</span>
            </div>
            <template v-if="appointment.notes">
              <div class="k">Ghi chú</div>
              <div class="v notes">{{ appointment.notes }}</div>
            </template>
          </div>

          <!-- Cảnh báo trùng giờ (cùng sale phụ trách) -->
          <div v-if="conflicts.length" class="rl-warn-box pop-warn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 8v5M12 16.5v.01" /><circle cx="12" cy="12" r="9" />
            </svg>
            <div>
              Trùng giờ với <b>{{ conflicts[0].title || 'lịch khác' }}</b> lúc {{ conflictTime }}<span
                v-if="conflicts.length > 1"
              > và {{ conflicts.length - 1 }} lịch nữa</span>.
            </div>
          </div>

          <!-- Zalo: mở lại hội thoại gốc -->
          <button
            v-if="appointment.source === 'zalo' && appointment.conversationId"
            type="button"
            class="pop-link"
            @click="$emit('open-chat', appointment)"
          >Xem hội thoại Zalo gốc →</button>

          <!-- Hành động — chỉ chủ lịch (hoặc owner/admin) mới thao tác được -->
          <div v-if="!canMutate" class="pop-readonly">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 018 0v3.5" />
            </svg>
            Lịch của {{ ownerName }} — chỉ xem
          </div>
          <div v-else-if="isOpen" class="pop-actions">
            <button type="button" class="act act-done" :disabled="isBusy" @click="$emit('complete', appointment)">
              {{ busy === 'completed' ? 'Đang lưu…' : 'Hoàn thành' }}
            </button>
            <button type="button" class="act act-ghost" :disabled="isBusy" @click="$emit('reschedule', appointment)">Đổi giờ</button>
            <button type="button" class="act act-ghost act-slim" :disabled="isBusy" @click="$emit('no-show', appointment)">Vắng</button>
            <button type="button" class="act act-ghost act-slim" :disabled="isBusy" @click="$emit('cancel', appointment)">Huỷ</button>
          </div>
          <div v-else class="pop-actions">
            <button type="button" class="act act-ghost" :disabled="isBusy" @click="$emit('reschedule', appointment)">Đổi giờ</button>
          </div>

          <div class="pop-foot">
            <template v-if="appointment.statusChangedBy && appointment.statusChangedAt">
              {{ statusText }} bởi {{ changedByName }} · {{ changedAtLabel }}
            </template>
            <template v-else>Tạo lúc {{ createdAtLabel }}</template>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * AppointmentDetailPopover — thay AppointmentDetailPanel (cột thứ 3 rộng 380px)
 * bằng popover neo vào event, theo design "Rail" 1A (2026-08-01).
 *
 * Giữ NGUYÊN 4 hành động của panel cũ (complete / reschedule / no-show / cancel)
 * vì đây vẫn là đường duy nhất tới cancel + no-show + reschedule trong cả trang.
 * Dưới 640px popover chuyển thành bottom sheet để không tràn màn.
 */
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import {
  initials,
  statusLabel,
  typeLabel,
  saleColor,
  resolveContactAvatar,
  appointmentStart,
  appointmentMinutes,
  appointmentOwnerId,
  appointmentOwnerName,
  effectiveStatus,
  statusTone,
  overlapsOf,
  fmtClock,
  fmtRange,
  fmtDuration,
  type AppointmentEx as Appointment,
} from '@/composables/appointment-helpers';
import { formatInOrgTz, getOrgParts, weekdayInOrgTz } from '@/composables/use-org-timezone';

const props = defineProps<{
  appointment: Appointment | null;
  anchor: DOMRect | null;
  /** Toàn bộ lịch đang hiển thị — để dò trùng giờ cùng sale. */
  pool: Appointment[];
  /** Status đang được lưu (disable nút + hiện "Đang lưu…"), null nếu rảnh. */
  busy?: string | null;
  /** false → ẩn toàn bộ nút hành động, chỉ cho xem. */
  canMutate?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'complete', a: Appointment): void;
  (e: 'cancel', a: Appointment): void;
  (e: 'no-show', a: Appointment): void;
  (e: 'reschedule', a: Appointment): void;
  (e: 'open-chat', a: Appointment): void;
  (e: 'open-contact', a: Appointment): void;
}>();

const popEl = ref<HTMLElement | null>(null);
const avatarBroken = ref(false);
/** `busy` là tên status đang lưu; attribute `disabled` cần boolean thật. */
const isBusy = computed(() => !!props.busy);

const POP_W = 348;
const GAP = 10;

const effStatus = computed(() => (props.appointment ? effectiveStatus(props.appointment) : 'scheduled'));
const ownerColor = computed(() =>
  props.appointment ? saleColor(appointmentOwnerId(props.appointment)).bg : '#6e6b8a',
);
const tone = computed(() => statusTone(effStatus.value, ownerColor.value));
const statusText = computed(() => statusLabel(effStatus.value));
const typeText = computed(() => (props.appointment?.type ? typeLabel(props.appointment.type) : ''));
const isOpen = computed(() => effStatus.value === 'scheduled' || effStatus.value === 'overdue');

const customerName = computed(() => props.appointment?.contact?.fullName || 'Khách hàng');
const headline = computed(() => props.appointment?.title || customerName.value);
const custInitials = computed(() => initials(customerName.value));
const ownerName = computed(() => (props.appointment ? appointmentOwnerName(props.appointment) : 'Chưa gán'));
const ownerInitials = computed(() => initials(ownerName.value));
const avatarUrl = computed(() =>
  avatarBroken.value ? null : resolveContactAvatar(props.appointment?.contact),
);

const changedByName = computed(
  () => props.appointment?.statusChangedBy?.fullName || props.appointment?.statusChangedBy?.email || '—',
);
const changedAtLabel = computed(() =>
  props.appointment?.statusChangedAt
    ? formatInOrgTz(props.appointment.statusChangedAt, undefined, { dateStyle: 'short', timeStyle: 'short' } as any)
    : '',
);
const createdAtLabel = computed(() =>
  props.appointment?.createdAt
    ? formatInOrgTz(props.appointment.createdAt, undefined, { dateStyle: 'short', timeStyle: 'short' } as any)
    : '—',
);

const whenLabel = computed(() => {
  const a = props.appointment;
  if (!a) return '';
  const p = getOrgParts(appointmentStart(a));
  const s = appointmentMinutes(a);
  const d = a.durationMin ?? 30;
  const day = p ? `${weekdayInOrgTz(appointmentStart(a), undefined, 'short')} ${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}` : '';
  return `${day} · ${fmtRange(s, d)} · ${fmtDuration(d)}`;
});

const conflicts = computed(() =>
  props.appointment ? overlapsOf(props.appointment, props.pool) : [],
);
const conflictTime = computed(() => {
  const c = conflicts.value[0];
  return c ? fmtClock(appointmentMinutes(c)) : '';
});

/* ── Vị trí: neo phải/trái event, kẹp trong viewport; mobile → bottom sheet ── */
const posStyle = ref<Record<string, string>>({});

function place() {
  const r = props.anchor;
  if (!r) return;
  if (window.innerWidth <= 640) {
    posStyle.value = {};
    return;
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const h = popEl.value?.offsetHeight ?? 420;

  // Ưu tiên bên phải event; không đủ chỗ thì lật sang trái.
  let left = r.right + GAP;
  if (left + POP_W > vw - 12) left = r.left - POP_W - GAP;
  left = Math.max(12, Math.min(left, vw - POP_W - 12));

  let top = r.top;
  if (top + h > vh - 12) top = vh - h - 12;
  top = Math.max(12, top);

  posStyle.value = { left: `${left}px`, top: `${top}px` };
}

/**
 * Phần tử đang focus TRƯỚC khi popover mở, để đóng xong trả focus về đúng chỗ.
 * Thiếu bước này thì bàn phím bị quăng về đầu trang mỗi lần đóng.
 */
let lastFocused: HTMLElement | null = null;

watch(() => [props.appointment, props.anchor], async () => {
  if (!props.appointment) return;
  avatarBroken.value = false;
  lastFocused = (document.activeElement as HTMLElement) ?? null;
  await nextTick();
  place();
  popEl.value?.focus(); // cần tabindex="-1" ở template, nếu không đây là no-op
}, { immediate: true });

// Đóng → trả focus về nơi vừa bấm.
watch(() => props.appointment, (cur, prev) => {
  if (!cur && prev && lastFocused && document.contains(lastFocused)) {
    lastFocused.focus();
    lastFocused = null;
  }
});

/**
 * Đặt lại vị trí qua rAF. `place()` đọc offsetHeight (ép layout đồng bộ) rồi ghi
 * style — gắn thẳng vào scroll là mỗi lần cuộn ép reflow một lần.
 */
let rafId: number | null = null;
function onWindowChange() {
  if (!props.appointment || rafId !== null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    place();
  });
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.appointment) {
    e.stopPropagation();
    emit('close');
  }
}
/**
 * Chỉ gắn listener khi popover ĐANG mở. Trước đây gắn suốt vòng đời component
 * (component luôn được render, chỉ nội dung mới v-if) → mọi cú cuộn trong app
 * đều gọi handler dù không có popover nào.
 */
let listening = false;
function bindWindow() {
  if (listening) return;
  listening = true;
  window.addEventListener('resize', onWindowChange, { passive: true });
  window.addEventListener('scroll', onWindowChange, { passive: true, capture: true });
  window.addEventListener('keydown', onKey);
}
function unbindWindow() {
  if (!listening) return;
  listening = false;
  window.removeEventListener('resize', onWindowChange);
  window.removeEventListener('scroll', onWindowChange, { capture: true } as any);
  window.removeEventListener('keydown', onKey);
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
}

watch(() => props.appointment, (cur) => { if (cur) bindWindow(); else unbindWindow(); }, { immediate: true });

onMounted(() => { if (props.appointment) bindWindow(); });
onBeforeUnmount(unbindWindow);
</script>

<style scoped>
@import '@/assets/appointments-rail.css';

.rl-pop-root { position: fixed; inset: 0; z-index: 2400; }
.pop-scrim { position: absolute; inset: 0; background: var(--rl-ink-a14); }

.pop {
  position: absolute;
  width: 348px;
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  background: var(--rl-surface);
  border: 1px solid var(--rl-hairline);
  border-radius: var(--rl-r-xl);
  box-shadow: 0 10px 32px var(--rl-ink-a18);
  outline: none;
}
.pop:focus-visible { outline: 2px solid var(--rl-accent); outline-offset: 2px; }
.pop-accent { height: 4px; }
.pop-inner { padding: 14px 16px 12px; }

.pop-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; }
.pop-head-txt { flex: 1; min-width: 0; }
.pop-title {
  font-family: var(--rl-font-head);
  font-size: 15.5px;
  font-weight: 600;
  line-height: 1.3;
  margin-bottom: 4px;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pop-when { font-size: 12.5px; color: var(--rl-body); font-variant-numeric: tabular-nums; }
.pop-x {
  width: 24px; height: 24px; flex: none;
  display: grid; place-items: center;
  border: 0; border-radius: var(--rl-r-sm);
  background: transparent; color: var(--rl-dim);
  cursor: pointer;
}
.pop-x:hover { background: var(--rl-hairline-soft); }

.pop-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 13px; }

.pop-cust {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 10px;
  background: var(--rl-surface-soft);
  border-radius: var(--rl-r-lg);
  margin-bottom: 10px;
}
.cust-av { width: 30px; height: 30px; flex: 0 0 30px; font-size: 11px; }
.cust-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.cust-name {
  font-size: 13px; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cust-sub { font-size: 11.5px; color: var(--rl-muted); font-variant-numeric: tabular-nums; }
.cust-open {
  border: 0; background: transparent;
  font-family: inherit; font-size: 11.5px;
  color: var(--rl-accent); cursor: pointer; flex: none;
}
.cust-open:hover { text-decoration: underline; }

.pop-kv {
  display: grid;
  grid-template-columns: 62px 1fr;
  gap: 6px 10px;
  font-size: 12.5px;
  margin-bottom: 12px;
}
.pop-kv .k { color: var(--rl-dim); }
.pop-kv .v { color: var(--rl-ink); min-width: 0; overflow-wrap: anywhere; }
.owner-v { display: flex; align-items: center; gap: 6px; }
.owner-av { width: 15px; height: 15px; flex: 0 0 15px; font-size: 7.5px; }
.notes {
  line-height: 1.5;
  color: var(--rl-body-deep);
  display: -webkit-box;
  -webkit-line-clamp: 6;
  line-clamp: 6;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.clamp1 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.clamp2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.pop-warn { margin-bottom: 12px; }

.pop-link {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 0 0 12px;
  font-family: inherit;
  font-size: 12px;
  color: var(--rl-accent);
  cursor: pointer;
}
.pop-link:hover { text-decoration: underline; }

.pop-readonly {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 10px; margin-bottom: 10px;
  background: var(--rl-surface-soft);
  border: 1px solid var(--rl-hairline);
  border-radius: var(--rl-r-md);
  font-size: 11.5px;
  color: var(--rl-muted);
}
.pop-readonly svg { flex: none; }

.pop-actions { display: flex; gap: 6px; margin-bottom: 10px; }
.act {
  height: 30px;
  border-radius: var(--rl-r-md);
  border: 1px solid var(--rl-hairline);
  background: var(--rl-surface);
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.12s ease;
}
.act:disabled { opacity: 0.5; cursor: not-allowed; }
.act-done {
  flex: 1;
  background: var(--rl-success);
  border-color: var(--rl-success);
  color: #fff;
  font-weight: 500;
}
.act-done:hover:not(:disabled) { background: var(--rl-success-hover); }
.act-ghost { flex: 1; color: var(--rl-ink); }
.act-ghost:hover:not(:disabled) { background: var(--rl-surface-soft); }
.act-slim { flex: 0 0 auto; padding: 0 10px; color: var(--rl-muted); }

.pop-foot {
  font-size: 11px;
  color: var(--rl-dim);
  border-top: 1px solid var(--rl-hairline-soft);
  padding-top: 8px;
}

/* ── Mobile: bottom sheet ─────────────────────────────────────────── */
@media (max-width: 640px) {
  .pop {
    left: 0 !important;
    right: 0;
    top: auto !important;
    bottom: 0;
    width: 100%;
    max-height: 82vh;
    border-radius: var(--rl-r-2xl) var(--rl-r-2xl) 0 0;
    border-bottom: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .act { transition: none; }
}
</style>
