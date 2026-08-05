<template>
  <!-- 2026-06-09 (anh báo menu bar kẹt không click được, phải F5): CLICK + v-model
       điều khiển, KHÔNG open-on-hover. Hover race + click item bị chặn quyền làm
       overlay (z-index 2000) kẹt mở, phủ lên nav nuốt click. DefaultLayout đóng hết
       menu ở router.afterEach. -->
  <v-menu
    v-model="open"
    :close-on-content-click="true"
    :location="mode === 'rail' ? 'end' : 'bottom'"
  >
    <template #activator="{ props: act }">
      <button
        v-bind="act"
        :class="mode === 'rail'
          ? ['rail-item', { 'rail-item--active': isActive }]
          : ['nav-tab', { active: isActive }]"
        :title="mode === 'rail' ? 'Báo cáo' : undefined"
      >
        <v-icon icon="mdi-chart-box-outline" :size="mode === 'rail' ? 21 : 16" class="ic-svg" />
        <span :class="mode === 'rail' ? 'rail-label' : 'nav-tab-text'">Báo cáo</span>
        <span v-if="mode === 'bar'" class="caret">▾</span>
      </button>
    </template>

    <!-- Module Báo cáo 7 màn (2026-06-17) — liệt kê trực tiếp cho dễ vào. -->
    <v-list density="compact" min-width="236">
      <v-list-subheader>Báo cáo</v-list-subheader>
      <v-list-item to="/reports/tong-quan" title="Tổng quan điều hành"   prepend-icon="mdi-view-dashboard-outline" />
      <v-list-item to="/reports/nick"      title="Vận hành Nick Zalo"    prepend-icon="mdi-cellphone-link" />
      <v-list-item to="/reports/sale"      title="Hiệu suất Sale & Team" prepend-icon="mdi-account-tie-outline" />
      <!-- EE-only: Pipeline (Lead Pool) + Automation report là tính năng Extension.
           Ẩn ở Community (route /reports/automation do EE inject → CE không có). -->
      <v-list-item v-if="isExtension" to="/reports/pipeline"   title="Pipeline & Lead Pool" prepend-icon="mdi-filter-variant" />
      <v-list-item v-if="isExtension" to="/reports/automation" title="Automation & Chăm sóc" prepend-icon="mdi-cog-sync-outline" />
      <v-list-item to="/reports/engagement" title="Engagement KH"       prepend-icon="mdi-fire" />
      <v-list-item to="/reports/audit"      title="Audit & Sức khỏe HT" prepend-icon="mdi-shield-check-outline" />
      <v-divider />
      <v-list-item to="/analytics" title="Phân tích nâng cao" prepend-icon="mdi-chart-line" />
    </v-list>
  </v-menu>
</template>

<script setup lang="ts">
/**
 * NavReportsMenu — dropdown "Báo cáo" dùng chung cho CẢ hai chế độ nav
 * (revamp nav 2026-08-05).
 *
 * Tách ra component riêng để khỏi phải nhân đôi 15 dòng <v-list> cho thanh ngang
 * và rail dọc. Chỉ activator đổi hình dạng theo `mode`; danh sách mục giữ nguyên.
 *
 * ⚠️ Style của activator (.nav-tab / .rail-item) nằm ở assets/nav-shell.css dạng
 * TOÀN CỤC — CSS scoped của DefaultLayout không với vào được nút bên trong đây.
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { isExtension } from '@ee/edition';

defineProps<{ mode: 'bar' | 'rail' }>();

/** v-model do cha giữ để đóng sạch sau mỗi lần điều hướng. */
const open = defineModel<boolean>({ default: false });

const route = useRoute();
// Sáng khi ở /analytics hoặc /reports
const isActive = computed(
  () => route.path.startsWith('/analytics') || route.path.startsWith('/reports'),
);
</script>
