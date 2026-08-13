<template>
  <v-app class="smax-app" :class="navMode === 'rail' ? 'nv-mode-rail' : 'nv-mode-bar'">
    <!-- Nav có 2 chế độ theo bề rộng màn hình:
         >=1440px  → thanh ngang đầy đủ (tab nằm ngay trong header này)
         < 1440px  → header thu thành dải tiện ích 44px, tab chuyển xuống rail dọc
         Ngưỡng 1440 đo thực tế: thanh ngang cũ cần 1523px nên bị cắt mất avatar +
         Đăng xuất ở mọi cỡ dưới ~1600px, mà body overflow-x:hidden nên KHÔNG cuộn
         tới được. Bỏ wordmark thu lại 73px là vừa khít 1440. -->
    <header class="smax-topnav">
      <!-- Logo lấy theo hồ sơ tổ chức, đồng bộ với /login và /setup-password.
           Wordmark đã bỏ; tên tổ chức chuyển sang thuộc tính title. -->
      <RouterLink to="/" class="hs-brand" :title="`${brandName} CRM`">
        <span class="hs-bbox"><img :src="brandLogo" :alt="brandName" @error="onLogoError" /></span>
      </RouterLink>

      <!-- Primary nav tabs, chỉ ở chế độ thanh ngang -->
      <nav v-if="navMode === 'bar'" class="nav-tabs">
        <RouterLink
          v-for="tab in visiblePrimaryTabs"
          :key="tab.path"
          :to="tab.path"
          class="nav-tab"
          :class="{ active: isActive(tab) }"
        >
          <v-icon :icon="tab.icon" size="16" class="ic-svg" />{{ tab.label }}
          <span
            v-if="tab.path === '/appointments' && todayCount > 0"
            class="nav-badge"
            :title="`${todayCount} lịch hẹn còn mở hôm nay`"
          >{{ todayCount }}</span>
        </RouterLink>


        <!-- Dropdown gộp Phân tích và Báo cáo.
             RBAC: chỉ hiện cho ai có engagement_score (Sale Senior trở lên).
             Đang tắt, xem SHOW_REPORTS_NAV. -->
        <NavReportsMenu
          v-if="SHOW_REPORTS_NAV && authStore.canAccess('engagement_score')"
          v-model="reportsMenu"
          mode="bar"
        />
        <NavSettingsMenu v-model="settingsMenu" mode="bar" />
      </nav>

      <!-- Flexible spacer pushes everything after it to the right edge. -->
      <div class="topnav-spacer" />

      <!-- Global Sync Widget -->
      <SyncHeaderWidget />

      <!-- Global search trigger -->
      <GlobalSearch class="topnav-search" />

      <!-- Right icon buttons -->
      <!-- 2026-06-13 (anh chốt): nút này trỏ về trang quản lý nick Zalo (trước trỏ /groups). -->
      <RouterLink to="/settings/channels/zalo" class="icon-btn" title="Quản lý nick Zalo">
        <v-icon size="18">mdi-cellphone-link</v-icon>
      </RouterLink>

      <NotificationBell class="icon-btn-wrap" />

      <v-menu v-model="userMenu" :close-on-content-click="true">
        <template #activator="{ props: act }">
          <button class="user-avatar" v-bind="act" :title="authStore.user?.fullName || 'Tài khoản'">
            <Avatar :src="authStore.user?.avatarUrl" :name="authStore.user?.fullName || 'U'" :size="32" :platform="null" />
          </button>
        </template>
        <v-list density="compact" min-width="200">
          <v-list-item :title="authStore.user?.fullName || ''" :subtitle="authStore.user?.email || ''" />
          <v-divider />
          <!-- 2026-06-13 (anh chốt): Hồ sơ trỏ về trang gom "Tài khoản của tôi". Bỏ nút Theme tối. -->
          <v-list-item to="/settings/personal/profile" title="Hồ sơ" prepend-icon="mdi-account-circle-outline" />
          <v-divider />
          <v-list-item @click="logout" title="Đăng xuất" prepend-icon="mdi-logout" />
        </v-list>
      </v-menu>
    </header>

    <!-- Banner cố định cho sale chưa setup liên hệ nội bộ -->
    <div v-if="showInternalContactBanner" class="ic-banner">
      <span class="ic-banner-icon">⚠</span>
      <div class="ic-banner-text">
        <strong>Bạn đang BỎ LỠ thông báo quan trọng từ CRM!</strong>
        <span class="ic-banner-sub">Khách đồng ý kết bạn, cảnh báo silent 30 ngày, lịch hẹn, daily KPI...</span>
      </div>
      <button class="ic-banner-cta" @click="goSetupInternalContact">⚙ Thiết lập ngay</button>
      <button class="ic-banner-dismiss" @click="dismissInternalContactBanner" title="Ẩn 24h">✕</button>
    </div>

    <!-- ════════ THÂN: rail dọc (nếu có) + MAIN ════════ -->
    <div class="smax-body">
      <!-- Rail dọc chỉ hiện dưới 1440px. Dùng chung visiblePrimaryTabs với thanh
           ngang, nên thêm/bớt tab chỉ sửa một chỗ. Nhãn rút gọn qua tab.short vì
           ô rộng 62px không chứa nổi "Kênh Kết Nối" / "Cửa hàng POS". -->
      <nav v-if="navMode === 'rail'" class="nav-rail" aria-label="Điều hướng chính">
        <div class="rail-items">
          <RouterLink
            v-for="tab in visiblePrimaryTabs"
            :key="tab.path"
            :to="tab.path"
            class="rail-item"
            :class="{ 'rail-item--active': isActive(tab) }"
            :title="tab.label"
          >
            <v-icon :icon="tab.icon" size="21" class="ic-svg" />
            <span class="rail-label">{{ tab.short ?? tab.label }}</span>
            <span
              v-if="tab.path === '/appointments' && todayCount > 0"
              class="nav-badge"
              :title="`${todayCount} lịch hẹn còn mở hôm nay`"
            >{{ todayCount }}</span>
          </RouterLink>
        </div>

        <div class="rail-foot">
          <!-- Đang tắt, xem SHOW_REPORTS_NAV. -->
          <NavReportsMenu
            v-if="SHOW_REPORTS_NAV && authStore.canAccess('engagement_score')"
            v-model="reportsMenu"
            mode="rail"
          />
          <NavSettingsMenu v-model="settingsMenu" mode="rail" />
        </div>
      </nav>

      <v-main class="smax-main">
        <slot />
      </v-main>
    </div>

    <!-- Đã gỡ MiniOnboardingIndicator vì badge 4/4 hiện đè lên mọi UI sau khi sale hoàn tất.
         LeadFloatingButton cũng đã chuyển vào ConversationFilterSidebar, chỉ render ở /chat. -->

    <!-- Global toast queue -->
    <ToastContainer />

    <!-- ════ ORDER DRAFT SYSTEM (Global) ════ -->
    <!-- Taskbar: hiển widget thu nhỏ cho các đơn hàng nhiều khách -->
    <OrderDraftTaskbar />
    <!-- Full modal: chỉ render khi có draft đang được mở full -->
    <OrderBuilderWorkspace
      v-if="orderDraftStore.openFullDraft"
      :draft-id="orderDraftStore.openFullDraft.id"
    />
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useTheme } from 'vuetify';
import { useRoute, RouterLink } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { isExtension } from '@ee/edition';
import { useRouter } from 'vue-router';
import NotificationBell from '@/components/NotificationBell.vue';
import GlobalSearch from '@/components/GlobalSearch.vue';
import SyncHeaderWidget from '@/components/SyncHeaderWidget.vue';
import ToastContainer from '@/components/ui/ToastContainer.vue';
import Avatar from '@/components/ui/Avatar.vue';
import OrderDraftTaskbar from '@/components/order-builder/workspace/OrderDraftTaskbar.vue';
import { useAppointmentBadge } from '@/composables/use-appointment-badge';
import OrderBuilderWorkspace from '@/components/order-builder/workspace/OrderBuilderWorkspace.vue';
import { useOrderDraftStore } from '@/stores/use-workspace-sessions';
import { fetchPublicBranding } from '@/api/public-branding';
import { usePosNotification } from '@/composables/use-pos-notification';
import NavReportsMenu from '@/components/nav/NavReportsMenu.vue';
import NavSettingsMenu from '@/components/nav/NavSettingsMenu.vue';
import '@/assets/nav-shell.css';

// Multi-draft order queue store
const orderDraftStore = useOrderDraftStore();
usePosNotification();
// 2026-06-04: gỡ MiniOnboardingIndicator (Anh chốt code lại setup 4 bước sau)
// LeadFloatingButton moved to ConversationFilterSidebar 2026-06-01
// Đã gỡ import api vì banner "BỎ LỠ thông báo" đã tắt.
const theme = useTheme();
const route = useRoute();
const authStore = useAuthStore();
const router = useRouter();

// Dropdown Vuetify ở z-index 2000, kẹt mở là phủ lên nav và nuốt hết click. Vì vậy giữ
// bằng v-model rồi ép đóng sau mỗi điều hướng, kể cả điều hướng bị huỷ hay chặn quyền.
const reportsMenu = ref(false);
const settingsMenu = ref(false);
const userMenu = ref(false);
function closeAllNavMenus() {
  reportsMenu.value = false;
  settingsMenu.value = false;
  userMenu.value = false;
}

// Overlay Vuetify bị mồ côi khi activator unmount giữa lúc đang mở sẽ để lại listener
// click-outside ở document, khiến click nav bị nuốt thay vì điều hướng. Đóng riêng 3 menu
// nav là không đủ vì overlay có thể đến từ module bất kỳ, nên phải dọn toàn cục.
function sweepStuckOverlays() {
  try {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  } catch { /* no-op */ }
  void nextTick(() => {
    try {
      document
        .querySelectorAll('.v-overlay-container > .v-overlay.v-overlay--active')
        .forEach((el) => el.remove());
    } catch { /* race với Vuetify cleanup — bỏ qua */ }
  });
}

function cleanupAfterNav() {
  closeAllNavMenus();
  sweepStuckOverlays();
}
router.afterEach(() => cleanupAfterNav());
router.onError(() => cleanupAfterNav());

// Banner cho sale chưa setup liên hệ nội bộ
// Phase Onboarding v1 redesign 2026-05-24: ẨN banner khi đang ở Dashboard route
// vì OnboardingChecklist đã cover. Banner chỉ nhắc ở các tab khác (Chat, Bạn bè,...).
const IC_BANNER_DISMISS_KEY = 'ic-banner-dismissed-until';
const _showICBannerRaw = ref(false);
const showInternalContactBanner = computed(() => {
  // Hide trên Dashboard vì checklist đã hiện ở đó
  if (route.path === '/') return false;
  return _showICBannerRaw.value;
});
async function checkInternalContactSetup() {
  // 2026-06-08 (Anh chốt): TẮT banner "Bạn đang BỎ LỠ thông báo quan trọng từ CRM".
  // Lý do: giờ user được tạo bằng SĐT đã verify có Zalo 100% (wizard create-with-zalo),
  // recipient.threadIdInSenderView được điền sẵn lúc tạo → không cần nhắc sale tự vào
  // Cài đặt thiết lập nick liên lạc nội bộ nữa. Giữ lại logic bên dưới (comment) để dễ
  // bật lại nếu sau này cần.
  return;
  // if (!authStore.user) return;
  // const dismissedUntil = Number(localStorage.getItem(IC_BANNER_DISMISS_KEY) || '0');
  // if (dismissedUntil > Date.now()) return;
  // try {
  //   const { data } = await api.get('/me/internal-contact');
  //   if (!data.method || data.recipient?.status !== 'ready') {
  //     _showICBannerRaw.value = true;
  //   }
  // } catch { /* silent */ }
}
function goSetupInternalContact() {
  _showICBannerRaw.value = false;
  router.push('/settings/channels/zalo?tab=internal-contact');
}
function dismissInternalContactBanner() {
  _showICBannerRaw.value = false;
  localStorage.setItem(IC_BANNER_DISMISS_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
}

// Brand lockup trên menu: logo và tên tổ chức, đồng bộ với /login.
const DEFAULT_LOGO = '/brand/hs-monogram.png';
const brandLogo = ref(DEFAULT_LOGO);
const brandName = ref('Hi-CRM');
function onLogoError() {
  if (brandLogo.value !== DEFAULT_LOGO) brandLogo.value = DEFAULT_LOGO;
}

onMounted(() => {
  // 2026-06-13 (anh chốt): app LUÔN theme sáng 'hsLight', bỏ chọn theme tối. Ép cứng +
  // dọn giá trị 'legacy-dark'/'smax-light' cũ trong localStorage để user nào đang kẹt
  // dark cũng về sáng.
  theme.change('hsLight');
  void checkInternalContactSetup();

  syncNavMode();
  navObserver = new ResizeObserver(syncNavMode);
  navObserver.observe(document.documentElement);
  window.addEventListener('resize', syncNavMode);

  // Khôi phục các đơn nháp từ localStorage
  orderDraftStore.hydrate();

  fetchPublicBranding()
    .then((b) => {
      if (!b) return;
      brandLogo.value = b.logoUrl || DEFAULT_LOGO;
      brandName.value = b.name || 'Hi-CRM';
    })
    .catch(() => {});
});

// Badge "lịch hẹn hôm nay" trên tab /appointments (2026-08-04).
const { todayCount } = useAppointmentBadge();

// ── Chế độ nav (revamp 2026-08-05) ──────────────────────────────────────────
// >=1440px thanh ngang, dưới ngưỡng chuyển rail dọc. Dùng ResizeObserver trên
// <html> chứ KHÔNG dùng window 'resize': ở chế độ nửa màn / snap và khi devtools
// đổi kích thước khung nhìn, sự kiện resize có lúc không bắn, còn hộp của phần tử
// gốc thì luôn đổi nên observer bắt được mọi trường hợp.
const NAV_RAIL_MAX = 1440;
const navMode = ref<'bar' | 'rail'>(
  typeof window !== 'undefined' && window.innerWidth < NAV_RAIL_MAX ? 'rail' : 'bar',
);
let navObserver: ResizeObserver | null = null;
function syncNavMode() {
  navMode.value = window.innerWidth < NAV_RAIL_MAX ? 'rail' : 'bar';
}
// Cố tình nghe cả ResizeObserver lẫn window resize dù hàm này idempotent: ResizeObserver
// bắt được zoom và cắm rút màn hình, window resize là lưới an toàn. Cả hai cùng câm thì
// nav kẹt một chế độ tới lần tải lại, đắt hơn nhiều so với chi phí nghe thừa một nguồn.
// Trình duyệt điều khiển qua CDP không bắn sự kiện nào trong số này, nên đường chuyển chế
// độ chỉ kiểm được bằng cách tải lại ở từng bề rộng.


// Hai module này chưa có kế hoạch dùng nên chỉ tắt lối vào, route vẫn giữ nguyên và gõ
// thẳng URL vẫn vào được. Bật lại chỉ cần đổi cờ tương ứng về true.
const SHOW_REPORTS_NAV = false;
const SHOW_MARKETING_NAV = false;

interface NavTab {
  path: string;
  label: string;
  icon: string;
  /** Nhãn rút gọn cho rail dọc vì ô chỉ rộng 62px. Không có thì dùng label. */
  short?: string;
  matchPrefix?: string;
  /** Tab gom nhiều route thì sáng ở bất kỳ route nào trong đó. */
  matchAny?: string[];
  // Resource cần để thấy tab. Không có resource nghĩa là luôn hiện.
  resource?: string;
}

// HD-first redesign 2026-05-28 (anh chốt Variant A): 7 primary tabs + 2 dropdown.
// Bỏ: "KH đình trệ" (move vào Dashboard alert), "Phân tích" (gộp Báo cáo dropdown),
//     "Báo cáo" tab riêng (gộp dropdown), Automation legacy dropdown (Marketing thay).
// Icons MDI line stroke-2 (mdi-*-outline) thay emoji để nhất quán + đổi màu theo theme.
const primaryTabs: NavTab[] = [
  { path: '/',                       label: 'Dashboard',   icon: 'mdi-view-dashboard-outline', matchPrefix: '/$' },
  { path: '/channels',               label: 'Kênh Kết Nối', short: 'Kênh', icon: 'mdi-transit-connection-variant', resource: 'zalo_account' },
  { path: '/chat',                   label: 'Tin nhắn',    icon: 'mdi-message-text-outline', resource: 'conversation' },
  // 2026-07-29: gộp "Bạn bè" + "Khách hàng" thành 1 tab. /friends redirect sang
  // /contacts?rel=friend, nên bỏ tab riêng thay vì để 2 tab trỏ cùng màn.
  { path: '/contacts',               label: 'Khách hàng',  icon: 'mdi-account-outline', resource: 'contact' },
  // Gộp "Lịch hẹn" và "Công việc" thành một mặt Schedule.
  // 2 trang vẫn riêng, nhưng vào từ một chỗ rồi chuyển qua lại bằng tab con
  // (ScheduleTabs). matchPrefix nhận cả /tasks để tab vẫn sáng khi đang ở đó.
  { path: '/appointments',           label: 'Công việc',   icon: 'mdi-calendar-check-outline', matchAny: ['/appointments', '/tasks'] },
  // Route /media giữ nguyên để deep-link và bookmark cũ không gãy.
  { path: '/media',                  label: 'Kho lưu trữ', short: 'Kho', icon: 'mdi-folder-multiple-outline', resource: 'media' },
  { path: '/pos',                    label: 'Cửa hàng POS', short: 'POS', icon: 'mdi-storefront-outline' },
];

// Tab Marketing gồm nhiều chức năng, hiện nếu user có quyền bất kỳ chức năng nào và trỏ
// quyền BẤT KỲ chức năng nào, và trỏ tới chức năng ĐẦU TIÊN user có quyền (vd Sale
// chỉ có Khối → tab Marketing trỏ thẳng /marketing/blocks). Thứ tự = thứ tự sidebar.
const MARKETING_FUNCTIONS: Array<{ path: string; resource: string }> = [
  { path: '/marketing/triggers',     resource: 'trigger' },
  { path: '/marketing/care-sessions',resource: 'care_session' },
  { path: '/marketing/sequences',    resource: 'sequence' },
  { path: '/marketing/blocks',       resource: 'block' },
  { path: '/marketing/broadcasts',   resource: 'broadcast' },
  { path: '/marketing/lists',        resource: 'customer_list' },
];
const marketingEntry = computed(() =>
  MARKETING_FUNCTIONS.find((f) => authStore.canAccess(f.resource))?.path ?? null,
);

// Chỉ hiện tab user có quyền, Dashboard và Lịch hẹn thì luôn hiện.
const visiblePrimaryTabs = computed(() => {
  const tabs = primaryTabs.filter((t) => !t.resource || authStore.canAccess(t.resource));
  // Tab Marketing khác nhau giữa hai edition:
  //  - EE: menu Marketing đầy đủ (triggers/sequences/…); hiện khi có quyền ≥1 chức năng.
  //  - Community: menu Marketing RIÊNG, chỉ Quét nhóm + Tệp khách hàng (route /marketing
  //    chỉ đăng ký khi !isExtension. Không dùng marketingEntry vì đó là resource EE.

  if (!SHOW_MARKETING_NAV) {
    return tabs;
  }
  if (isExtension && marketingEntry.value) {
    tabs.push({
      path: marketingEntry.value,
      label: 'Marketing',
      icon: 'mdi-bullhorn-outline',
      matchPrefix: '/marketing',
    });
  } else if (!isExtension) {
    tabs.push({
      path: '/marketing/group-scan',
      label: 'Marketing',
      icon: 'mdi-bullhorn-outline',
      matchPrefix: '/marketing',
    });
  }
  return tabs;
});
// Bỏ showOrgGroup và showCrmGroup: dropdown giờ là lối tắt phẳng, lọc per-item theo grants.
// lọc per-item theo grants trực tiếp, không còn subheader nhóm cần gate.

function isActive(tab: NavTab): boolean {
  if (tab.matchAny) {
    return tab.matchAny.some((p) => route.path === p || route.path.startsWith(p + '/'));
  }
  if (tab.matchPrefix === '/$') return route.path === '/';
  if (tab.matchPrefix) {
    return route.path === tab.matchPrefix || route.path.startsWith(tab.matchPrefix + '/');
  }
  return route.path === tab.path || route.path.startsWith(tab.path + '/');
}
// isSettingsActive / isReportsActive đã chuyển vào NavSettingsMenu / NavReportsMenu
// Mỗi dropdown tự tính trạng thái sáng của nó.

// Workspace selector đã ẩn ở Variant A 2026-05-28 (single-tenant chưa cần switch).
// Sau này multi-tenant → revert back template + uncomment block dưới.

// Avatar top nav dùng <Avatar/> có ảnh thật kèm fallback chữ cái.
// Bỏ chọn theme tối, app luôn dùng theme sáng hsLight.

function logout() {
  authStore.logout();
  router.push('/login');
}

onBeforeUnmount(() => {
  navObserver?.disconnect();
  navObserver = null;
  window.removeEventListener('resize', syncNavMode);
});
</script>

<style scoped>
/* Banner cố định cho sale chưa setup liên hệ nội bộ */
.ic-banner {
  display: flex; align-items: center; gap: 14px;
  padding: 10px 20px;
  background: linear-gradient(90deg, #FEF3C7 0%, #FDE68A 100%);
  border-bottom: 1px solid #FCD34D;
  color: #78350F;
  font-size: 13.5px;
}
.ic-banner-icon { font-size: 20px; flex-shrink: 0; }
.ic-banner-text { flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.3; }
.ic-banner-text strong { color: #92400E; font-weight: 700; }
.ic-banner-sub { font-size: 12px; color: #92400E; opacity: 0.85; }
.ic-banner-cta {
  background: #B45309; color: white; border: none;
  padding: 8px 16px; border-radius: 8px;
  font-weight: 700; font-size: 13px; cursor: pointer; font-family: inherit;
  white-space: nowrap;
}
.ic-banner-cta:hover { background: #92400E; }
.ic-banner-dismiss {
  background: transparent; color: #92400E; border: none;
  padding: 8px 10px; cursor: pointer; font-family: inherit;
  font-size: 14px; font-weight: 700;
}
.ic-banner-dismiss:hover { color: #78350F; }

/* ⚠️ Style vỏ nav (.smax-topnav / .nav-tabs / .nav-tab / .hs-brand / .nav-rail /
   .icon-btn / .user-avatar / .topnav-search) đã chuyển sang assets/nav-shell.css
   dạng TOÀN CỤC (revamp nav 2026-08-05). Lý do: hai dropdown Báo cáo / Cài đặt giờ
   nằm trong component con, mà CSS scoped ở đây không với tới activator bên trong
   con. Sửa giao diện nav thì sửa ở nav-shell.css, đừng thêm lại vào đây.

   Đã xoá luôn .contact-marquee + .marquee-track: CSS chết, template không còn phần
   tử nào mang class đó (kiểm 2026-08-05). */

.smax-main {
  background: var(--smax-grey-100);
  /* Ở chế độ rail, main là ô co giãn NẰM CẠNH rail trong .smax-body.
     min-width:0 để nội dung rộng (bảng, lưới tuần) co lại được thay vì đẩy rail
     ra ngoài màn. */
  flex: 1 1 auto;
  min-width: 0;
}
.smax-main :deep(.v-main__wrap) { min-height: calc(100vh - var(--smax-topnav-h)); }

/* Vuetify menus rendered from v-menu inherit theme automatically.
   Force light surface in case parent has legacy-dark applied. */
:deep(.v-overlay__content > .v-list) {
  background: var(--smax-bg);
  color: var(--smax-text);
}
</style>
