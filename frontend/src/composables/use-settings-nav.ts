/**
 * use-settings-nav.ts — Central config cho Settings sidebar.
 *
 * Định nghĩa các nhóm và đường dẫn cài đặt. Mỗi item:
 *   - permission: ai thấy được (everyone / admin / owner)
 *   - comingSoon: scaffold cho feature sắp ra mắt
 *   - route: deep-link path
 *
 * Thêm item mới chỉ cần edit file này + tạo component + register route.
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
// Open-core: extension settings items merged in by group id (empty in Community).
import { eeSettingsItems } from '@ee/nav';
// Open-core: edition flag — gate items whose code stays in Community but UI is hidden.
import { isExtension } from '@ee/edition';

export type SettingsPermission = 'everyone' | 'admin' | 'owner';

export interface SettingsItem {
  id: string;
  label: string;
  icon: string;
  route: string;
  permission: SettingsPermission;
  /** RBAC 2026-06-08 — resource cần để thấy item. Không có resource = luôn hiện (vd Cá nhân). */
  resource?: string;
  action?: string;
  /** True nếu route trỏ tới SettingsComingSoon placeholder */
  comingSoon?: boolean;
  /** Search alias bổ sung (vd "phân quyền" → tìm "roles") */
  aliases?: string[];
  /** Open-core: item chỉ hiện ở bản Extension (code vẫn ở Community, chỉ ẩn menu). */
  extensionOnly?: boolean;
}

export interface SettingsGroup {
  id: string;
  label: string;
  icon: string;
  permission: SettingsPermission;
  /** Mô tả ngắn hiển thị trên thẻ nhóm ở trang tổng quan /settings. */
  description?: string;
  items: SettingsItem[];
}

// ════════════════════════════════════════════════════════════════════════
// Cấu trúc menu Settings: nhóm ngắn gọn theo công việc, giữ nguyên deep link
// và kiểm tra quyền ở từng mục để không làm thay đổi nghiệp vụ hiện hữu.
// ═════════════════════════════════════════════════════════════════════════
export const SETTINGS_GROUPS: SettingsGroup[] = [
  // ─── CÁ NHÂN ─────────────────────────────────────────
  {
    id: 'personal',
    label: 'Tài khoản',
    icon: 'mdi-account-circle-outline',
    permission: 'everyone',
    description: 'Hồ sơ và bảo mật tài khoản cá nhân.',
    items: [
      { id: 'account', label: 'Tài khoản của tôi', icon: 'mdi-account-outline', route: '/settings/personal/profile', permission: 'everyone', aliases: ['hồ sơ', 'profile', 'avatar', 'ảnh đại diện', 'đổi mật khẩu', 'mật khẩu', 'password', 'tài khoản'] },
    ],
  },

  // ─── TỔ CHỨC ─────────────────────────────────────────
  {
    id: 'org',
    label: 'Tổ chức & đội ngũ',
    icon: 'mdi-domain',
    permission: 'admin',
    description: 'Thiết lập tổ chức, nhân viên và quyền truy cập cơ bản.',
    items: [
      { id: 'profile', label: 'Hồ sơ tổ chức', icon: 'mdi-office-building-outline', route: '/settings/org/profile', permission: 'admin', resource: 'settings' },
      { id: 'users', label: 'Nhân viên', icon: 'mdi-account-group-outline', route: '/settings/rbac/users', permission: 'admin', resource: 'user', aliases: ['user', 'sale', 'nhân sự'] },
      { id: 'permission-groups', label: 'Phân quyền', icon: 'mdi-shield-account-outline', route: '/settings/rbac/permission-groups', permission: 'owner', resource: 'permission_group', aliases: ['phân quyền', 'permission', 'role', 'vai trò', 'nhóm quyền'] },
    ],
  },

  // ─── KHÁCH HÀNG & LEAD ───────────────────────────────
  {
    id: 'customer',
    label: 'Dữ liệu khách hàng',
    icon: 'mdi-target-account',
    permission: 'admin',
    description: 'Quản lý pipeline, nhãn và dữ liệu khách hàng.',
    items: [
      { id: 'statuses', label: 'Trạng thái khách hàng', icon: 'mdi-flag-outline', route: '/settings/crm/statuses', permission: 'admin', resource: 'settings', aliases: ['stage', 'pipeline', 'trạng thái'] },
      { id: 'tags-v2', label: 'Nhãn khách hàng', icon: 'mdi-tag-multiple-outline', route: '/settings/crm/tags-v2', permission: 'admin', resource: 'settings', aliases: ['tag', 'tag mới', 'tag taxonomy', 'friend tag', 'crm tag', 'nhãn'] },
      { id: 'appointments', label: 'Lịch hẹn & nhắc hẹn', icon: 'mdi-calendar-clock-outline', route: '/settings/crm/appointments', permission: 'admin', resource: 'settings', aliases: ['lịch hẹn', 'appointment', 'nhắc hẹn', 'reminder', 'zalo reminder', 'nhắc lịch'] },
    ],
  },

  // ─── KÊNH & TỰ ĐỘNG ──────────────────────────────────
  {
    id: 'channels',
    label: 'Kênh & tích hợp',
    icon: 'mdi-connection',
    permission: 'admin',
    description: 'Kết nối tài khoản Zalo, POS và các dịch vụ đang sử dụng.',
    items: [
      { id: 'zalo', label: 'Tài khoản Zalo', icon: 'mdi-cellphone-link', route: '/settings/channels/zalo', permission: 'admin', resource: 'zalo_account', aliases: ['nick', 'zalo account'] },
      { id: 'integrations', label: 'Tích hợp', icon: 'mdi-puzzle-outline', route: '/settings/channels/integrations', permission: 'admin', resource: 'settings', aliases: ['tích hợp', 'integration', '3rd party'] },
      { id: 'hisweetie-pos', label: 'Hisweetie POS (MCP)', icon: 'mdi-storefront-outline', route: '/settings/channels/hisweetie-pos', permission: 'admin', resource: 'settings', aliases: ['hisweetie', 'pos', 'mcp', 'pos data', 'kho pos'] },
    ],
  },

  // ─── HỆ THỐNG ────────────────────────────────────────
  {
    id: 'system',
    label: 'Hệ thống',
    icon: 'mdi-cog-outline',
    permission: 'admin',
    description: 'Thông báo vận hành và kết nối API, webhook.',
    items: [
      { id: 'api', label: 'API & Webhook', icon: 'mdi-api', route: '/settings/dev/api', permission: 'owner', resource: 'webhook', aliases: ['webhook', 'api key', 'dev'] },
    ],
  },
];

// Open-core: append extension items to their target groups (no-op in Community
// edition where eeSettingsItems is empty). Done once at module load.
for (const group of SETTINGS_GROUPS) {
  const extra = eeSettingsItems[group.id];
  if (extra?.length) group.items.push(...extra);
}

// ─── Helpers ────────────────────────────────────────────

export function useSettingsNav() {
  const auth = useAuthStore();
  const route = useRoute();

  /**
   * Groups + items đã filter theo NHÓM QUYỀN (grants) của user hiện tại.
   * RBAC enforce 2026-06-08: item không có resource → luôn hiện (vd Cá nhân);
   * có resource → cần canAccess. Group ẩn nếu không còn item con.
   * (Trước đây lọc theo legacy role nên Trưởng phòng/Marketing role=member bị ẩn oan.)
   */
  const visibleGroups = computed<SettingsGroup[]>(() => {
    return SETTINGS_GROUPS
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (item) =>
            (!item.extensionOnly || isExtension) &&
            (!item.resource || auth.canAccess(item.resource, item.action)),
        ),
      }))
      .filter((g) => g.items.length > 0);
  });

  /** Find item by route path + query. Items có query (vd ?tab=internal-contact) match riêng;
   *  items không query match chỉ khi current route cũng không có tab matching item khác. */
  const activeItem = computed<{ group: SettingsGroup; item: SettingsItem } | null>(() => {
    const path = route.path;
    const currentTab = route.query.tab as string | undefined;
    // Pass 1: items có query — match path + ?tab=<x>
    for (const g of visibleGroups.value) {
      for (const item of g.items) {
        const [itemPath, itemQuery] = item.route.split('?');
        if (itemQuery && itemPath === path) {
          const expectedTab = new URLSearchParams(itemQuery).get('tab');
          if (expectedTab && expectedTab === currentTab) return { group: g, item };
        }
      }
    }
    // Pass 2: items không query — match path, current route phải không có tab hoặc tab khác
    for (const g of visibleGroups.value) {
      for (const item of g.items) {
        if (item.route === path) return { group: g, item };
      }
    }
    return null;
  });

  /** Search filter (live filter sidebar items) */
  function searchItems(query: string): SettingsItem[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results: SettingsItem[] = [];
    for (const g of visibleGroups.value) {
      for (const item of g.items) {
        const matchLabel = item.label.toLowerCase().includes(q);
        const matchGroup = g.label.toLowerCase().includes(q);
        const matchAlias = item.aliases?.some((a) => a.toLowerCase().includes(q));
        if (matchLabel || matchGroup || matchAlias) results.push(item);
      }
    }
    return results;
  }

  /** Trang tổng quan khi người dùng mở /settings. */
  const defaultRoute = computed<string>(() => '/settings');

  return { visibleGroups, activeItem, searchItems, defaultRoute };
}
