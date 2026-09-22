<template>
  <div class="rl-week">
    <!-- Header ngày — scrollbar-gutter khớp với body để 7 cột không lệch nhau -->
    <div class="wk-head">
      <div class="wk-gutter wk-gutter--head">
        <button
          type="button"
          class="hr-toggle"
          :title="showAllHours ? 'Thu gọn về khung giờ có lịch' : 'Hiện đủ 24 giờ'"
          @click="showAllHours = !showAllHours"
        >{{ showAllHours ? '24h' : `${pad2(range.start)}–${pad2(range.end)}` }}</button>
      </div>
      <div v-for="d in days" :key="d.iso" class="wk-dhead" :class="{ today: d.isToday }">
        <div class="dow">{{ d.dow }}</div>
        <div class="num">{{ d.num }}</div>
        <div class="cnt">{{ d.count ? d.count + ' lịch hẹn' : '' }}</div>
      </div>
    </div>

    <div ref="bodyEl" class="wk-body">
      <!-- Cột giờ -->
      <div class="wk-gutter times" :style="{ height: gridH + 'px' }">
        <div v-for="h in hours" :key="h" class="hr" :style="{ top: hourTop(h) }">{{ pad2(h) }}:00</div>
      </div>

      <div class="wk-grid" :style="{ height: gridH + 'px' }">
        <!-- Kẻ ngang -->
        <div v-for="h in hours" :key="'l' + h" class="gridline" :style="{ top: hourTop(h) }" />

        <div v-for="d in days" :key="d.iso" class="wk-col" :class="{ today: d.isToday }">
          <!-- Slot bấm-để-tạo: 2 nửa giờ, nằm dưới event (z-index thấp hơn) -->
          <button
            v-for="slot in d.slots"
            :key="slot.key"
            type="button"
            class="slot"
            tabindex="-1"
            aria-hidden="true"
            :style="{ top: slot.top }"
            :title="`Tạo lịch hẹn ${slot.label}`"
            @click="onSlot($event, slot.date)"
          />

          <div v-if="d.isToday && nowTop !== null" class="nowline" :style="{ top: nowTop + 'px' }">
            <span class="nowdot" />
          </div>

          <!-- role=button thay <button>: bên trong còn nút "hoàn thành" -->
          <div
            v-for="ev in d.events"
            :key="ev.appt.id"
            class="ev"
            :class="{ 'is-muted': ev.tone.muted, 'is-clipped': ev.clipped }"
            :style="ev.style"
            :title="ev.tooltip"
            role="button"
            tabindex="0"
            @click="onPick($event, ev.appt)"
            @keydown.enter.prevent="onPick($event as any, ev.appt)"
            @keydown.space.prevent="onPick($event as any, ev.appt)"
          >
            <span class="ev-body">
              <span class="ev-title" :style="{ color: ev.tone.text, textDecoration: ev.tone.strike ? 'line-through' : 'none' }">
                <span v-if="!ev.twoLine" class="ev-t-inline" :style="{ color: ev.tone.sub }">{{ ev.startLabel }} </span>{{ ev.title }}
              </span>
              <span v-if="ev.twoLine" class="ev-meta" :style="{ color: ev.tone.sub }">
                {{ ev.timeLabel }} · {{ ev.customer }}
              </span>
            </span>

            <span v-if="ev.conflicted" class="ev-warn" title="Trùng giờ với lịch khác của cùng sale">▲</span>

            <!-- Hoàn thành ngay trên thẻ — chỉ hiện khi hover/focus và thẻ đủ cao -->
            <button
              v-if="ev.canDone && ev.twoLine"
              type="button"
              class="ev-done"
              :disabled="busyId === ev.appt.id"
              :title="busyId === ev.appt.id ? 'Đang lưu…' : 'Đánh dấu hoàn thành'"
              @click.stop="$emit('mark-complete', ev.appt)"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </button>

            <!-- Lịch dài hơn khung đang xem → cắt ở đáy, báo cho biết còn tiếp -->
            <span v-if="ev.clipped" class="ev-more" :title="ev.spillLabel">⌄</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * AppointmentsWeekView — bản revamp "Rail" (design 1A, 2026-08-01).
 *
 * Cập nhật 2026-08-04:
 *  - Khung giờ TỰ CO theo dữ liệu (mặc định 08–20 khi tuần trống) + nút bật
 *    "đủ 24 giờ". Trước đây cứng 08–20 nên sáng nào cũng nhìn 2 tiếng chết, mà
 *    lịch ngoài khung thì không thấy đâu.
 *  - Thẻ bị KẸP chiều cao trong lưới. Lịch 1440 phút trước đây render cao 1390px
 *    trong lưới 696px, tràn khỏi cột hơn 1000px và kéo dài vùng cuộn.
 *  - Giờ hiển thị qua `fmtRange` — quấn qua nửa đêm thay vì in "38:45".
 *  - Cuộn tới GIỜ HIỆN TẠI nếu đang xem tuần này (trước: tới lịch sớm nhất).
 *  - Nút ✓ hoàn thành ngay trên thẻ, khỏi phải mở popover.
 */
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import {
  appointmentStart,
  appointmentMinutes,
  appointmentOwnerId,
  appointmentOwnerName,
  saleColor,
  effectiveStatus,
  statusTone,
  fmtClock,
  fmtRange,
  fmtDuration,
  spillDays,
  type StatusTone,
  type AppointmentEx as Appointment,
} from '@/composables/appointment-helpers';
import { orgDayKey, getOrgParts, startOfOrgDay, orgWallClockToUtc } from '@/composables/use-org-timezone';

const props = defineProps<{
  weekStart: Date;
  appointments: Appointment[];
  /** Dựng từ TOÀN BỘ lịch đã tải (không phải tập đã lọc) — xem AppointmentsView. */
  conflictMap: Map<string, Appointment[]>;
  /** Mốc "bây giờ" do view bơm xuống, nhích mỗi phút → quá hạn tự đổi màu. */
  nowTs: number;
  canMutate: (a: Appointment) => boolean;
  busyId: string | null;
}>();

const emit = defineEmits<{
  (e: 'select-appointment', payload: { appt: Appointment; rect: DOMRect }): void;
  (e: 'create-slot', payload: { date: Date; rect: DOMRect }): void;
  (e: 'mark-complete', a: Appointment): void;
}>();

const ROW_H = 58;
const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const DEFAULT_START = 8;
const DEFAULT_END = 20;
const MIN_SPAN = 8; // giờ — dưới mức này lưới trông cụt

const bodyEl = ref<HTMLElement | null>(null);
const showAllHours = ref(false);

function pad2(n: number) { return String(n).padStart(2, '0'); }

/**
 * Khung giờ hiển thị: ôm sát dữ liệu tuần (đệm 1 tiếng mỗi đầu), tối thiểu
 * MIN_SPAN tiếng. Tuần trống → giữ 08–20 để lưới không nhảy lung tung.
 */
const range = computed(() => {
  if (showAllHours.value) return { start: 0, end: 24 };
  let min = 24;
  let max = 0;
  let any = false;
  for (const a of props.appointments) {
    any = true;
    const s = appointmentMinutes(a);
    const e = Math.min(1440, s + (a.durationMin ?? 30));
    min = Math.min(min, Math.floor(s / 60));
    max = Math.max(max, Math.ceil(e / 60));
  }
  if (!any) return { start: DEFAULT_START, end: DEFAULT_END };

  let start = Math.max(0, min - 1);
  let end = Math.min(24, Math.max(max + 1, start + 1));
  if (end - start < MIN_SPAN) {
    start = Math.max(0, Math.min(start, 24 - MIN_SPAN));
    end = Math.min(24, start + MIN_SPAN);
  }
  return { start, end };
});

const hours = computed(() =>
  Array.from({ length: range.value.end - range.value.start }, (_, i) => range.value.start + i),
);
const gridH = computed(() => (range.value.end - range.value.start) * ROW_H);

function hourTop(h: number): string {
  return (h - range.value.start) * ROW_H + 'px';
}

/* ── Đường "bây giờ" — tick mỗi phút, chỉ khi nằm trong khung đang xem ── */
const nowMinutes = ref(currentOrgMinutes());
let nowTimer: ReturnType<typeof setInterval> | null = null;

function currentOrgMinutes(): number {
  const p = getOrgParts(new Date());
  return p ? p.hour * 60 + p.minute : 0;
}
const nowTop = computed<number | null>(() => {
  const m = nowMinutes.value;
  if (m < range.value.start * 60 || m > range.value.end * 60) return null;
  return ((m - range.value.start * 60) / 60) * ROW_H;
});

/* ── Bố cục sự kiện: gom cụm chồng giờ → chia lane ── */
type Laid = {
  appt: Appointment;
  style: Record<string, string>;
  tone: StatusTone;
  twoLine: boolean;
  clipped: boolean;
  spillLabel: string;
  canDone: boolean;
  title: string;
  customer: string;
  startLabel: string;
  timeLabel: string;
  tooltip: string;
  conflicted: boolean;
};

function layout(items: Appointment[]): Laid[] {
  const list = items
    .map((a) => ({ a, s: appointmentMinutes(a), d: a.durationMin ?? 30 }))
    .sort((x, y) => x.s - y.s || y.d - x.d);

  const lanes = new Map<string, { lane: number; of: number }>();
  let cluster: typeof list = [];
  let end = -1;
  const flush = () => {
    if (!cluster.length) return;
    const cols: (typeof list)[] = [];
    for (const it of cluster) {
      let placed = false;
      for (let ci = 0; ci < cols.length; ci++) {
        const last = cols[ci][cols[ci].length - 1];
        if (last.s + last.d <= it.s) {
          cols[ci].push(it);
          lanes.set(it.a.id, { lane: ci, of: 0 });
          placed = true;
          break;
        }
      }
      if (!placed) {
        lanes.set(it.a.id, { lane: cols.length, of: 0 });
        cols.push([it]);
      }
    }
    for (const it of cluster) lanes.get(it.a.id)!.of = cols.length;
    cluster = [];
    end = -1;
  };
  for (const it of list) {
    if (cluster.length && it.s >= end) flush();
    cluster.push(it);
    end = Math.max(end, it.s + it.d);
  }
  flush();

  const gridBottom = gridH.value;

  return list.map(({ a, s, d }) => {
    const st = effectiveStatus(a, props.nowTs);
    const tone = statusTone(st, saleColor(appointmentOwnerId(a)).bg);
    const rec = lanes.get(a.id) ?? { lane: 0, of: 1 };
    const of = rec.of || 1;

    const rawTop = ((s - range.value.start * 60) / 60) * ROW_H;
    const top = Math.max(0, rawTop);
    const rawH = (d / 60) * ROW_H - 2;
    // KẸP trong lưới: lịch dài (vd 1 ngày) không được tràn khỏi cột.
    const maxH = Math.max(16, gridBottom - top - 2);
    const h = Math.min(rawH, maxH);
    const clipped = rawH > maxH + 0.5;

    const customer = a.contact?.fullName || 'Khách hàng';
    const timeLabel = fmtRange(s, d, true);
    const spill = spillDays(s, d);
    return {
      appt: a,
      tone,
      twoLine: h >= 34,
      clipped,
      spillLabel: spill > 0
        ? `Kéo dài ${fmtDuration(d)}, sang ngày hôm sau`
        : `Kéo dài ${fmtDuration(d)}, dài hơn khung giờ đang xem`,
      canDone: (st === 'scheduled' || st === 'overdue') && props.canMutate(a),
      title: a.title || customer,
      customer,
      startLabel: fmtClock(s),
      timeLabel,
      tooltip: `${a.title || customer} · ${fmtRange(s, d)} · ${fmtDuration(d)} · ${appointmentOwnerName(a)}`,
      conflicted: props.conflictMap.has(a.id),
      style: {
        top: top + 'px',
        height: h + 'px',
        left: `calc(${(rec.lane / of) * 100}% + 2px)`,
        width: `calc(${100 / of}% - 4px)`,
        background: tone.bg,
        boxShadow: `inset 3px 0 0 ${tone.bar}`,
        zIndex: String(2 + rec.lane),
      },
    };
  });
}

/**
 * Khung 7 ngày + slot 30'. Tách khỏi `days` vì chỉ phụ thuộc weekStart + range:
 * để chung thì mỗi lần đổi bộ lọc lại dựng lại toàn bộ object Date.
 */
const skeleton = computed(() => {
  const todayKey = orgDayKey(new Date());
  const { start, end } = range.value;
  return Array.from({ length: 7 }, (_, i) => {
    const raw = new Date(props.weekStart.getTime() + i * 86_400_000);
    const date = startOfOrgDay(raw) || raw;
    const iso = orgDayKey(date);
    const parts = getOrgParts(date);

    const slots: { key: string; top: string; label: string; date: Date }[] = [];
    for (let h = start; h < end; h++) {
      for (const mm of [0, 30]) {
        const hhmm = pad2(h) + ':' + pad2(mm);
        const at = orgWallClockToUtc(iso, hhmm);
        if (!at) continue;
        slots.push({
          key: iso + hhmm,
          top: ((h - start) * ROW_H + (mm / 60) * ROW_H) + 'px',
          label: hhmm,
          date: at,
        });
      }
    }
    return {
      iso,
      dow: DOW[i],
      num: pad2(parts?.day ?? date.getDate()),
      isToday: iso === todayKey,
      slots,
    };
  });
});

const days = computed(() =>
  skeleton.value.map((d) => {
    const dayApts = props.appointments.filter((a) => orgDayKey(appointmentStart(a)) === d.iso);
    return { ...d, count: dayApts.length, events: layout(dayApts) };
  }),
);

function onPick(e: MouseEvent, appt: Appointment) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  emit('select-appointment', { appt, rect });
}

/** Kèm rect của ô để form tạo nhanh neo đúng chỗ vừa bấm. */
function onSlot(e: MouseEvent, date: Date) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  emit('create-slot', { date, rect });
}

/**
 * Cuộn tới GIỜ HIỆN TẠI khi đang xem tuần chứa hôm nay (công cụ dùng hằng ngày
 * — mở ra là muốn thấy "bây giờ"). Tuần khác thì tới lịch sớm nhất.
 */
function scrollToFocus() {
  const el = bodyEl.value;
  if (!el) return;
  const todayKey = orgDayKey(new Date());
  const inThisWeek = skeleton.value.some((d) => d.iso === todayKey);
  const mins = props.appointments.map(appointmentMinutes).filter((m) => m > 0);
  const anchorMin = inThisWeek
    ? nowMinutes.value
    : (mins.length ? Math.min(...mins) : range.value.start * 60);
  const target = ((anchorMin - 60) / 60 - range.value.start) * ROW_H;
  el.scrollTop = Math.max(0, Math.min(target, el.scrollHeight - el.clientHeight));
}

onMounted(() => {
  nowTimer = setInterval(() => { nowMinutes.value = currentOrgMinutes(); }, 60_000);
  requestAnimationFrame(scrollToFocus);
});
onBeforeUnmount(() => { if (nowTimer) clearInterval(nowTimer); });

// Đổi tuần / bật 24h → canh lại vùng nhìn.
watch([() => props.weekStart, showAllHours], () => {
  requestAnimationFrame(scrollToFocus);
});
</script>

<style scoped>
@import '@/assets/appointments-rail.css';

.rl-week {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--rl-surface);
}

.wk-gutter { width: 56px; flex: 0 0 56px; }
.wk-gutter--head { display: grid; place-items: center; }

.hr-toggle {
  border: 1px solid var(--rl-hairline);
  border-radius: var(--rl-r-xs);
  background: var(--rl-surface);
  color: var(--rl-muted);
  font-family: inherit;
  font-size: 9.5px;
  font-variant-numeric: tabular-nums;
  padding: 2px 4px;
  cursor: pointer;
  white-space: nowrap;
}
.hr-toggle:hover { background: var(--rl-surface-soft); color: var(--rl-ink); }

/* ── Header ─────────────────────────────────────────────────────── */
.wk-head {
  display: flex;
  border-bottom: 1px solid var(--rl-hairline);
  scrollbar-gutter: stable;
  overflow: hidden;
  flex: none;
}
.wk-dhead {
  flex: 1;
  min-width: 0;
  padding: 7px 4px 6px;
  text-align: center;
  border-left: 1px solid var(--rl-gridline);
}
.wk-dhead.today { background: var(--rl-today-bg); }
.wk-dhead .dow {
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-weight: 600;
  color: var(--rl-dim);
}
.wk-dhead.today .dow { color: var(--rl-accent); }
.wk-dhead .num {
  font-family: var(--rl-font-head);
  font-size: 17px;
  font-weight: 600;
  color: var(--rl-ink);
  font-variant-numeric: tabular-nums;
  margin-top: 1px;
}
.wk-dhead.today .num { color: var(--rl-accent); }
.wk-dhead .cnt {
  font-size: 10.5px;
  color: var(--rl-dim);
  margin-top: 1px;
  font-variant-numeric: tabular-nums;
  min-height: 13px;
}

/* ── Body ───────────────────────────────────────────────────────── */
.wk-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
  display: flex;
  position: relative;
  align-items: flex-start;
}
.wk-gutter.times { position: relative; }
.hr {
  position: absolute;
  right: 7px;
  transform: translateY(-6px);
  font-size: 10.5px;
  color: var(--rl-dim);
  font-variant-numeric: tabular-nums;
}

.wk-grid {
  flex: 1;
  min-width: 0;
  display: flex;
  position: relative;
}
.gridline {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px solid var(--rl-gridline);
  z-index: 1;
  pointer-events: none;
}

.wk-col {
  flex: 1;
  min-width: 0;
  position: relative;
  border-left: 1px solid var(--rl-gridline);
  /* Chặn thẻ dài tràn ra ngoài cột (đi kèm việc kẹp chiều cao ở layout()) */
  overflow: hidden;
}
.wk-col.today { background: var(--rl-today-bg); }

.slot {
  position: absolute;
  left: 0;
  right: 0;
  height: calc(var(--rl-row-h) / 2);
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
  z-index: 1;
}
.slot:hover { background: var(--rl-accent-a06); }

.nowline {
  position: absolute;
  left: 0;
  right: 0;
  height: 0;
  border-top: 1.5px solid var(--rl-danger);
  z-index: 6;
  pointer-events: none;
}
.nowdot {
  position: absolute;
  left: -3px;
  top: -3.5px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--rl-danger);
}

/* ── Event card ─────────────────────────────────────────────────── */
.ev {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  align-items: stretch;
  text-align: left;
  padding: 0;
  border: 1px solid var(--rl-ink-a06);
  border-radius: var(--rl-r-sm);
  overflow: hidden;
  cursor: pointer;
  font-family: inherit;
}
/* Hover = lớp phủ opacity. KHÔNG dùng filter (tạo stacking context + tách layer
   cho từng thẻ) và cũng không dùng box-shadow — inline style đã chiếm nó cho
   dải màu trái. */
.ev::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--rl-ink-a06);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}
.ev:hover::after { opacity: 1; }
.ev:focus-visible {
  outline: 2px solid var(--rl-accent);
  outline-offset: 1px;
}
.ev.is-muted { opacity: 0.85; }
/* Bị cắt đáy → bo góc dưới phẳng lại cho thấy là "còn tiếp" */
.ev.is-clipped { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }

.ev-body {
  padding: 3px 6px 3px 8px;
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ev-title {
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ev-t-inline { font-weight: 400; font-variant-numeric: tabular-nums; }
.ev-meta {
  font-size: 10.5px;
  margin-top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.ev-warn {
  position: absolute;
  top: 2px;
  right: 3px;
  font-size: 8px;
  color: var(--rl-warn);
  line-height: 1;
  z-index: 2;
}
.ev-more {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -2px;
  text-align: center;
  font-size: 11px;
  line-height: 1;
  color: var(--rl-muted);
  pointer-events: none;
  z-index: 2;
}

/* ✓ hoàn thành — ẩn cho tới khi hover/focus vào thẻ */
.ev-done {
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border: 1px solid var(--rl-hairline);
  border-radius: var(--rl-r-xs);
  background: var(--rl-surface);
  color: var(--rl-muted);
  cursor: pointer;
  font-family: inherit;
  opacity: 0;
  transition: opacity 0.12s ease, background-color 0.12s ease, color 0.12s ease;
  z-index: 3;
}
.ev:hover .ev-done,
.ev:focus-within .ev-done { opacity: 1; }
.ev-done:hover:not(:disabled) {
  background: var(--rl-success);
  border-color: var(--rl-success);
  color: #fff;
}
.ev-done:focus-visible { opacity: 1; outline: 2px solid var(--rl-accent); outline-offset: 1px; }
.ev-done:disabled { opacity: 0.5; cursor: not-allowed; }

@media (prefers-reduced-motion: reduce) {
  .ev::after,
  .ev-done { transition: none; }
}
</style>
