<template>
  <div ref="menuRoot" class="settings-menu" :class="`settings-menu--${mode}`">
    <button
      ref="activator"
      type="button"
      :class="mode === 'rail'
        ? ['rail-item', { 'rail-item--active': isActive }]
        : ['nav-tab', { active: isActive }]"
      :title="mode === 'rail' ? 'Cài đặt' : undefined"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click.stop="toggle"
      @keydown.escape="close"
    >
      <Cog :size="mode === 'rail' ? 21 : 18" :stroke-width="1.9" class="ic-svg" />
      <span :class="mode === 'rail' ? 'rail-label' : 'nav-tab-text'">Cài đặt</span>
      <ChevronDown v-if="mode === 'bar'" class="caret" :size="14" :stroke-width="2" />
    </button>

    <!-- Không dùng v-menu/VOverlay: overlay của Vuetify teleport sang document.body.
         Khi overlay bị mồ côi, dropdown vẫn còn nhưng WorkspaceShell phía sau trắng. -->
    <div
      v-if="open"
      class="settings-menu__panel"
      role="menu"
      aria-label="Lối tắt cài đặt"
      @click.stop
    >
      <div class="settings-menu__heading">Lối tắt hay dùng</div>
      <RouterLink class="settings-menu__item" to="/settings/personal/profile" @click="close">
        <UserRound :size="18" /><span>Hồ sơ của tôi</span>
      </RouterLink>
      <RouterLink
        v-if="authStore.canAccess('user')"
        class="settings-menu__item"
        to="/settings/rbac/users"
        @click="close"
      >
        <UsersRound :size="18" /><span>Nhân viên</span>
      </RouterLink>
      <RouterLink
        v-if="authStore.canAccess('permission_group')"
        class="settings-menu__item"
        to="/settings/rbac/permission-groups"
        @click="close"
      >
        <ShieldCheck :size="18" /><span>Phân quyền</span>
      </RouterLink>
      <div class="settings-menu__divider" />
      <RouterLink
        v-if="authStore.canAccess('zalo_account')"
        class="settings-menu__item"
        to="/settings/channels/zalo"
        @click="close"
      >
        <Smartphone :size="18" /><span>Tài khoản Zalo</span>
      </RouterLink>
      <RouterLink
        v-if="authStore.canAccess('settings')"
        class="settings-menu__item"
        to="/settings/crm/tags-v2"
        @click="close"
      >
        <Tags :size="18" /><span>Nhãn khách hàng</span>
      </RouterLink>
      <template v-for="sc in eeTopNavShortcuts" :key="sc.to">
        <RouterLink
          v-if="authStore.canAccess(sc.resource)"
          class="settings-menu__item"
          :to="sc.to"
          @click="close"
        >
          <Cog :size="18" /><span>{{ sc.title }}</span>
        </RouterLink>
      </template>
      <div class="settings-menu__divider" />
      <RouterLink class="settings-menu__item" to="/settings" @click="close">
        <Settings :size="18" /><span>Xem tất cả cài đặt</span>
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Dropdown Cài đặt dùng DOM nội tuyến, không teleport overlay ra document.body.
 * Nó dùng chung cho desktop bar và rail dọc.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import {
  ChevronDown,
  Cog,
  Settings,
  ShieldCheck,
  Smartphone,
  Tags,
  UserRound,
  UsersRound,
} from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { eeTopNavShortcuts } from '@ee/nav';

defineProps<{ mode: 'bar' | 'rail' }>();

const open = defineModel<boolean>({ default: false });
const route = useRoute();
const authStore = useAuthStore();
const menuRoot = ref<HTMLElement | null>(null);
const activator = ref<HTMLButtonElement | null>(null);
const isActive = computed(() => route.path === '/settings' || route.path.startsWith('/settings/'));

function close() {
  open.value = false;
}

function toggle() {
  open.value = !open.value;
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!menuRoot.value?.contains(event.target as Node)) close();
}

function onDocumentKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    close();
    void nextTick(() => activator.value?.focus());
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onDocumentPointerDown);
    document.addEventListener('keydown', onDocumentKeyDown);
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown);
    document.removeEventListener('keydown', onDocumentKeyDown);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  document.removeEventListener('keydown', onDocumentKeyDown);
});
</script>

<style scoped>
.settings-menu {
  position: relative;
  display: flex;
  min-width: 0;
}
.settings-menu__panel {
  position: absolute;
  z-index: 2100;
  top: calc(100% + 8px);
  left: 0;
  width: 248px;
  overflow: hidden;
  border: 1px solid var(--app-border-default, #d8dce5);
  border-radius: 7px;
  background: var(--app-surface-panel, #fff);
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.22);
  color: var(--app-text-primary, #252a36);
}
.settings-menu--rail .settings-menu__panel {
  top: auto;
  bottom: 0;
  left: calc(100% + 8px);
}
.settings-menu__heading {
  padding: 13px 16px 7px;
  color: var(--app-text-muted, #697386);
  font-size: 12px;
}
.settings-menu__item {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 42px;
  padding: 0 16px;
  color: inherit;
  font-size: 14px;
  line-height: 1.2;
  text-decoration: none;
}
.settings-menu__item:hover,
.settings-menu__item:focus-visible {
  background: var(--app-surface-hover, #f1f4f8);
  color: var(--app-text-primary, #252a36);
  outline: none;
}
.settings-menu__item :deep(svg) {
  flex: 0 0 auto;
  color: var(--app-text-muted, #697386);
}
.settings-menu__divider {
  height: 1px;
  margin: 4px 0;
  background: var(--app-border-default, #d8dce5);
}

/* nav-tabs normally uses overflow:hidden to keep the header compact. That clips an
   inline dropdown, so only relax it while this panel is present. */
:global(.smax-topnav .nav-tabs:has(.settings-menu__panel)) {
  overflow: visible;
}
</style>
