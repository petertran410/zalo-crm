<template>
  <v-app class="sl-app">
    <!-- ════════ TOP HEADER — Glassmorphic Floating Bar ════════ -->
    <header class="sl-topbar">
      <!-- Left: Search — tìm kiếm trong danh sách hội thoại (local, không phải global search) -->
      <div class="sl-topbar-search">
        <div class="sl-conv-search">
          <svg class="sl-conv-search__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            v-model="salesSearch.query.value"
            class="sl-conv-search__input"
            placeholder="Tìm khách hàng..."
            type="search"
          />
          <button v-if="salesSearch.query.value" class="sl-conv-search__clear" @click="salesSearch.query.value = ''" title="Xóa">×</button>
        </div>
      </div>

      <!-- Center: Workspace Title -->
      <div class="sl-workspace-title">
        Sales Workspace
      </div>

      <!-- Right: Trailing actions -->
      <div class="sl-topbar-actions">
        <SyncHeaderWidget />
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

        <!-- Footer: Logout -->
        <div class="sl-nav-footer">
          <button class="sl-nav-item sl-nav-logout" @click="handleLogout">
            <div class="sl-nav-icon-wrap">
              <span class="sl-nav-icon material-symbols-outlined">logout</span>
            </div>
            <span class="sl-nav-label">Đăng xuất</span>
            <div class="sl-nav-tooltip">Đăng xuất</div>
          </button>
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
import { ref, computed, onMounted, nextTick } from 'vue';
import { useTheme } from 'vuetify';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useWorkspaceStore } from '@/workspaces/resolver';
import type { MenuItemConfig } from '@/workspaces/types';
import { useSalesSearch } from '@/composables/use-sales-search';
import SyncHeaderWidget from '@/components/SyncHeaderWidget.vue';
import ToastContainer from '@/components/ui/ToastContainer.vue';
import Avatar from '@/components/ui/Avatar.vue';
import WorkspaceSwitcher from '@/components/workspace/WorkspaceSwitcher.vue';
import OrderDraftTaskbar from '@/components/order-builder/workspace/OrderDraftTaskbar.vue';
import OrderBuilderWorkspace from '@/components/order-builder/workspace/OrderBuilderWorkspace.vue';
import { useOrderDraftStore } from '@/stores/use-order-drafts';
import { fetchPublicBranding } from '@/api/public-branding';
import { usePosNotification } from '@/composables/use-pos-notification';
import '@/assets/sales-theme.css';

const orderDraftStore = useOrderDraftStore();

const theme = useTheme();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const workspaceStore = useWorkspaceStore();

usePosNotification();

const userMenu = ref(false);
const isSidebarExpanded = ref(false);
const salesSearch = useSalesSearch();


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
  userMenu.value = false;
  isSidebarExpanded.value = false;
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

  fetchPublicBranding()
    .then((b) => {
      if (!b) return;
      brandLogo.value = b.logoUrl || DEFAULT_LOGO;
      brandName.value = b.name || 'Hi-CRM';
    })
    .catch(() => {});

  // ── Fix 2: Prefetch tất cả chunk JS của các tab trong Sales sidebar ─────────
  // Chạy trong idle time → không ảnh hưởng render đầu tiên.
  // Lần đầu click vào bất kỳ tab nào sẽ load tức thì thay vì chờ download.
  const saleSidebarPrefetch = [
    () => import('@/views/AppointmentsView.vue'),
    () => import('@/views/ContactsView.vue'),
    () => import('@/views/FriendsView.vue'),
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
/* ⚠️ zoom: 0.85 — Tối ưu cho màn hình 27 inch (chuẩn nội bộ).
   Nếu sau này dùng trên màn hình nhỏ hơn 24 inch, xóa dòng zoom này.
   Zoom cover: topbar, sidenav, SalesChatView, VisualOrderModal, Vuetify menus.
   height/width bù = viewport / 0.85 để layout điền đầy màn hình sau khi scale. */
.sl-app {
  background: linear-gradient(135deg, #E2E9F3 0%, #EEF3F9 100%) !important;
  display: flex;
  flex-direction: column;
  /* Bù zoom: logical size lớn hơn viewport → sau scale(0.85) vừa đúng màn hình */
  height: calc(100vh / 0.85);
  min-width: calc(100vw / 0.85);
  overflow: hidden;
  zoom: 0.85;
  transform-origin: top left;
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

/* Inline conv-list search — thay GlobalSearch, tìm trong danh sách KH */
.sl-conv-search {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}
.sl-conv-search__icon {
  position: absolute;
  left: 12px;
  width: 16px;
  height: 16px;
  color: #64748b;
  pointer-events: none;
  flex-shrink: 0;
}
.sl-conv-search__input {
  width: 100%;
  padding: 8px 32px 8px 36px;
  border-radius: 9999px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.6);
  font-size: 13.5px;
  color: #1e293b;
  outline: none;
  transition: border-color 0.15s, background 0.15s;
  font-family: inherit;
  /* Xóa nút X mặc định của type=search trên Safari/Chrome */
  -webkit-appearance: none;
}
.sl-conv-search__input::placeholder { color: #94a3b8; }
.sl-conv-search__input:focus {
  border-color: #0068FF;
  background: rgba(255, 255, 255, 0.9);
}
.sl-conv-search__clear {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: #94a3b8;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 50%;
  transition: color 0.15s;
}
.sl-conv-search__clear:hover { color: #1e293b; }


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
