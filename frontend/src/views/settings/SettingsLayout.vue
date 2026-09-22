<template>
  <div class="settings-layout" :class="{ 'nav-open': mobileNavOpen }">
    <!-- Sidebar -->
    <aside class="sl-sidebar" aria-label="Danh mục cài đặt">
      <header class="sl-header">
        <RouterLink to="/settings" class="sl-title">
          <v-icon class="sl-icon" icon="mdi-tune-variant" size="18" />
          <span>Cài đặt</span>
        </RouterLink>
        <button
          type="button"
          class="sl-nav-toggle"
          :aria-expanded="mobileNavOpen"
          aria-controls="settings-nav"
          @click="mobileNavOpen = !mobileNavOpen"
        >
          <v-icon :icon="mobileNavOpen ? 'mdi-close' : 'mdi-menu'" size="18" />
          <span>Danh mục</span>
        </button>
      </header>

      <div class="sl-search">
        <v-icon class="ic" icon="mdi-magnify" size="16" />
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Tìm cài đặt..."
          aria-label="Tìm cài đặt"
        />
        <button v-if="searchQuery" type="button" class="sl-search-clear" @click="searchQuery = ''" aria-label="Xoá tìm kiếm">
          <v-icon icon="mdi-close-circle" size="15" />
        </button>
      </div>

      <nav id="settings-nav" class="sl-nav" :aria-label="searchQuery ? 'Kết quả tìm kiếm' : 'Cài đặt'">
        <RouterLink
          to="/settings"
          class="sl-item sl-item-overview"
          :class="{ active: isOverview }"
          @click="closeMobileNav"
        >
          <v-icon class="sl-item-icon" icon="mdi-view-grid-outline" size="18" />
          <span class="sl-item-label">Tổng quan</span>
        </RouterLink>

        <!-- Search results -->
        <div v-if="searchQuery" class="sl-search-results">
          <div v-if="searchResults.length === 0" class="sl-empty">
            Không tìm thấy "{{ searchQuery }}"
          </div>
          <RouterLink
            v-for="item in searchResults"
            :key="`sr-${item.route}`"
            :to="item.route"
            class="sl-item"
            :class="{ active: isItemActive(item.route) }"
            @click="closeMobileNav"
          >
            <v-icon class="sl-item-icon" :icon="item.icon" size="18" />
            <span class="sl-item-label">{{ item.label }}</span>
            <v-icon v-if="item.comingSoon" class="sl-lock" icon="mdi-lock-outline" size="14" />
          </RouterLink>
        </div>

        <!-- Grouped nav -->
        <div v-else>
          <div v-for="group in visibleGroups" :key="group.id" class="sl-group">
            <button
              type="button"
              class="sl-group-header"
              :class="{ collapsed: !openGroups[group.id] }"
              :aria-expanded="!!openGroups[group.id]"
              @click="toggleGroup(group.id)"
            >
              <v-icon class="sl-group-icon" :icon="group.icon" size="16" />
              <span class="sl-group-label">{{ group.label }}</span>
              <v-icon class="sl-chevron" icon="mdi-chevron-down" size="16" />
            </button>
            <div v-if="openGroups[group.id]" class="sl-group-body">
              <RouterLink
                v-for="item in group.items"
                :key="item.route"
                :to="item.route"
                class="sl-item"
                :class="{ active: isItemActive(item.route) }"
                @click="closeMobileNav"
              >
                <v-icon class="sl-item-icon" :icon="item.icon" size="18" />
                <span class="sl-item-label">{{ item.label }}</span>
                <v-icon v-if="item.comingSoon" class="sl-lock" icon="mdi-lock-outline" size="14" />
              </RouterLink>
            </div>
          </div>
        </div>
      </nav>
    </aside>

    <!-- Content panel -->
    <main class="sl-content" role="main">
      <header class="sl-topbar">
        <nav class="sl-breadcrumb" aria-label="Breadcrumb">
          <RouterLink to="/settings" class="bc-root">Cài đặt</RouterLink>
          <template v-if="activeItem">
            <v-icon class="bc-sep" icon="mdi-chevron-right" size="15" />
            <span class="bc-group">{{ activeItem.group.label }}</span>
            <v-icon class="bc-sep" icon="mdi-chevron-right" size="15" />
            <span class="bc-current">{{ activeItem.item.label }}</span>
          </template>
          <template v-else-if="isOverview">
            <v-icon class="bc-sep" icon="mdi-chevron-right" size="15" />
            <span class="bc-current">Tổng quan</span>
          </template>
        </nav>
        <RouterLink v-if="!isOverview" to="/settings" class="sl-back">
          <v-icon icon="mdi-arrow-left" size="15" />
          <span>Tổng quan</span>
        </RouterLink>
      </header>
      <div class="sl-content-body">
        <RouterView />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useSettingsNav } from '@/composables/use-settings-nav';

const route = useRoute();
const { visibleGroups, activeItem, searchItems } = useSettingsNav();

/** /settings (không có sub-route) → trang tổng quan. */
const isOverview = computed(() => route.path === '/settings' || route.path === '/settings/');

// Active class check — support query param (vd /settings/channels/zalo?tab=internal-contact
// active KHÁC /settings/channels/zalo plain — 2 entry trỏ cùng path nhưng tab khác).
function isItemActive(itemRoute: string): boolean {
  const [itemPath, itemQuery] = itemRoute.split('?');
  if (itemPath !== route.path) return false;
  if (!itemQuery) {
    // Item không query → active chỉ khi current cũng không match query của entry khác
    const currentTab = route.query.tab as string | undefined;
    return !currentTab;
  }
  const expected = new URLSearchParams(itemQuery).get('tab');
  return expected === (route.query.tab as string | undefined);
}

const searchQuery = ref('');
/** Sidebar dạng drawer ở khổ hẹp — mặc định đóng để nội dung lên trước. */
const mobileNavOpen = ref(false);
function closeMobileNav() {
  mobileNavOpen.value = false;
}

// Group collapsed state — persist in localStorage
const SECTION_KEY_PREFIX = 'settings-nav.group.';
function loadGroupState(): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const g of visibleGroups.value) {
    const raw = localStorage.getItem(SECTION_KEY_PREFIX + g.id);
    // Default open = true, except 'dev' which defaults closed for cleaner first impression
    const defaultOpen = g.id !== 'dev';
    result[g.id] = raw === null ? defaultOpen : raw === '1';
  }
  return result;
}
const openGroups = reactive<Record<string, boolean>>(loadGroupState());

function toggleGroup(id: string) {
  openGroups[id] = !openGroups[id];
  localStorage.setItem(SECTION_KEY_PREFIX + id, openGroups[id] ? '1' : '0');
}

// Auto-open group of active item
watch(activeItem, (info) => {
  if (info) openGroups[info.group.id] = true;
}, { immediate: true });

// Re-init openGroups when visibleGroups changes (e.g., role loads after login)
watch(visibleGroups, (groups) => {
  for (const g of groups) {
    if (!(g.id in openGroups)) {
      const raw = localStorage.getItem(SECTION_KEY_PREFIX + g.id);
      const defaultOpen = g.id !== 'dev';
      openGroups[g.id] = raw === null ? defaultOpen : raw === '1';
    }
  }
});

const searchResults = computed(() => searchItems(searchQuery.value));

// Đổi trang → đóng drawer để không che nội dung vừa mở.
watch(() => route.fullPath, closeMobileNav);
</script>

<style scoped>
.settings-layout {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  height: calc(100vh - var(--smax-topnav-h));
  background: var(--app-surface-canvas);
  color: var(--app-text-primary);
  font-family: inherit;
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
}

/* ── Sidebar ─────────────────────────────────────────────────────────── */
.sl-sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: var(--app-surface-panel);
  border-right: 1px solid var(--app-border-subtle);
}
.sl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 56px;
  padding: 0 14px 0 16px;
  border-bottom: 1px solid var(--app-border-subtle);
}
.sl-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--app-text-primary);
  font-size: 15px;
  font-weight: 750;
  letter-spacing: -0.01em;
  text-decoration: none;
}
.sl-icon { color: var(--app-accent); }
.sl-nav-toggle { display: none; }

.sl-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 12px 8px;
  height: 34px;
  padding: 0 9px;
  border: 1px solid var(--app-border-subtle);
  border-radius: var(--app-radius-md);
  background: var(--app-surface-sunken);
}
.sl-search:focus-within {
  border-color: var(--app-border-focus);
  background: var(--app-surface-panel);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-accent) 12%, transparent);
}
.sl-search .ic { flex: 0 0 auto; color: var(--app-text-muted); }
.sl-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--app-text-primary);
  font: inherit;
  font-size: 12.5px;
}
.sl-search input::placeholder { color: var(--app-text-muted); }
.sl-search-clear {
  display: inline-grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--app-text-muted);
  cursor: pointer;
}
.sl-search-clear:hover { color: var(--app-danger); background: color-mix(in srgb, var(--app-danger) 9%, transparent); }

.sl-nav {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 3px 8px 18px;
}
.sl-nav::-webkit-scrollbar { width: 5px; }
.sl-nav::-webkit-scrollbar-thumb { background: var(--app-border-default); border-radius: 4px; }
.sl-group { margin-top: 10px; }
.sl-group-header {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 7px;
  min-height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-text-secondary);
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.sl-group-header:hover { background: var(--app-surface-hover); }
.sl-group-icon { color: var(--app-text-muted); }
.sl-group-label {
  flex: 1;
  font-size: 10.5px;
  font-weight: 750;
  letter-spacing: 0.055em;
  text-transform: uppercase;
}
.sl-chevron { color: var(--app-text-muted); transition: transform 0.15s ease; }
.sl-group-header.collapsed .sl-chevron { transform: rotate(-90deg); }
.sl-group-body, .sl-search-results { display: grid; gap: 1px; margin-top: 2px; }
.sl-item {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 34px;
  padding: 0 9px;
  border-radius: var(--app-radius-sm);
  color: var(--app-text-secondary);
  font-size: 12.5px;
  font-weight: 500;
  text-decoration: none;
  transition: background-color 0.12s ease, color 0.12s ease;
}
.sl-item:hover { background: var(--app-surface-hover); color: var(--app-text-primary); }
.sl-item.active, .sl-item.router-link-exact-active {
  background: var(--app-accent-soft);
  color: var(--app-accent);
  font-weight: 650;
}
.sl-item-overview { margin: 2px 0 0; }
.sl-item-icon { flex: 0 0 auto; }
.sl-item-label { overflow: hidden; flex: 1; text-overflow: ellipsis; white-space: nowrap; }
.sl-lock { flex: 0 0 auto; opacity: 0.65; }
.sl-empty { padding: 24px 12px; color: var(--app-text-muted); font-size: 12px; text-align: center; }

/* ── Main chrome ─────────────────────────────────────────────────────── */
.sl-content { display: flex; min-width: 0; min-height: 0; flex-direction: column; overflow: hidden; }
.sl-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 56px;
  gap: 16px;
  padding: 0 28px;
  border-bottom: 1px solid var(--app-border-subtle);
  background: var(--app-surface-panel);
}
.sl-breadcrumb { display: flex; min-width: 0; align-items: center; gap: 5px; color: var(--app-text-secondary); font-size: 12px; }
.bc-root { color: var(--app-text-secondary); font-weight: 550; text-decoration: none; }
.bc-root:hover { color: var(--app-accent); }
.bc-sep { flex: 0 0 auto; color: var(--app-text-muted); }
.bc-group { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bc-current { overflow: hidden; color: var(--app-text-primary); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.sl-back {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 5px;
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
}
.sl-back:hover { color: var(--app-accent); }
.sl-content-body { flex: 1; min-height: 0; overflow: auto; padding: 26px 32px 36px; }
.sl-content-body::-webkit-scrollbar { width: 8px; }
.sl-content-body::-webkit-scrollbar-thumb { background: var(--app-border-default); border-radius: 4px; }

@media (max-width: 1100px) {
  .settings-layout { grid-template-columns: 216px minmax(0, 1fr); }
  .sl-content-body { padding: 22px 24px 32px; }
  .sl-topbar { padding: 0 24px; }
}

@media (max-width: 820px) {
  .settings-layout { display: block; height: auto; min-height: calc(100vh - var(--smax-topnav-h)); }
  .sl-sidebar { position: relative; overflow: visible; border-right: 0; border-bottom: 1px solid var(--app-border-subtle); }
  .sl-header { min-height: 50px; }
  .sl-nav-toggle {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 0 8px;
    border: 1px solid var(--app-border-default);
    border-radius: var(--app-radius-sm);
    background: var(--app-surface-panel);
    color: var(--app-text-secondary);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
  }
  .sl-search, .sl-nav { display: none; }
  .settings-layout.nav-open .sl-search { display: flex; }
  .settings-layout.nav-open .sl-nav {
    display: block;
    max-height: min(58vh, 440px);
    border-top: 1px solid var(--app-border-subtle);
  }
  .sl-content { min-height: calc(100vh - var(--smax-topnav-h) - 51px); }
  .sl-topbar { min-height: 48px; padding: 0 16px; }
  .sl-content-body { overflow: visible; padding: 20px 16px 30px; }
}

@media (max-width: 460px) {
  .sl-back span, .bc-group { display: none; }
  .sl-topbar { gap: 8px; }
}
</style>
