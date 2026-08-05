<template>
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
        :title="mode === 'rail' ? 'Cài đặt' : undefined"
      >
        <v-icon icon="mdi-cog-outline" :size="mode === 'rail' ? 21 : 16" class="ic-svg" />
        <span :class="mode === 'rail' ? 'rail-label' : 'nav-tab-text'">Cài đặt</span>
        <span v-if="mode === 'bar'" class="caret">▾</span>
      </button>
    </template>

    <!-- Dropdown = LỐI TẮT (2026-06-10 CEO-review): 7 mục hay dùng, route mới
         đồng bộ sidebar (bỏ /settings/team/* legacy + Tag cũ). Lọc theo grants.
         Đầy đủ menu ở "Xem tất cả cài đặt". -->
    <v-list density="compact" min-width="248">
      <v-list-subheader>Lối tắt hay dùng</v-list-subheader>
      <v-list-item to="/settings/personal/profile" title="Hồ sơ của tôi" prepend-icon="mdi-account-outline" />
      <v-list-item v-if="authStore.canAccess('user')" to="/settings/rbac/users" title="Nhân viên" prepend-icon="mdi-account-group-outline" />
      <v-list-item v-if="authStore.canAccess('permission_group')" to="/settings/rbac/permission-groups" title="Phân quyền" prepend-icon="mdi-shield-account-outline" />
      <v-divider />
      <v-list-item v-if="authStore.canAccess('zalo_account')" to="/settings/channels/zalo" title="Tài khoản Zalo" prepend-icon="mdi-cellphone-link" />
      <v-list-item v-if="authStore.canAccess('settings')" to="/settings/crm/tags-v2" title="Nhãn KH" prepend-icon="mdi-tag-multiple-outline" />
      <v-list-item v-if="authStore.canAccess('settings')" to="/settings/org/system-notifications" title="Thông báo hệ thống" prepend-icon="mdi-bell-cog-outline" />
      <!-- Open-core: extension top-nav shortcuts (empty in Community edition). -->
      <template v-for="sc in eeTopNavShortcuts" :key="sc.to">
        <v-list-item v-if="authStore.canAccess(sc.resource)" :to="sc.to" :title="sc.title" :prepend-icon="sc.icon" />
      </template>
      <v-divider />
      <v-list-item to="/settings" title="Xem tất cả cài đặt" prepend-icon="mdi-cog-outline" />
    </v-list>
  </v-menu>
</template>

<script setup lang="ts">
/**
 * NavSettingsMenu — dropdown "Cài đặt" dùng chung cho cả thanh ngang và rail dọc
 * (revamp nav 2026-08-05). Xem ghi chú ở NavReportsMenu.vue về lý do tách file.
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
// Open-core: extension top-nav shortcuts (empty in Community edition via @ee stub).
import { eeTopNavShortcuts } from '@ee/nav';

defineProps<{ mode: 'bar' | 'rail' }>();

const open = defineModel<boolean>({ default: false });

const route = useRoute();
const authStore = useAuthStore();
const isActive = computed(
  () => route.path === '/settings' || route.path.startsWith('/settings/'),
);
</script>
