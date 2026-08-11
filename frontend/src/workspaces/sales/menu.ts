/**
 * Menu tối giản cho nhân viên kinh doanh, chỉ những trang cần dùng hàng ngày.
 * Ẩn hoàn toàn Dashboard quản lý, Báo cáo, Cài đặt hệ thống, Webhook, Lead Pool và RBAC.
 */

import type { MenuItemConfig } from '../types';

export const salesMenu: MenuItemConfig[] = [
  {
    key: 'sales-chat',
    title: 'Tin nhắn',
    icon: 'mdi-message-text-outline',
    materialIcon: 'inbox',
    to: '/sales-chat',
    matchPrefix: '/sales-chat',
    resource: 'conversation',
  },
  {
    key: 'appointments',
    title: 'Lịch hẹn',
    icon: 'mdi-calendar-outline',
    materialIcon: 'calendar_today',
    to: '/appointments',
  },
  {
    key: 'contacts',
    title: 'Khách hàng',
    icon: 'mdi-account-outline',
    materialIcon: 'groups',
    to: '/contacts',
    resource: 'contact',
  },
  {
    key: 'pos',
    title: 'Bán hàng',
    icon: 'mdi-storefront-outline',
    materialIcon: 'receipt_long',
    to: '/pos',
    matchPrefix: '/pos',
  },
  {
    key: 'media',
    title: 'Kho lưu trữ',
    icon: 'mdi-image-multiple-outline',
    materialIcon: 'auto_awesome',
    to: '/media',
    resource: 'media',
  },
];

/** Sales Workspace: dropdown Cài đặt cá nhân, rút gọn còn Hồ sơ và Đăng xuất. */
export const salesSettingsShortcuts: MenuItemConfig[] = [
  {
    key: 'personal-profile',
    title: 'Hồ sơ của tôi',
    icon: 'mdi-account-outline',
    to: '/settings/personal/profile',
  },
];
