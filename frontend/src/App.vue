<template>
  <component :is="layout">
    <router-view />
  </component>
  <!-- 2026-06-16 — hộp xác nhận HS theme global (thay window.confirm toàn app) -->
  <ConfirmHost />
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import AuthLayout from '@/layouts/AuthLayout.vue';
import MobileLayout from '@/layouts/MobileLayout.vue';
import WorkspaceShell from '@/layouts/WorkspaceShell.vue';
import ConfirmHost from '@/components/ui/ConfirmHost.vue';
import { useMobile } from '@/composables/use-mobile';
import { useAuthStore } from '@/stores/auth';
import { usePrivacyStore } from '@/stores/privacy';
import { useWorkspaceStore } from '@/workspaces/resolver';

const route = useRoute();
const { isMobile } = useMobile();
const auth = useAuthStore();
const privacy = usePrivacyStore();
const workspaceStore = useWorkspaceStore();

// Layout resolution — Workspace Architecture 2026-07 Phase 1:
//   'auth'    → AuthLayout (login, setup, public action pages)
//   default   → WorkspaceShell (tự chọn SalesLayout / DefaultLayout theo workspace)
//   mobile    → MobileLayout (giữ nguyên, chưa tích hợp workspace cho mobile)
const layout = computed(() => {
  const name = (route.meta?.layout as string) || 'default';
  if (name === 'auth') return AuthLayout;
  return isMobile.value ? MobileLayout : WorkspaceShell;
});

// Workspace Architecture 2026-07 — tự động resolve workspace khi user thay đổi.
// Watch auth.user: bao gồm cả login, F5 (fetchProfile), và refresh token.
// Đây là điểm tích hợp DUY NHẤT — không cần if-else ở bất kỳ nơi nào khác.
watch(
  () => auth.user,
  (u) => {
    if (u) workspaceStore.resolveForUser(u);
  },
  { immediate: true },
);

// Anh chốt 2026-05-22: sau F5 refresh, gọi privacyStore.fetchStatus() để rebuild
// isUnlocked + expiresAt từ HttpOnly cookie.
watch(
  () => auth.user?.id,
  (uid) => { if (uid) privacy.fetchStatus(true).catch(() => {}); },
  { immediate: true },
);
</script>
