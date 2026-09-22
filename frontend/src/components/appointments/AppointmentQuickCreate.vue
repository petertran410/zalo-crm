<template>
  <Teleport to="body">
    <div v-if="modelValue" class="qc-root rail-scope">
      <div class="qc-scrim" @click="close" />
      <div
        ref="popEl"
        class="qc rl-rise"
        role="dialog"
        aria-modal="true"
        aria-label="Tạo lịch hẹn nhanh"
        tabindex="-1"
        :style="posStyle"
        @keydown.esc.stop.prevent="close"
      >
        <div class="qc-when">
          <span class="qc-day">{{ dayLabel }}</span>
          <input v-model="time" class="qc-time" type="time" step="300" aria-label="Giờ bắt đầu" />
          <select v-model.number="durationMin" class="qc-dur" aria-label="Thời lượng">
            <option v-for="d in DURATIONS" :key="d.value" :value="d.value">{{ d.label }}</option>
          </select>
        </div>

        <input
          ref="titleEl"
          v-model="title"
          class="qc-title"
          type="text"
          placeholder="Tiêu đề (để trống sẽ lấy tên khách)"
          @keydown.enter.prevent="submit"
        />

        <!-- Khách hàng: đã chọn → hàng gọn; chưa chọn → ô tìm -->
        <div v-if="contact" class="qc-cust">
          <span class="rl-avatar qc-av" :style="contact.avatarUrl ? {} : { background: contactColor(contact.id) }">
            <img v-if="contact.avatarUrl" :src="contact.avatarUrl" alt="" @error="onAvatarError" />
            <template v-else>{{ initials(contact.fullName) }}</template>
          </span>
          <span class="qc-cust-txt">
            <span class="qc-cust-name">{{ contact.fullName || 'Khách hàng' }}</span>
            <span v-if="contact.phone" class="qc-cust-sub">{{ formatPhoneVN(contact.phone) }}</span>
          </span>
          <button type="button" class="qc-x" aria-label="Bỏ chọn khách" @click="contact = null">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div v-else class="qc-search">
          <input
            v-model="query"
            class="qc-search-input"
            type="text"
            placeholder="Tìm khách hàng — tên, SĐT…"
            autocomplete="off"
            @input="search"
          />
          <div v-if="searching" class="qc-hint">Đang tìm…</div>
          <div v-else-if="suggestions.length" class="qc-list">
            <button
              v-for="c in suggestions"
              :key="c.id"
              type="button"
              class="qc-item"
              @click="pick(c)"
            >
              <span class="rl-avatar qc-av" :style="c.avatarUrl ? {} : { background: contactColor(c.id) }">
                <img v-if="c.avatarUrl" :src="c.avatarUrl" alt="" />
                <template v-else>{{ initials(c.fullName) }}</template>
              </span>
              <span class="qc-item-name">{{ c.fullName || 'Khách hàng' }}</span>
              <span v-if="c.phone" class="qc-item-sub">{{ formatPhoneVN(c.phone) }}</span>
            </button>
          </div>
          <div v-else-if="query.trim()" class="qc-hint">Không tìm thấy khách nào</div>
        </div>

        <div v-if="error" class="qc-error">{{ error }}</div>

        <div class="qc-foot">
          <button type="button" class="qc-more" @click="escalate">Thêm chi tiết</button>
          <span class="qc-spacer" />
          <button type="button" class="rl-btn qc-btn" @click="close">Huỷ</button>
          <button type="button" class="rl-btn rl-btn--primary qc-btn" :disabled="saving" @click="submit">
            {{ saving ? 'Đang lưu…' : 'Lưu' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * AppointmentQuickCreate — tạo lịch nhanh ngay tại ô giờ vừa bấm (2026-08-04).
 *
 * Vì sao có: bấm 1 ô trống trước đây mở modal 640px với 8 trường, trong khi việc
 * thường ngày chỉ là "khách này, giờ này". Ở đây còn 3 thứ — giờ (đã điền sẵn từ
 * ô bấm), tiêu đề, khách — mọi thứ khác lấy mặc định.
 *
 * KHÔNG thay AppointmentEditor: "Thêm chi tiết" chuyển thẳng sang editor đầy đủ,
 * mang theo những gì đã gõ. Editor vẫn là nơi duy nhất sửa lịch và vẫn phục vụ
 * 4 chỗ gọi khác (chat, ghi chú, timeline, panel KH).
 */
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { api } from '@/api/index';
import { initials, fmtDuration } from '@/composables/appointment-helpers';
import {
  useContactSearch,
  formatPhoneVN,
  contactColor,
  type ContactLite,
} from '@/composables/use-contact-search';
import { getOrgParts, weekdayInOrgTz } from '@/composables/use-org-timezone';

const props = defineProps<{
  modelValue: boolean;
  /** Ô giờ vừa bấm — dùng để neo popover. null → canh giữa màn. */
  anchor: DOMRect | null;
  /** Ngày+giờ của ô đã bấm. */
  slot: Date | null;
  currentUserId: string | null;
  /** Điền sẵn khách (mở từ chỗ đã biết KH). */
  prefillContact?: ContactLite | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'created'): void;
  (e: 'escalate', payload: { slot: Date | null; contact: ContactLite | null; title: string; durationMin: number; time: string }): void;
}>();

const DURATIONS = [15, 30, 60, 120].map((v) => ({ value: v, label: fmtDuration(v) }));

const popEl = ref<HTMLElement | null>(null);
const titleEl = ref<HTMLInputElement | null>(null);

const title = ref('');
const time = ref('09:00');
const durationMin = ref(30);
const contact = ref<ContactLite | null>(null);
const saving = ref(false);
const error = ref('');

const { query, suggestions, searching, search, reset, onAvatarError } = useContactSearch(contact);

const dayLabel = computed(() => {
  const d = props.slot;
  if (!d) return '';
  const p = getOrgParts(d);
  if (!p) return '';
  return `${weekdayInOrgTz(d, undefined, 'short')} ${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}`;
});

function pick(c: ContactLite) {
  contact.value = c;
  reset();
}

function close() {
  emit('update:modelValue', false);
}

function escalate() {
  emit('escalate', {
    slot: props.slot,
    contact: contact.value,
    title: title.value,
    durationMin: durationMin.value,
    time: time.value,
  });
  close();
}

async function submit() {
  if (saving.value) return;
  const d = props.slot;
  if (!d) { error.value = 'Thiếu ngày giờ.'; return; }
  const p = getOrgParts(d);
  if (!p) { error.value = 'Thiếu ngày giờ.'; return; }

  saving.value = true;
  error.value = '';
  try {
    await api.post('/appointments', {
      title: title.value.trim() || null,
      contactId: contact.value?.id ?? null,
      assignedUserId: props.currentUserId,
      appointmentDate: `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`,
      appointmentTime: time.value,
      durationMin: durationMin.value,
      type: null,
      location: null,
      notes: null,
    });
    emit('created');
    close();
  } catch (err: any) {
    // BE trả `message` cho ca trùng giờ (409) — câu chữ cụ thể, ưu tiên hiện.
    error.value = err?.response?.data?.message || err?.response?.data?.error || 'Không lưu được lịch hẹn.';
  } finally {
    saving.value = false;
  }
}

/* ── Vị trí: neo phải/trái ô bấm, kẹp trong viewport ── */
const QC_W = 300;
const GAP = 10;
const posStyle = ref<Record<string, string>>({});
let lastFocused: HTMLElement | null = null;

function place() {
  const r = props.anchor;
  if (!r || window.innerWidth <= 640) { posStyle.value = {}; return; }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const h = popEl.value?.offsetHeight ?? 280;

  let left = r.right + GAP;
  if (left + QC_W > vw - 12) left = r.left - QC_W - GAP;
  left = Math.max(12, Math.min(left, vw - QC_W - 12));

  let top = r.top;
  if (top + h > vh - 12) top = vh - h - 12;
  top = Math.max(12, top);

  posStyle.value = { left: `${left}px`, top: `${top}px` };
}

watch(() => props.modelValue, async (open) => {
  if (!open) {
    if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
    lastFocused = null;
    return;
  }
  // Reset mỗi lần mở — popover sống lâu hơn 1 lần dùng.
  lastFocused = (document.activeElement as HTMLElement) ?? null;
  title.value = '';
  durationMin.value = 30;
  error.value = '';
  contact.value = props.prefillContact ?? null;
  reset();
  const p = props.slot ? getOrgParts(props.slot) : null;
  time.value = p
    ? `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
    : '09:00';

  await nextTick();
  place();
  titleEl.value?.focus();
});

let rafId: number | null = null;
function onWindowChange() {
  if (!props.modelValue || rafId !== null) return;
  rafId = requestAnimationFrame(() => { rafId = null; place(); });
}
onMounted(() => {
  window.addEventListener('resize', onWindowChange, { passive: true });
  window.addEventListener('scroll', onWindowChange, { passive: true, capture: true });
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowChange);
  window.removeEventListener('scroll', onWindowChange, { capture: true } as any);
  if (rafId !== null) cancelAnimationFrame(rafId);
});
</script>

<style scoped>
@import '@/assets/appointments-rail.css';

.qc-root { position: fixed; inset: 0; z-index: 2500; }
.qc-scrim { position: absolute; inset: 0; background: var(--rl-ink-a14); }

.qc {
  position: absolute;
  width: 300px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--rl-surface);
  border: 1px solid var(--rl-hairline);
  border-radius: var(--rl-r-xl);
  box-shadow: 0 10px 32px var(--rl-ink-a18);
  outline: none;
}
.qc:focus-visible { outline: 2px solid var(--rl-accent); outline-offset: 2px; }

.qc-when { display: flex; align-items: center; gap: 6px; }
.qc-day {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--rl-muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.qc-time,
.qc-dur {
  height: 28px;
  border: 1px solid var(--rl-hairline);
  border-radius: var(--rl-r-md);
  background: var(--rl-surface);
  font-family: inherit;
  font-size: 12.5px;
  color: var(--rl-ink);
  padding: 0 6px;
  outline: none;
}
.qc-time { flex: 0 0 84px; font-variant-numeric: tabular-nums; }
.qc-dur { flex: 1; min-width: 0; cursor: pointer; }
.qc-time:focus, .qc-dur:focus { border-color: var(--rl-accent); }

.qc-title {
  height: 36px;
  border: 1px solid var(--rl-border-mid);
  border-radius: var(--rl-r-lg);
  background: var(--rl-surface);
  font-family: inherit;
  font-size: 14px;
  color: var(--rl-ink);
  padding: 0 10px;
  outline: none;
}
.qc-title:focus { border-color: var(--rl-accent); }
.qc-title::placeholder { color: var(--rl-dim); }

.qc-cust {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--rl-surface-soft);
  border-radius: var(--rl-r-lg);
}
.qc-av { width: 24px; height: 24px; flex: 0 0 24px; font-size: 9px; }
.qc-cust-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.qc-cust-name {
  font-size: 12.5px; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.qc-cust-sub { font-size: 11px; color: var(--rl-muted); font-variant-numeric: tabular-nums; }
.qc-x {
  flex: none; width: 20px; height: 20px;
  display: grid; place-items: center;
  border: 0; border-radius: var(--rl-r-sm);
  background: transparent; color: var(--rl-dim);
  cursor: pointer;
}
.qc-x:hover { background: var(--rl-hairline-soft); color: var(--rl-ink); }

.qc-search { display: flex; flex-direction: column; gap: 4px; }
.qc-search-input {
  height: 32px;
  border: 1px solid var(--rl-hairline);
  border-radius: var(--rl-r-lg);
  background: var(--rl-surface);
  font-family: inherit;
  font-size: 13px;
  color: var(--rl-ink);
  padding: 0 10px;
  outline: none;
}
.qc-search-input:focus { border-color: var(--rl-accent); }

.qc-list {
  display: flex; flex-direction: column;
  max-height: 168px; overflow-y: auto;
  border: 1px solid var(--rl-hairline);
  border-radius: var(--rl-r-md);
}
.qc-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px;
  border: 0; border-bottom: 1px solid var(--rl-hairline-soft);
  background: transparent;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.qc-item:last-child { border-bottom: 0; }
.qc-item:hover { background: var(--rl-surface-soft); }
.qc-item-name {
  flex: 1; min-width: 0;
  font-size: 12.5px; color: var(--rl-ink);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.qc-item-sub { font-size: 11px; color: var(--rl-dim); font-variant-numeric: tabular-nums; flex: none; }

.qc-hint { font-size: 11.5px; color: var(--rl-dim); padding: 2px 2px 0; }

.qc-error {
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--rl-danger-text);
  background: var(--rl-danger-bg);
  border: 1px solid var(--rl-danger-border);
  border-radius: var(--rl-r-md);
  padding: 6px 8px;
}

.qc-foot { display: flex; align-items: center; gap: 6px; }
.qc-spacer { flex: 1; }
.qc-more {
  border: 0; background: transparent;
  font-family: inherit; font-size: 12px;
  color: var(--rl-accent); cursor: pointer;
  padding: 0;
}
.qc-more:hover { text-decoration: underline; }
.qc-btn { height: 28px; padding: 0 12px; font-size: 12.5px; }

@media (max-width: 640px) {
  .qc {
    left: 0 !important;
    right: 0;
    top: auto !important;
    bottom: 0;
    width: 100%;
    border-radius: var(--rl-r-2xl) var(--rl-r-2xl) 0 0;
    border-bottom: 0;
  }
}
</style>
