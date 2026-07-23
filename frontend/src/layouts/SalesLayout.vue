<template>
  <v-app class="sl-app">
    <!-- ════════ TOP HEADER — Glassmorphic Floating Bar ════════ -->
    <header class="sl-topbar">
      <!-- Left: Search -->
      <div class="sl-topbar-search">
        <GlobalSearch />
      </div>

      <!-- Center: Workspace Title -->
      <div class="sl-workspace-title">
        Sales Workspace
      </div>

      <!-- Right: Trailing actions -->
      <div class="sl-topbar-actions">
        <SyncHeaderWidget />
        <NotificationBell />
        <WorkspaceSwitcher v-if="canSwitchWorkspace" />

        <!-- User Avatar + Menu -->
        <v-menu v-model="userMenu" :close-on-content-click="true" location="bottom end">
          <template #activator="{ props: act }">
            <button class="sl-avatar-btn" v-bind="act" :title="authStore.user?.fullName || 'Tài khoản'">
              <span class="sl-avatar-ring">
                <Avatar
                  :src="authStore.user?.avatarUrl"
                  :name="authStore.user?.fullName || 'U'"
                  :size="34"
                  :platform="null"
                />
              </span>
            </button>
          </template>
          <v-list density="compact" min-width="220" rounded="lg">
            <v-list-item
              :title="authStore.user?.fullName || ''"
              :subtitle="authStore.user?.email || authStore.user?.phone || ''"
            />
            <v-divider />
            <v-list-item
              to="/settings/personal/profile"
              title="Hồ sơ của tôi"
              prepend-icon="mdi-account-circle-outline"
            />
            <v-divider />
            <v-list-item
              @click="logout"
              title="Đăng xuất"
              prepend-icon="mdi-logout"
              class="text-error"
            />
          </v-list>
        </v-menu>
      </div>
    </header>

    <!-- Simulation Mode Banner -->
    <div v-if="workspaceStore.isSimulationMode" class="sl-sim-banner">
      <v-icon size="16" class="mr-1">mdi-eye-outline</v-icon>
      <span>Đang xem dưới góc nhìn <strong>{{ workspaceStore.activeConfig.name }}</strong></span>
      <button class="sl-sim-exit" @click="workspaceStore.exitSimulation()">
        <v-icon size="14" class="mr-1">mdi-arrow-left</v-icon>Quay về
      </button>
    </div>

    <!-- ════════ BODY: SideNav + Main Canvas ════════ -->
    <div class="sl-body">
      <!-- SideNavBar — Floating Pill (80px ↔ 256px on hover) -->
      <nav class="sl-sidenav">
        <!-- Brand Lockup -->
        <RouterLink to="/" class="sl-brand" :title="`${brandName} CRM`">
          <div class="sl-brand-icon">
            <img :src="brandLogo" :alt="brandName" class="sl-brand-img" @error="onLogoError" />
          </div>
          <div class="sl-brand-text">
            <span class="sl-brand-name">{{ brandName }}</span>
            <span class="sl-brand-sub">Sales Workspace</span>
          </div>
        </RouterLink>

        <!-- Primary Nav Items -->
        <div class="sl-nav-items">
          <RouterLink
            v-for="tab in visibleTabs"
            :key="tab.key"
            :to="tab.to"
            class="sl-nav-item"
            :class="{ 'sl-nav-item--active': isActive(tab) }"
          >
            <!-- Material Symbol (preferred) or MDI fallback -->
            <span v-if="tab.materialIcon" class="sl-nav-icon material-symbols-outlined">
              {{ tab.materialIcon }}
            </span>
            <v-icon v-else :icon="tab.icon" size="22" class="sl-nav-icon-mdi" />

            <span class="sl-nav-label">{{ tab.title }}</span>

            <!-- Tooltip shown when sidebar is collapsed -->
            <div class="sl-nav-tooltip">{{ tab.title }}</div>
          </RouterLink>
        </div>

        <!-- Footer: Profile & Logout -->
        <div class="sl-nav-footer">
          <RouterLink
            to="/settings/personal/profile"
            class="sl-nav-item"
            :class="{ 'sl-nav-item--active': isSettingsActive }"
          >
            <span class="sl-nav-icon material-symbols-outlined">manage_accounts</span>
            <span class="sl-nav-label">Hồ sơ</span>
            <div class="sl-nav-tooltip">Hồ sơ cá nhân</div>
          </RouterLink>

          <button class="sl-nav-item sl-nav-logout" @click="logout">
            <span class="sl-nav-icon material-symbols-outlined">logout</span>
            <span class="sl-nav-label">Đăng xuất</span>
            <div class="sl-nav-tooltip">Đăng xuất</div>
          </button>
        </div>
      </nav>

      <!-- Backdrop overlay when sidebar is expanded -->
      <div class="sl-sidebar-backdrop"></div>

      <!-- Main Glass Canvas -->
      <main class="sl-main">
        <slot />
      </main>
    </div>

    <!-- Global Toast Container -->
    <ToastContainer />
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { useTheme } from 'vuetify';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useWorkspaceStore } from '@/workspaces/resolver';
import type { MenuItemConfig } from '@/workspaces/types';
import NotificationBell from '@/components/NotificationBell.vue';
import GlobalSearch from '@/components/GlobalSearch.vue';
import SyncHeaderWidget from '@/components/SyncHeaderWidget.vue';
import ToastContainer from '@/components/ui/ToastContainer.vue';
import Avatar from '@/components/ui/Avatar.vue';
import WorkspaceSwitcher from '@/components/workspace/WorkspaceSwitcher.vue';
import { fetchPublicBranding } from '@/api/public-branding';
import '@/assets/sales-theme.css';

const theme = useTheme();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const workspaceStore = useWorkspaceStore();

const userMenu = ref(false);

// Sweep stuck overlays — đồng bộ logic từ DefaultLayout.vue
function sweepStuckOverlays() {
  try {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  } catch { /* no-op */ }
  void nextTick(() => {
    try {
      document
        .querySelectorAll('.v-overlay-container > .v-overlay.v-overlay--active')
        .forEach((el) => el.remove());
    } catch { /* race với Vuetify — bỏ qua */ }
  });
}

function cleanupAfterNav() {
  userMenu.value = false;
  sweepStuckOverlays();
}
router.afterEach(() => cleanupAfterNav());
router.onError(() => cleanupAfterNav());

// ── Brand lockup ──────────────────────────────────────────────────────────────
const DEFAULT_LOGO = '/brand/hs-monogram.png';
const brandLogo = ref(DEFAULT_LOGO);
const brandName = ref('Hi-CRM');
function onLogoError() {
  if (brandLogo.value !== DEFAULT_LOGO) brandLogo.value = DEFAULT_LOGO;
}

onMounted(() => {
  theme.global.name.value = 'hsLight';
  localStorage.setItem('theme', 'hsLight');

  // Inject Material Symbols Outlined + Outfit fonts only if not already loaded
  if (!document.getElementById('sl-google-fonts')) {
    const link = document.createElement('link');
    link.id = 'sl-google-fonts';
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap';
    document.head.appendChild(link);
  }

  fetchPublicBranding()
    .then((b) => {
      if (!b) return;
      brandLogo.value = b.logoUrl || DEFAULT_LOGO;
      brandName.value = b.name || 'Hi-CRM';
    })
    .catch(() => {});
});

// ── Menu filtering (RBAC) ─────────────────────────────────────────────────────
const visibleTabs = computed(() => {
  return workspaceStore.activeConfig.menu.filter((item) => {
    if (item.resource && !authStore.canAccess(item.resource, item.action ?? 'access')) {
      return false;
    }
    return true;
  });
});

function isActive(tab: MenuItemConfig): boolean {
  if (tab.matchPrefix === '/$') return route.path === '/';
  if (tab.matchPrefix) {
    return route.path === tab.matchPrefix || route.path.startsWith(tab.matchPrefix + '/');
  }
  return route.path === tab.to || route.path.startsWith(tab.to + '/');
}

const isSettingsActive = computed(() =>
  route.path === '/settings' || route.path.startsWith('/settings/'),
);

// ── Workspace switching ───────────────────────────────────────────────────────
// Sales workspace bị khóa cứng — không bao giờ được switch.
// Dùng workspace ID thay vì role string để tránh edge case (deptRole, canViewAll...).
const canSwitchWorkspace = computed(() => workspaceStore.activeWorkspaceId !== 'sales');

// ── Logout ────────────────────────────────────────────────────────────────────
function logout() {
  authStore.logout();
  router.push('/login');
}
</script>

<style scoped>
/* ══════════════════════════════════════════════════════════
   Sales Layout — Pure CSS (no Tailwind)
   Glassmorphic Neo-SaaS — Zalo Blue #0068FF
   ══════════════════════════════════════════════════════════ */

/* Root app container — Cool Slate Canvas (Option 1) */
.sl-app {
  background: linear-gradient(135deg, #E2E9F3 0%, #EEF3F9 100%) !important;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* ── TOP BAR ────────────────────────────────────────────── */
.sl-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  padding: 0 20px;
  margin: 12px 16px 0;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.65);
  box-shadow: 0 4px 20px 0 rgba(0, 50, 150, 0.08);
  flex-shrink: 0;
  gap: 12px;
  position: relative;
  z-index: 50;
}

.sl-topbar-search {
  width: 260px;
  flex-shrink: 0;
}

/* GlobalSearch overrides inside rounded top bar */
.sl-topbar-search :deep(.v-field) {
  border-radius: 9999px !important;
  background: rgba(255, 255, 255, 0.6) !important;
  box-shadow: none !important;
  border: 1px solid rgba(0, 0, 0, 0.08) !important;
}

/* Workspace Title center block */
.sl-workspace-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 15px;
  font-weight: 700;
  color: #0068FF;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: linear-gradient(135deg, #0068FF 0%, #0046b8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  font-family: 'Outfit', sans-serif;
}

@media (max-width: 768px) {
  .sl-workspace-title { display: none; }
}

/* Trailing actions (right side of topbar) */
.sl-topbar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* User avatar button */
.sl-avatar-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  margin-left: 4px;
}

.sl-avatar-ring {
  display: inline-flex;
  padding: 2px;
  border-radius: 50%;
  background: linear-gradient(45deg, #ff9a9e, #fecfef, #a1c4fd);
}

/* ── SIMULATION BANNER ──────────────────────────────────── */
.sl-sim-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 20px;
  margin: 8px 16px 0;
  background: linear-gradient(90deg, #ede9fe 0%, #ddd6fe 100%);
  border: 1px solid #c4b5fd;
  border-radius: 10px;
  color: #5b21b6;
  font-size: 13px;
  font-weight: 500;
  flex-shrink: 0;
}

.sl-sim-exit {
  display: inline-flex;
  align-items: center;
  margin-left: auto;
  background: #7c3aed;
  color: white;
  border: none;
  border-radius: 7px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  gap: 4px;
}

.sl-sim-exit:hover { background: #6d28d9; }

/* ══ BODY (sidenav + main) ════════════════════════ */
.sl-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  padding: 12px 16px 16px;
  min-height: 0;
  position: relative;
}

/* ══ SIDE NAVBAR — Smooth Pseudo-element Slide Overlay ══════════════════════
   2026-07-22: Tối ưu UX loại bỏ giật lag chuyển động biên trái.
   Gốc tọa độ vật lý của cha luôn cố định ở left: 0; top: 0; bottom: 0.
   Hiệu ứng hình ảnh (glass background, border, shadow) được vẽ trên ::before.
   Khi hover, lớp nền ::before tự động trượt mượt mà sát biên trái (left:0, top:0, bottom:0)
   và đổi border-radius bên trái thành 0. Icon dịch nhẹ nhàng nhờ transition padding-left. */
.sl-sidenav {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 92px; /* 16px khoảng trống lề + 76px rộng sidebar collapsed */
  display: flex;
  flex-direction: column;
  padding: 20px 10px 20px 26px; /* padding-left 26px (16px offset + 10px padding nội bộ) */
  flex-shrink: 0;
  overflow: hidden;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  z-index: 40;
  transition: width 380ms cubic-bezier(0.2, 0.8, 0.2, 1),
              padding-left 380ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.sl-sidenav::before {
  content: '';
  position: absolute;
  left: 16px;
  top: 12px;
  bottom: 16px;
  right: 0;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 4px 20px 0 rgba(31, 38, 135, 0.06);
  border-radius: 28px;
  z-index: -1;
  transition: left 380ms cubic-bezier(0.2, 0.8, 0.2, 1),
              top 380ms cubic-bezier(0.2, 0.8, 0.2, 1),
              bottom 380ms cubic-bezier(0.2, 0.8, 0.2, 1),
              border-radius 380ms cubic-bezier(0.2, 0.8, 0.2, 1),
              box-shadow 380ms cubic-bezier(0.2, 0.8, 0.2, 1),
              border-color 380ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.sl-sidenav:hover {
  width: 252px;
  padding-left: 10px; /* padding-left co về 10px khi expand sát lề */
}

.sl-sidenav:hover::before {
  left: 0;
  top: 12px; /* Giữ nguyên 12px để không bị dính vào bo tròn của Header */
  bottom: 16px; /* Giữ nguyên 16px */
  border-radius: 0 28px 28px 0;
  border-left-color: transparent; /* ẩn border bên trái khi chạm viền */
  box-shadow:
    0 8px 40px 0 rgba(0, 104, 255, 0.16),
    0 2px 8px 0 rgba(0, 0, 0, 0.08);
  /* 2026-07-22: Hủy hoạt ảnh của left khi hover để biên trái chạm lề ngay lập tức,
     giúp sidebar bung rộng thuần túy từ trái sang phải. Khi đóng (unhover) vẫn trượt về 16px mượt mà. */
  transition: left 0s,
              top 380ms cubic-bezier(0.2, 0.8, 0.2, 1),
              bottom 380ms cubic-bezier(0.2, 0.8, 0.2, 1),
              border-radius 380ms cubic-bezier(0.2, 0.8, 0.2, 1),
              box-shadow 380ms cubic-bezier(0.2, 0.8, 0.2, 1),
              border-color 380ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* Backdrop overlay khi sidebar mở rộng */
.sl-sidebar-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 380ms cubic-bezier(0.2, 0.8, 0.2, 1);
  z-index: 35; /* Dưới topbar (50) và sidebar (40) nhưng trên toàn bộ main và các vùng trống */
}

/* Hiện backdrop mờ khi hover sidebar */
.sl-sidenav:hover + .sl-sidebar-backdrop {
  opacity: 1;
  pointer-events: auto;
}

/* Brand lockup inside nav */
.sl-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 8px 20px;
  text-decoration: none;
  overflow: hidden;
  white-space: nowrap;
  flex-shrink: 0;
}

.sl-brand-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, #0068FF 0%, #0046b8 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 104, 255, 0.3);
  border: 1px solid rgba(255,255,255,0.2);
}

.sl-brand-img {
  width: 24px;
  height: auto;
  display: block;
}

.sl-brand-text {
  display: flex;
  flex-direction: column;
  opacity: 0;
  transition: opacity 280ms ease 120ms;
  min-width: 0;
}

.sl-sidenav:hover .sl-brand-text {
  opacity: 1;
}

.sl-brand-name {
  font-size: 16px;
  font-weight: 800;
  color: #141a24;
  line-height: 1.15;
  letter-spacing: 0.01em;
}

.sl-brand-sub {
  font-size: 10px;
  font-weight: 700;
  color: #0068FF;
  text-transform: uppercase;
  letter-spacing: 0.2em;
}

/* Nav items list area */
.sl-nav-items {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  overflow-x: hidden;
}

.sl-nav-items::-webkit-scrollbar { width: 0; }

/* Individual nav item */
.sl-nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 11px 10px;
  border-radius: 14px;
  text-decoration: none;
  color: #505f76;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  transition: background 0.15s ease, color 0.15s ease;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  width: 100%;
}

.sl-nav-item:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #141a24;
}

/* Active state */
.sl-nav-item--active {
  background: #ffffff;
  color: #0068FF;
  font-weight: 700;
  box-shadow: 0 1px 6px rgba(0,0,0,0.08);
  border: 1px solid rgba(0,0,0,0.07);
}

.sl-nav-item--active:hover {
  background: #ffffff;
}

/* Icon (Material Symbols) */
.sl-nav-icon {
  font-size: 22px;
  flex-shrink: 0;
  line-height: 1;
  display: block;
  /* Material Symbols outlined weight */
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  transition: font-variation-settings 0.15s ease;
}

.sl-nav-item--active .sl-nav-icon {
  font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24;
}

/* MDI fallback icon */
.sl-nav-icon-mdi {
  flex-shrink: 0;
}

/* Tab label — hidden when sidebar collapsed, shows on expand */
.sl-nav-label {
  opacity: 0;
  transition: opacity 260ms ease 80ms;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sl-sidenav:hover .sl-nav-label {
  opacity: 1;
}

/* Tooltip — shown when sidebar is collapsed (not hovered) */
.sl-nav-tooltip {
  position: absolute;
  left: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%);
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: #141a24;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 10px;
  white-space: nowrap;
  pointer-events: none;
  visibility: hidden;
  opacity: 0;
  transition: opacity 0.15s ease;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  border: 1px solid rgba(0,0,0,0.07);
  z-index: 200;
}

/* Show tooltip ONLY when sidebar is NOT expanded (not :hover on nav) */
.sl-sidenav:not(:hover) .sl-nav-item:hover .sl-nav-tooltip {
  visibility: visible;
  opacity: 1;
}

/* Nav footer — profile & logout */
.sl-nav-footer {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 12px;
  border-top: 1px solid rgba(0,0,0,0.07);
  flex-shrink: 0;
}

/* Logout button */
.sl-nav-logout {
  color: #dc2626;
}

.sl-nav-logout:hover {
  background: rgba(220, 38, 38, 0.06);
  color: #dc2626;
}

/* ══ MAIN CANVAS ═══════════───────────────────── */
.sl-main {
  /* 2026-07-22: margin-left cố định thay thế gap flex
     = 16px (sidebar left) + 76px (sidebar width) + 12px (khoảng cách thẩm thực)
     Sidebar expand không đẩy vùng này nữa — Layout Shift đã được giải quyết. */
  margin-left: 104px;
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  position: relative;
}

/* Vuetify main area reset */
:deep(.v-main) {
  padding: 0 !important;
}

/* Fix overlay menu surfaces in light glass context */
:deep(.v-overlay__content > .v-list) {
  background: #ffffff;
  color: #141a24;
}
</style>
