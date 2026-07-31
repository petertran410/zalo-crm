/**
 * Customer Care Workspace — Menu Config (STUB Phase 2)
 * ─────────────────────────────────────────────────────
 * Placeholder — sẽ hoàn thiện ở Phase 2.
 * Tạm dùng lại menu giống Sales + thêm /cs-chat thay /sales-chat.
 */

import type { MenuItemConfig } from '../types';

export const customerCareMenu: MenuItemConfig[] = [
  {
    key: 'cs-chat',
    title: 'Tin nhắn CS',
    icon: 'mdi-headset',
    to: '/cs-chat',
    matchPrefix: '/cs-chat',
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
];
