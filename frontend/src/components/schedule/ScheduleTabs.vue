<template>
  <nav class="sched-tabs rail-scope" aria-label="Lịch & Việc">
    <RouterLink
      v-for="t in TABS"
      :key="t.path"
      :to="t.path"
      class="sched-tab"
      :class="{ active: isActive(t.path) }"
    >
      {{ t.label }}
      <span v-if="t.badge && t.badge > 0" class="sched-count">{{ t.badge }}</span>
    </RouterLink>
  </nav>
</template>

<script setup lang="ts">
/**
 * ScheduleTabs — dải tab con "Lịch hẹn | Công việc" (2026-08-04, giai đoạn 1 của
 * việc gộp 2 màn theo direction 1A: Tasks về chung một mặt "Schedule").
 *
 * Giai đoạn 1 CHỈ gộp điều hướng: 2 trang vẫn giữ nguyên dữ liệu và layout riêng,
 * chỉ khác là vào từ một chỗ và nhảy qua lại được mà không phải quay lên thanh nav.
 * Việc đưa task lên lưới lịch là giai đoạn 2 — cần đường render riêng vì task
 * không có thời lượng nên không lọt vào thuật toán layout() của lưới tuần.
 *
 * Số trên tab Lịch hẹn dùng chung nguồn với badge ở thanh nav (1 lần fetch cho
 * cả app), nên đặt ở đây không tốn thêm request.
 */
import { computed } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { useAppointmentBadge } from '@/composables/use-appointment-badge';

const route = useRoute();
const { todayCount } = useAppointmentBadge();

const TABS = computed(() => [
  { path: '/appointments', label: 'Lịch hẹn', badge: todayCount.value },
  { path: '/tasks', label: 'Công việc', badge: 0 },
]);

function isActive(path: string): boolean {
  return route.path === path || route.path.startsWith(path + '/');
}
</script>

<style scoped>
@import '@/assets/appointments-rail.css';

.sched-tabs {
  flex: none;
  display: flex;
  align-items: center;
  gap: 2px;
  height: 44px;
  padding: 0 18px;
  background: var(--rl-surface);
  border-bottom: 1px solid var(--rl-hairline);
}

.sched-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--rl-r-md);
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  color: var(--rl-muted);
  text-decoration: none;
  transition: background-color 0.12s ease, color 0.12s ease;
}
.sched-tab:hover {
  background: var(--rl-surface-soft);
  color: var(--rl-ink);
}
.sched-tab.active {
  background: var(--rl-hairline-soft);
  color: var(--rl-ink);
}
.sched-tab:focus-visible {
  outline: 2px solid var(--rl-accent);
  outline-offset: 2px;
}

.sched-count {
  display: inline-grid;
  place-items: center;
  min-width: 17px;
  height: 17px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--rl-accent-soft);
  color: var(--rl-accent-deep);
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.sched-tab.active .sched-count {
  background: var(--rl-accent);
  color: #fff;
}

@media (max-width: 600px) {
  .sched-tabs { padding: 0 14px; }
}

@media (prefers-reduced-motion: reduce) {
  .sched-tab { transition: none; }
}
</style>
