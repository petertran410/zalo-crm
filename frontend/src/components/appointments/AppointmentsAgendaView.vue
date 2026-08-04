<template>
  <div class="rl-agenda">
    <div v-for="g in groups" :key="g.iso" class="ag-group">
      <div class="ag-head">
        <div class="ag-date" :class="{ today: g.isToday }">{{ g.label }}</div>
        <div class="ag-count">{{ g.events.length }} lịch hẹn</div>
        <div v-if="g.conflicts" class="ag-conflict" :title="'Có lịch trùng giờ trong ngày'">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M12 8v5M12 16.5v.01" /><circle cx="12" cy="12" r="9" />
          </svg>
          {{ g.conflicts }} trùng giờ
        </div>
      </div>

      <!-- role=button thay vì <button> thật: bên trong còn nút "hoàn thành",
           mà HTML không cho lồng button trong button. -->
      <div
        v-for="ev in g.events"
        :key="ev.appt.id"
        class="ag-row"
        :class="{ 'is-muted': ev.tone.muted }"
        role="button"
        tabindex="0"
        @click="onPick($event, ev.appt)"
        @keydown.enter.prevent="onPick($event as any, ev.appt)"
        @keydown.space.prevent="onPick($event as any, ev.appt)"
      >
        <span class="ag-time" :title="ev.durationLabel">{{ ev.timeLabel }}</span>
        <span class="ag-dot" :style="{ background: ev.tone.bar }" />
        <span
          class="ag-title"
          :title="ev.title"
          :style="{ textDecoration: ev.tone.strike ? 'line-through' : 'none' }"
        >{{ ev.title }}</span>
        <span class="ag-cust" :title="ev.customer">{{ ev.customer }}</span>
        <span class="ag-phone">{{ ev.phone }}</span>
        <span class="ag-type">{{ ev.typeLabel }}</span>
        <span class="ag-src">{{ ev.sourceLabel }}</span>
        <span class="ag-spacer" />
        <span
          class="ag-status"
          :style="{ color: ev.tone.sub, background: ev.tone.bg }"
        >{{ ev.statusLabel }}</span>
        <span class="rl-avatar ag-owner" :style="{ background: ev.ownerColor }">{{ ev.ownerInitials }}</span>
        <button
          v-if="ev.open && canMutate(ev.appt)"
          type="button"
          class="ag-done"
          :disabled="busyId === ev.appt.id"
          :title="busyId === ev.appt.id ? 'Đang lưu…' : 'Đánh dấu hoàn thành'"
          @click.stop="$emit('mark-complete', ev.appt)"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </button>
        <span v-else class="ag-done-spacer" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * AppointmentsAgendaView — thay AppointmentsListView (bảng 7 cột) bằng agenda
 * theo design "Rail" 1A (2026-08-01). Đây cũng là view DUY NHẤT dưới 900px nên
 * phần dưới có media query xếp chồng lại, không để bảng tràn ngang.
 *
 * Giữ lại từ bản cũ: đếm trùng giờ ở header ngày (design bỏ, nhưng đây là chỗ
 * duy nhất trong app cảnh báo double-booking nên không bỏ được) và tô quá hạn
 * theo effectiveStatus.
 */
import { computed } from 'vue';
import {
  initials,
  statusLabel,
  typeLabel,
  saleColor,
  appointmentStart,
  appointmentMinutes,
  appointmentOwnerId,
  appointmentOwnerName,
  effectiveStatus,
  statusTone,
  countConflicts,
  fmtRange,
  fmtDuration,
  type StatusTone,
  type AppointmentEx as Appointment,
} from '@/composables/appointment-helpers';
import { orgDayKey, getOrgParts } from '@/composables/use-org-timezone';

const props = defineProps<{
  appointments: Appointment[];
  /** Dựng từ TOÀN BỘ lịch đã tải — lọc rồi mới đếm thì cảnh báo trùng giờ biến mất. */
  conflictMap: Map<string, Appointment[]>;
  nowTs: number;
  canMutate: (a: Appointment) => boolean;
  busyId: string | null;
}>();

const emit = defineEmits<{
  (e: 'select-appointment', payload: { appt: Appointment; rect: DOMRect }): void;
  (e: 'mark-complete', a: Appointment): void;
}>();

function onPick(e: MouseEvent, appt: Appointment) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  emit('select-appointment', { appt, rect });
}

const DOW_LONG = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

type Row = {
  appt: Appointment;
  tone: StatusTone;
  title: string;
  customer: string;
  phone: string;
  timeLabel: string;
  durationLabel: string;
  typeLabel: string;
  statusLabel: string;
  sourceLabel: string;
  ownerColor: string;
  ownerInitials: string;
  /** Còn mở (scheduled/overdue) → cho phép đánh dấu hoàn thành ngay trên dòng. */
  open: boolean;
};

const groups = computed(() => {
  const todayKey = orgDayKey(new Date());
  const byDay = new Map<string, Appointment[]>();
  for (const a of props.appointments) {
    const key = orgDayKey(appointmentStart(a));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(a);
  }

  return [...byDay.entries()]
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([iso, items]) => {
      const sorted = [...items].sort((a, b) => appointmentMinutes(a) - appointmentMinutes(b));
      const parts = getOrgParts(appointmentStart(sorted[0]));
      const label = parts
        ? `${DOW_LONG[parts.dayOfWeek] ?? ''} ${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}`
        : iso;

      const events: Row[] = sorted.map((a) => {
        const st = effectiveStatus(a, props.nowTs);
        const ownerId = appointmentOwnerId(a);
        const s = appointmentMinutes(a);
        const d = a.durationMin ?? 30;
        const customer = a.contact?.fullName || 'Khách hàng';
        return {
          appt: a,
          tone: statusTone(st, saleColor(ownerId).bg),
          title: a.title || customer,
          customer,
          phone: a.contact?.phone || '—',
          timeLabel: fmtRange(s, d),
          durationLabel: fmtDuration(d),
          typeLabel: a.type ? typeLabel(a.type) : '—',
          statusLabel: statusLabel(st),
          sourceLabel: a.source === 'zalo' ? 'Zalo' : 'Thủ công',
          ownerColor: saleColor(ownerId).bg,
          ownerInitials: initials(appointmentOwnerName(a)),
          open: st === 'scheduled' || st === 'overdue',
        };
      });

      return {
        iso, label, isToday: iso === todayKey, events,
        conflicts: countConflicts(sorted, props.conflictMap),
      };
    });
});
</script>

<style scoped>
@import '@/assets/appointments-rail.css';

.rl-agenda {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: var(--rl-surface);
  padding-bottom: 40px;
}

.ag-head {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 7px 20px;
  background: var(--rl-surface-soft);
  border-top: 1px solid var(--rl-hairline);
  border-bottom: 1px solid var(--rl-hairline);
}
.ag-date {
  font-family: var(--rl-font-head);
  font-size: 13px;
  font-weight: 600;
  color: var(--rl-ink);
}
.ag-date.today { color: var(--rl-accent); }
.ag-count { font-size: 12px; color: var(--rl-dim); }
.ag-conflict {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  font-size: 11.5px;
  color: var(--rl-warn-text);
  background: var(--rl-warn-bg);
  border: 1px solid var(--rl-warn-border);
  border-radius: var(--rl-r-xs);
  padding: 1px 7px;
}

.ag-row {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 9px 20px 9px 18px;
  border: 0;
  border-bottom: 1px solid var(--rl-hairline-soft);
  background: transparent;
  text-align: left;
  font-family: inherit;
  cursor: pointer;
  transition: background-color 0.12s ease;
}
.ag-row:hover { background: var(--rl-surface-soft); }
.ag-row:focus-visible {
  outline: 2px solid var(--rl-accent);
  outline-offset: -2px;
}
.ag-row.is-muted .ag-title,
.ag-row.is-muted .ag-cust { color: var(--rl-dim); }

.ag-time {
  width: 86px;
  flex: 0 0 86px;
  font-size: 12.5px;
  color: var(--rl-body);
  font-variant-numeric: tabular-nums;
}
.ag-dot { width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; }
.ag-title {
  width: 250px;
  flex: 0 1 250px;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--rl-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ag-cust {
  width: 190px;
  flex: 0 1 190px;
  font-size: 12.5px;
  color: var(--rl-body);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ag-phone {
  width: 110px;
  flex: 0 0 110px;
  font-size: 12px;
  color: var(--rl-dim);
  font-variant-numeric: tabular-nums;
}
.ag-type { width: 72px; flex: 0 0 72px; font-size: 11.5px; color: var(--rl-muted); }
.ag-src { width: 52px; flex: 0 0 52px; font-size: 11px; color: var(--rl-dim); }
.ag-spacer { flex: 1; }
.ag-status {
  font-size: 11px;
  font-weight: 500;
  border: 1px solid var(--rl-ink-a06);
  border-radius: var(--rl-r-xs);
  padding: 2px 7px;
  white-space: nowrap;
}
.ag-owner {
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  font-size: 8px;
}

/* Đánh dấu hoàn thành ngay trên dòng — bản bảng cũ có, agenda theo design thì
   không; giữ lại vì bỏ đi là mọi thao tác đều phải mở popover. */
.ag-done {
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--rl-hairline);
  border-radius: var(--rl-r-md);
  background: var(--rl-surface);
  color: var(--rl-muted);
  cursor: pointer;
  font-family: inherit;
  transition: background-color 0.12s ease, color 0.12s ease;
}
.ag-done:hover:not(:disabled) {
  background: var(--rl-success);
  border-color: var(--rl-success);
  color: #fff;
}
.ag-done:disabled { opacity: 0.45; cursor: not-allowed; }
.ag-done-spacer { width: 24px; flex: 0 0 24px; }

/* ── Dưới 1180px: bỏ cột phụ theo thứ tự ưu tiên thấp → cao ────────── */
@media (max-width: 1180px) {
  .ag-src { display: none; }
}
@media (max-width: 1060px) {
  .ag-phone { display: none; }
}

/* ── Mobile: agenda là view DUY NHẤT, xếp 2 hàng thay vì cắt cột ────── */
@media (max-width: 900px) {
  .ag-row {
    flex-wrap: wrap;
    gap: 6px 10px;
    padding: 10px 14px;
  }
  .ag-time { flex: 0 0 auto; width: auto; font-weight: 500; }
  .ag-title { flex: 1 1 100%; width: auto; order: 3; }
  .ag-cust { flex: 0 1 auto; width: auto; order: 4; }
  .ag-type { flex: 0 0 auto; width: auto; order: 5; }
  .ag-status { order: 2; margin-left: auto; }
  .ag-owner { order: 6; margin-left: auto; }
  .ag-done { order: 7; }
  .ag-done-spacer { display: none; }
  .ag-spacer { display: none; }
  .ag-head { padding: 7px 14px; }
}

@media (prefers-reduced-motion: reduce) {
  .ag-row { transition: none; }
}
</style>
