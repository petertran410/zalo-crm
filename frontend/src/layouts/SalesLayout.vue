<template>
  <v-app class="sl-app" :class="workspaceStore.activeConfig.themeClass">


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
      <!-- SideNavBar — Floating Pill (Click to toggle expand/collapse) -->
      <nav
        class="sl-sidenav"
        :class="{ 'sl-sidenav--expanded': isSidebarExpanded }"
        @click="onSidebarClick"
      >
        <!-- Primary Nav Items -->
        <div class="sl-nav-items">
          <RouterLink
            v-for="tab in visibleTabs"
            :key="tab.key"
            :to="tab.to"
            class="sl-nav-item"
            :class="{ 'sl-nav-item--active': isActive(tab) }"
            @click="onNavItemClick"
          >
            <!-- Material Symbol (preferred) or MDI fallback inside icon wrapper -->
            <div class="sl-nav-icon-wrap">
              <span v-if="tab.materialIcon" class="sl-nav-icon material-symbols-outlined">
                {{ tab.materialIcon }}
              </span>
              <v-icon v-else :icon="tab.icon" size="22" class="sl-nav-icon-mdi" />
            </div>

            <span class="sl-nav-label">{{ tab.title }}</span>

            <!-- Tooltip shown when sidebar is collapsed -->
            <div class="sl-nav-tooltip">{{ tab.title }}</div>
          </RouterLink>
        </div>

        <!-- Footer: POS Sync + Avatar Profile Menu -->
        <div class="sl-nav-footer">
          <!-- POS Sync Widget (Admin only) -->
          <div v-if="authStore.isAdmin" class="sl-nav-sync-wrap" title="Trung tâm đồng bộ POS">
            <SyncHeaderWidget />
          </div>

          <WorkspaceSwitcher v-if="canSwitchWorkspace" />

          <!-- User Avatar + Menu (Profile & Logout) — Inline Panel tránh VOverlay trắng màn hình -->
          <div ref="userMenuRef" class="sl-nav-user-wrap">
            <button
              class="sl-nav-item sl-nav-user-btn"
              :title="authStore.user?.fullName || 'Tài khoản'"
              @click.stop="toggleUserMenu"
            >
              <div class="sl-nav-icon-wrap">
                <span class="sl-avatar-ring">
                  <Avatar
                    :src="authStore.user?.avatarUrl"
                    :name="authStore.user?.fullName || 'U'"
                    :size="30"
                    :platform="null"
                  />
                </span>
              </div>
              <span class="sl-nav-label sl-user-name-label">
                {{ authStore.user?.fullName || 'Tài khoản' }}
              </span>
              <div v-if="!userMenuOpen" class="sl-nav-tooltip">{{ authStore.user?.fullName || 'Tài khoản' }}</div>
            </button>

            <!-- Inline Profile Popup — Không dùng v-menu/VOverlay tránh trắng màn hình -->
            <div
              v-if="userMenuOpen"
              class="sl-user-menu-panel"
              @click.stop
            >
              <div class="sl-user-menu-header">
                <Avatar
                  :src="authStore.user?.avatarUrl"
                  :name="authStore.user?.fullName || 'U'"
                  :size="34"
                  :platform="null"
                />
                <div class="sl-user-menu-info">
                  <div class="sl-user-menu-name">{{ authStore.user?.fullName || '' }}</div>
                  <div class="sl-user-menu-sub">{{ authStore.user?.email || authStore.user?.phone || '' }}</div>
                </div>
              </div>

              <div class="sl-user-menu-divider" />

              <RouterLink
                to="/settings/personal/profile"
                class="sl-user-menu-item"
                @click="userMenuOpen = false"
              >
                <span class="material-symbols-outlined sl-menu-icon">account_circle</span>
                <span>Hồ sơ của tôi</span>
              </RouterLink>

              <div class="sl-user-menu-divider" />

              <button
                class="sl-user-menu-item text-error"
                @click="logout"
              >
                <span class="material-symbols-outlined sl-menu-icon">logout</span>
                <span>Đăng xuất</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <!-- Backdrop overlay when sidebar is expanded -->
      <div
        class="sl-sidebar-backdrop"
        :class="{ 'sl-sidebar-backdrop--visible': isSidebarExpanded }"
        @click="closeSidebar"
      ></div>

      <!-- Main Glass Canvas -->
      <main class="sl-main">
        <slot />
      </main>
    </div>

    <!-- Global Toast Container -->
    <ToastContainer />

    <!-- ════ ORDER DRAFT SYSTEM (Global) ════ -->
    <OrderDraftTaskbar />
    <OrderBuilderWorkspace
      v-if="orderDraftStore.openFullDraft"
      :draft-id="orderDraftStore.openFullDraft.id"
    />
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { useTheme } from 'vuetify';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useWorkspaceStore } from '@/workspaces/resolver';
import type { MenuItemConfig } from '@/workspaces/types';

import SyncHeaderWidget from '@/components/SyncHeaderWidget.vue';
import ToastContainer from '@/components/ui/ToastContainer.vue';
import Avatar from '@/components/ui/Avatar.vue';
import WorkspaceSwitcher from '@/components/workspace/WorkspaceSwitcher.vue';
import OrderDraftTaskbar from '@/components/order-builder/workspace/OrderDraftTaskbar.vue';
import OrderBuilderWorkspace from '@/components/order-builder/workspace/OrderBuilderWorkspace.vue';
import { useOrderDraftStore } from '@/stores/use-workspace-sessions';
import '@/assets/sales-theme.css';

const orderDraftStore = useOrderDraftStore();

const theme = useTheme();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const workspaceStore = useWorkspaceStore();

const userMenuOpen = ref(false);
const userMenuRef = ref<HTMLElement | null>(null);
const isSidebarExpanded = ref(false);

function toggleUserMenu() {
  userMenuOpen.value = !userMenuOpen.value;
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!userMenuRef.value?.contains(event.target as Node)) {
    userMenuOpen.value = false;
  }
}

watch(userMenuOpen, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onDocumentPointerDown);
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
});



function onSidebarClick(event: MouseEvent) {
  const target = event.target as HTMLElement;
  const isNavItem = !!target.closest('.sl-nav-item');

  if (!isSidebarExpanded.value) {
    if (isNavItem) {
      // Nav item khi thu gọn: để RouterLink navigate ngay, đóng sidebar sau khi xong
      // KHÔNG chặn event — navigation xảy ra tức thì không giật
      isSidebarExpanded.value = false;
      return;
    }
    // Click vào nền sidebar (không phải nav item) → mở rộng
    event.preventDefault();
    event.stopPropagation();
    isSidebarExpanded.value = true;
    return;
  }

  // Sidebar đang mở: click ngoài nav item → đóng
  if (!isNavItem) {
    isSidebarExpanded.value = false;
  }
}

function onNavItemClick() {
  // Đóng sidebar sau mỗi lần chọn tab (cả mở lẫn đóng)
  isSidebarExpanded.value = false;
}


function closeSidebar() {
  isSidebarExpanded.value = false;
}

function handleLogout() {
  closeSidebar();
  logout();
}

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
  userMenuOpen.value = false;
  isSidebarExpanded.value = false;
  sweepStuckOverlays();
}
router.afterEach(() => cleanupAfterNav());
router.onError(() => cleanupAfterNav());

onMounted(() => {
  theme.change('hsLight');

  // Khôi phục các đơn nháp từ localStorage
  orderDraftStore.hydrate();

  // Inject Material Symbols Outlined + Outfit fonts only if not already loaded
  if (!document.getElementById('sl-google-fonts')) {
    const link = document.createElement('link');
    link.id = 'sl-google-fonts';
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap';
    document.head.appendChild(link);
  }

  // ── Fix 2: Prefetch tất cả chunk JS của các tab trong Sales sidebar ─────────
  // Chạy trong idle time → không ảnh hưởng render đầu tiên.
  // Lần đầu click vào bất kỳ tab nào sẽ load tức thì thay vì chờ download.
  const saleSidebarPrefetch = [
    () => import('@/views/AppointmentsView.vue'),
    // 2026-07-31: ContactsView + FriendsView đã gộp thành PeopleView (commit
    // 3a424b9) và bị xoá. Đây KHÔNG phải rename — git không nối 2 file, nên
    // merge từ nhánh cũ mang lại 2 dòng import này và làm vite build chết
    // (UNLOADABLE_DEPENDENCY). Cả 2 tab giờ đều là /contacts → 1 dòng là đủ.
    () => import('@/views/PeopleView.vue'),
    () => import('@/views/MediaView.vue'),
    // POS module — lazy load theo sub-route
    () => import('@/views/pos/PosCustomersView.vue'),
    () => import('@/views/pos/PosProductsView.vue'),
  ];

  const runPrefetch = () => saleSidebarPrefetch.forEach((fn) => fn().catch(() => {}));

  if ('requestIdleCallback' in window) {
    // Đợi browser rảnh (sau khi paint xong) mới prefetch
    (window as Window & typeof globalThis & { requestIdleCallback: (cb: () => void, opts?: object) => void })
      .requestIdleCallback(runPrefetch, { timeout: 3000 });
  } else {
    // Safari fallback — đợi 2s sau khi layout render xong
    setTimeout(runPrefetch, 2000);
  }
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
  /* GHIM 48px = đúng giá trị SalesLayout đang thừa hưởng từ :root hôm nay, nên
     render KHÔNG đổi. Mục đích là chặn override 48↔44 của DefaultLayout (revamp
     nav 2026-08-05) rò sang đây — chrome hai shell khác hẳn nhau.
     ⚠️ Nợ kỹ thuật có sẵn: chrome thật của shell này là topbar 60px + margin 12px
     + padding body 12px, lại còn zoom .85 — tức 48px vốn đã SAI sẵn với các màn
     dùng chung (ChatView, PeopleView, AppointmentsView, MediaView). Sửa cho đúng
     sẽ làm đổi giao diện Sales nên tách thành quyết định riêng, không gộp vào đây. */
  --smax-topnav-h: 48px;
  /* GHIM accent teal cũ. Bảng màu nav đổi sang indigo #635BFF ở hs-crm-theme.css
     (revamp 2026-08-05) nhưng phạm vi chốt là CHỈ DefaultLayout — vỏ Sales giữ
     nguyên tông xanh Zalo. Widget dùng chung (SyncHeaderWidget) đọc biến này nên
     ghim ở đây là đủ để Sales không đổi một pixel nào. */
  --nav-accent: #5bb8e5;
  background: linear-gradient(135deg, #E2E9F3 0%, #EEF3F9 100%) !important;
  display: flex;
  flex-direction: column;
  height: 100dvh;
  width: 100vw;
  overflow: hidden;
}

/* ── NAV FOOTER ACTIONS (Sync & User Profile) ───────────── */
.sl-nav-sync-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin: 0 auto;
}

.sl-nav-sync-wrap :deep(.sync-trigger-btn) {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.sl-nav-sync-wrap :deep(.sync-trigger-btn:hover) {
  background: rgba(0, 104, 255, 0.08);
  color: #0068FF;
}

.sl-nav-sync-wrap :deep(.sync-center-card) {
  position: fixed !important;
  left: 86px !important;
  bottom: 24px !important;
  top: auto !important;
  right: auto !important;
  z-index: 2200 !important;
}

.sl-nav-user-wrap {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
}

.sl-user-menu-panel {
  position: fixed;
  left: 86px;
  bottom: 20px;
  min-width: 230px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
  padding: 8px 0;
  z-index: 2500;
  animation: slMenuFadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slMenuFadeIn {
  from {
    opacity: 0;
    transform: translateX(-6px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

.sl-user-menu-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px 10px;
}

.sl-user-menu-info {
  min-width: 0;
  flex: 1;
}

.sl-user-menu-name {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sl-user-menu-sub {
  font-size: 11px;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 1px;
}

.sl-user-menu-divider {
  height: 1px;
  background: #f1f5f9;
  margin: 4px 0;
}

.sl-user-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  font-size: 13px;
  color: #334155;
  text-decoration: none;
  background: none;
  border: none;
  width: 100%;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  font-family: inherit;
  box-sizing: border-box;
}

.sl-user-menu-item:hover {
  background: #f8fafc;
  color: #0068ff;
}

.sl-user-menu-item.text-error {
  color: #ef4444;
}

.sl-user-menu-item.text-error:hover {
  background: #fef2f2;
  color: #dc2626;
}

.sl-menu-icon {
  font-size: 18px !important;
  color: inherit;
}

.sl-nav-user-btn {
  padding: 0;
}

.sl-avatar-ring {
  display: inline-flex;
  padding: 2px;
  border-radius: 50%;
  background: linear-gradient(45deg, #ff9a9e, #fecfef, #a1c4fd);
}

.sl-user-name-label {
  font-weight: 600;
  color: #334155;
  font-size: 13px;
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
  padding: 12px 14px 14px;
  min-height: 0;
  position: relative;
}

/* ══ SIDE NAVBAR — Floating Glass Pill & Icon Precision ══════════════════════
   2026-07-27: Corrected physical bounds so collapsed sidebar items (44px) are 
   100% mathematically centered inside the 64px glass pill (10px left / 10px right). */
.sl-sidenav {
  position: absolute;
  left: 14px;
  top: 0;
  bottom: 0;
  width: 64px; /* Glass pill width when collapsed */
  display: flex;
  flex-direction: column;
  padding: 22px 0 18px;
  align-items: center;
  flex-shrink: 0;
  overflow: hidden;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  z-index: 40;
  transition: left 350ms cubic-bezier(0.2, 0.8, 0.2, 1),
              width 350ms cubic-bezier(0.2, 0.8, 0.2, 1),
              padding 350ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.sl-sidenav::before {
  content: '';
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 14px;
  right: 0; /* 100% width of sl-sidenav container */
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 4px 20px 0 rgba(31, 38, 135, 0.06);
  border-radius: 24px;
  z-index: -1;
  transition: border-radius 350ms cubic-bezier(0.2, 0.8, 0.2, 1),
              box-shadow 350ms cubic-bezier(0.2, 0.8, 0.2, 1),
              border-color 350ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.sl-sidenav.sl-sidenav--expanded {
  left: 0;
  width: 236px;
  align-items: stretch;
  padding: 22px 10px 18px;
}

.sl-sidenav.sl-sidenav--expanded::before {
  left: 0;
  top: 12px;
  bottom: 14px;
  border-radius: 0 24px 24px 0;
  border-left-color: transparent;
  box-shadow:
    0 8px 40px 0 rgba(0, 104, 255, 0.16),
    0 2px 8px 0 rgba(0, 0, 0, 0.08);
}

/* Backdrop overlay when sidebar is expanded */
.sl-sidebar-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 350ms cubic-bezier(0.2, 0.8, 0.2, 1);
  z-index: 35;
}

.sl-sidebar-backdrop.sl-sidebar-backdrop--visible {
  opacity: 1;
  pointer-events: auto;
}

/* Nav items container */
.sl-nav-items {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  align-items: center;
  overflow-y: auto;
  overflow-x: hidden;
}

.sl-sidenav.sl-sidenav--expanded .sl-nav-items {
  align-items: stretch;
}

.sl-nav-items::-webkit-scrollbar { width: 0; }

/* Individual nav item */
.sl-nav-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin: 0 auto;
  border-radius: 14px;
  text-decoration: none;
  color: #64748b;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
  box-sizing: border-box;
  flex-shrink: 0;
}

.sl-sidenav.sl-sidenav--expanded .sl-nav-item {
  width: 100%;
  justify-content: flex-start;
  padding: 0 12px;
  gap: 12px;
  margin: 0;
}

.sl-nav-item:hover {
  background: rgba(0, 104, 255, 0.08);
  color: #0068FF;
}

/* Active State — Crisp Zalo Blue Pill */
.sl-nav-item--active {
  background: #0068FF !important;
  color: #FFFFFF !important;
  font-weight: 700;
  box-shadow: 0 4px 14px rgba(0, 104, 255, 0.35);
  border: none !important;
}

.sl-nav-item--active:hover {
  background: #0057d6 !important;
  color: #FFFFFF !important;
}

/* Icon Wrapper for Optical Centering */
.sl-nav-icon-wrap {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sl-nav-icon {
  font-size: 22px;
  line-height: 1;
  display: block;
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  transition: transform 0.2s ease, font-variation-settings 0.2s ease, color 0.2s ease;
}

.sl-nav-item--active .sl-nav-icon {
  color: #FFFFFF !important;
  font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24;
}

.sl-nav-icon-mdi {
  flex-shrink: 0;
}

.sl-nav-item--active .sl-nav-icon-mdi {
  color: #FFFFFF !important;
}

/* Tab label — hidden & zero flex in collapsed mode to prevent pushing icon off-center */
.sl-nav-label {
  display: none;
  opacity: 0;
  flex: none;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: opacity 200ms ease;
}

.sl-sidenav.sl-sidenav--expanded .sl-nav-label {
  display: block;
  opacity: 1;
  flex: 1;
}

/* Tooltip — shown when sidebar is collapsed */
.sl-nav-tooltip {
  position: absolute;
  left: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%);
  background: rgba(15, 23, 42, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 10px;
  white-space: nowrap;
  pointer-events: none;
  visibility: hidden;
  opacity: 0;
  transition: opacity 0.15s ease;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  border: 1px solid rgba(255,255,255,0.1);
  z-index: 200;
}

.sl-sidenav:not(.sl-sidenav--expanded) .sl-nav-item:hover .sl-nav-tooltip {
  visibility: visible;
  opacity: 1;
}

/* Nav footer — logout */
.sl-nav-footer {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 12px;
  width: 100%;
  align-items: center;
  border-top: 1px solid rgba(0,0,0,0.06);
  flex-shrink: 0;
}

.sl-sidenav.sl-sidenav--expanded .sl-nav-footer {
  align-items: stretch;
}

/* Logout button */
.sl-nav-logout {
  color: #dc2626;
}

.sl-nav-logout:hover {
  background: rgba(220, 38, 38, 0.08);
  color: #dc2626;
}

/* ══ MAIN CANVAS ══════════════════════════════════ */
.sl-main {
  /* 14px (body padding-left) + 64px (sidebar glass pill width) + 14px (tight gap) = 92px total from screen edge
     Inside sl-body (which has padding-left: 14px), margin-left is 78px! */
  margin-left: 78px;
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
