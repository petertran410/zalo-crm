<template>
  <!--
    WorkspaceShell.vue — Dynamic Layout Wrapper
    ─────────────────────────────────────────────
    Tự động render Layout phù hợp dựa trên Workspace đang kích hoạt.
    Đây là component được App.vue dùng thay cho DefaultLayout khi route
    yêu cầu layout = 'workspace' (tất cả protected routes).

    Flow:
      activeWorkspaceId → workspaceRegistry[id] → layoutComponent → <component :is="...">
  -->
  <component :is="activeLayout">
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useWorkspaceStore } from '@/workspaces/resolver';
import DefaultLayout from '@/layouts/DefaultLayout.vue';

const workspaceStore = useWorkspaceStore();

/**
 * Layout component tương ứng với Workspace đang active.
 * Fallback về DefaultLayout nếu config chưa sẵn sàng (edge case: race condition).
 */
const activeLayout = computed(() => {
  return workspaceStore.activeConfig?.layoutComponent ?? DefaultLayout;
});
</script>
