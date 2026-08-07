/**
 * Admin Workspace — Menu Config
 * ──────────────────────────────
 * Hiển thị ĐẦY ĐỦ tất cả tính năng của hệ thống.
 * Dành cho Owner, Admin — toàn quyền quản lý.
 *
 * ⚠️ FILE NÀY HIỆN KHÔNG ĐƯỢC DÙNG ĐỂ RENDER NAV (xác minh 2026-08-05).
 * Chỉ `SalesLayout.vue` đọc `activeConfig.menu`; `DefaultLayout.vue` — layout của
 * admin và 6 workspace khác (manager/marketing/finance/director/warehouse/
 * call-center) — dựng nav từ mảng `primaryTabs` HARDCODE bên trong chính nó.
 * Vì vậy nội dung dưới đây đã trôi khỏi nav thật (thiếu Marketing, còn ghi
 * "Lịch hẹn" thay vì "Công việc", thiếu gộp /appointments + /tasks).
 *
 * KHÔNG chuyển DefaultLayout sang đọc file này nếu chưa điền menu cho cả 6
 * workspace kia: hôm nay tất cả đều dùng chung 10 tab của primaryTabs, chuyển
 * sang menu riêng sẽ khiến manager tụt còn 5 tab và marketing/finance/director/
 * warehouse/call-center còn 3 tab, mất hẳn Dashboard + Tin nhắn.
 *
 * Dropdown: Báo cáo (7 màn + Phân tích nâng cao) · Cài đặt (lối tắt).
 */

import type { MenuItemConfig } from '../types';

export const adminMenu: MenuItemConfig[] = [
  {
    key: 'dashboard',
    title: 'Dashboard',
    icon: 'mdi-view-dashboard-outline',
    to: '/',
    matchPrefix: '/$',
  },
  {
    key: 'channels',
    title: 'Kênh Kết Nối',
    icon: 'mdi-transit-connection-variant',
    to: '/channels',
    resource: 'zalo_account',
  },
  {
    key: 'chat',
    title: 'Tin nhắn',
    icon: 'mdi-message-text-outline',
    to: '/chat',
    resource: 'conversation',
  },
  {
    key: 'contacts',
    title: 'Khách hàng',
    icon: 'mdi-account-outline',
    to: '/contacts',
    resource: 'contact',
  },
  {
    key: 'appointments',
    title: 'Lịch hẹn',
    icon: 'mdi-calendar-outline',
    to: '/appointments',
  },
  {
    key: 'media',
    title: 'Kho lưu trữ',
    icon: 'mdi-image-multiple-outline',
    to: '/media',
    resource: 'media',
  },
  {
    key: 'pos',
    title: 'Cửa hàng POS',
    icon: 'mdi-storefront-outline',
    to: '/pos',
    matchPrefix: '/pos',
  },
];

/** Dropdown "Báo cáo" — 7 màn + Phân tích nâng cao. */
export const adminReportsDropdown: MenuItemConfig[] = [
  { key: 'rpt-overview',   title: 'Tổng quan điều hành',     icon: 'mdi-view-dashboard-outline', to: '/reports/tong-quan' },
  { key: 'rpt-nick',       title: 'Vận hành Nick Zalo',      icon: 'mdi-cellphone-link',         to: '/reports/nick' },
  { key: 'rpt-sales',      title: 'Hiệu suất Sale & Team',   icon: 'mdi-account-tie-outline',    to: '/reports/sale' },
  { key: 'rpt-pipeline',   title: 'Pipeline & Lead Pool',    icon: 'mdi-filter-variant',         to: '/reports/pipeline',   eeOnly: true },
  { key: 'rpt-automation', title: 'Automation & Chăm sóc',   icon: 'mdi-cog-sync-outline',       to: '/reports/automation', eeOnly: true },
  { key: 'rpt-engagement', title: 'Engagement KH',           icon: 'mdi-fire',                   to: '/reports/engagement' },
  { key: 'rpt-audit',      title: 'Audit & Sức khỏe HT',    icon: 'mdi-shield-check-outline',   to: '/reports/audit' },
  { key: 'rpt-analytics',  title: 'Phân tích nâng cao',      icon: 'mdi-chart-line',             to: '/analytics', dividerBefore: true },
];

/** Dropdown "Cài đặt" — lối tắt hay dùng. */
export const adminSettingsShortcuts: MenuItemConfig[] = [
  { key: 'stg-profile',      title: 'Hồ sơ của tôi',      icon: 'mdi-account-outline',         to: '/settings/personal/profile' },
  { key: 'stg-users',        title: 'Nhân viên',           icon: 'mdi-account-group-outline',   to: '/settings/rbac/users',             resource: 'user' },
  { key: 'stg-permissions',  title: 'Phân quyền',          icon: 'mdi-shield-account-outline',  to: '/settings/rbac/permission-groups', resource: 'permission_group' },
  { key: 'stg-zalo',         title: 'Tài khoản Zalo',      icon: 'mdi-cellphone-link',          to: '/settings/channels/zalo',          resource: 'zalo_account', dividerBefore: true },
  { key: 'stg-tags',         title: 'Nhãn KH',             icon: 'mdi-tag-multiple-outline',    to: '/settings/crm/tags-v2',            resource: 'settings' },
  { key: 'stg-notifications',title: 'Thông báo hệ thống',  icon: 'mdi-bell-cog-outline',        to: '/settings/org/system-notifications',resource: 'settings' },
  { key: 'stg-all',          title: 'Xem tất cả cài đặt',  icon: 'mdi-cog-outline',             to: '/settings', dividerBefore: true },
];
