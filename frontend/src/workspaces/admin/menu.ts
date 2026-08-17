/**
 * Menu đầy đủ cho Owner và Admin.
 *
 * FILE NÀY KHÔNG ĐƯỢC DÙNG ĐỂ RENDER NAV: chỉ SalesLayout đọc activeConfig.menu, còn
 * DefaultLayout dựng nav từ mảng primaryTabs hardcode bên trong nó, nên nội dung dưới
 * đây đã trôi khỏi nav thật.
 *
 * Đừng chuyển DefaultLayout sang đọc file này khi chưa điền menu cho cả 6 workspace kia:
 * hiện tất cả dùng chung primaryTabs, chuyển sang menu riêng sẽ làm chúng mất Dashboard
 * và Tin nhắn.
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

/** Dropdown "Cài đặt": lối tắt hay dùng. */
export const adminSettingsShortcuts: MenuItemConfig[] = [
  { key: 'stg-profile',      title: 'Hồ sơ của tôi',      icon: 'mdi-account-outline',         to: '/settings/personal/profile' },
  { key: 'stg-users',        title: 'Nhân viên',           icon: 'mdi-account-group-outline',   to: '/settings/rbac/users',             resource: 'user' },
  { key: 'stg-permissions',  title: 'Phân quyền',          icon: 'mdi-shield-account-outline',  to: '/settings/rbac/permission-groups', resource: 'permission_group' },
  { key: 'stg-zalo',         title: 'Tài khoản Zalo',      icon: 'mdi-cellphone-link',          to: '/settings/channels/zalo',          resource: 'zalo_account', dividerBefore: true },
  { key: 'stg-tags',         title: 'Nhãn khách hàng',     icon: 'mdi-tag-multiple-outline',    to: '/settings/crm/tags-v2',            resource: 'settings' },
  { key: 'stg-all',          title: 'Xem tất cả cài đặt',  icon: 'mdi-cog-outline',             to: '/settings', dividerBefore: true },
];
