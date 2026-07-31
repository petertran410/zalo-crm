/**
 * Sales Workspace — Menu Config
 * ──────────────────────────────
 * Giao diện TỐI GIẢN dành cho nhân viên kinh doanh.
 * Chỉ hiển thị các trang Sales cần hàng ngày:
 *   Hội thoại (Sales Chat) · Lịch hẹn · Khách hàng · Bạn bè · POS · Kho ảnh
 *
 * Ẩn hoàn toàn: Dashboard quản lý, Báo cáo 7 màn, Cài đặt hệ thống,
 *   Webhook, AI Assistant settings, Lead Pool rules, Phân quyền RBAC.
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
    title: 'Kho ảnh',
    icon: 'mdi-image-multiple-outline',
    materialIcon: 'auto_awesome',
    to: '/media',
    resource: 'media',
  },
];

/** Sales Workspace: dropdown Cài đặt cá nhân (rút gọn — chỉ Hồ sơ + Đăng xuất). */
export const salesSettingsShortcuts: MenuItemConfig[] = [
  {
    key: 'personal-profile',
    title: 'Hồ sơ của tôi',
    icon: 'mdi-account-outline',
    to: '/settings/personal/profile',
  },
];
