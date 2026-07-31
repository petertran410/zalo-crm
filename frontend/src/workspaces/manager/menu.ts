/**
 * Manager Workspace — Menu Config (STUB Phase 2)
 * ────────────────────────────────────────────────
 * Placeholder — sẽ hoàn thiện ở Phase 2.
 * Hiển thị: Dashboard, Báo cáo, Khách hàng, Team, Chat.
 */

import type { MenuItemConfig } from '../types';

export const managerMenu: MenuItemConfig[] = [
  {
    key: 'dashboard',
    title: 'Dashboard',
    icon: 'mdi-view-dashboard-outline',
    to: '/',
    matchPrefix: '/$',
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
    key: 'pos',
    title: 'Cửa hàng POS',
    icon: 'mdi-storefront-outline',
    to: '/pos',
    matchPrefix: '/pos',
  },
];

/** Dropdown Báo cáo cho Manager — giống Admin nhưng không có Phân tích nâng cao. */
export const managerReportsDropdown: MenuItemConfig[] = [
  { key: 'rpt-overview',   title: 'Tổng quan điều hành',   icon: 'mdi-view-dashboard-outline', to: '/reports/tong-quan' },
  { key: 'rpt-sales',      title: 'Hiệu suất Sale & Team', icon: 'mdi-account-tie-outline',    to: '/reports/sale' },
  { key: 'rpt-engagement', title: 'Engagement KH',         icon: 'mdi-fire',                   to: '/reports/engagement' },
];
