/**
 * Customer Care Workspace — Menu Config
 * ─────────────────────────────────────────────────────
 * Menu đầy đủ cho bộ phận Chăm sóc khách hàng:
 * Trang chủ điều phối, Tin nhắn CS, Lịch hẹn, Khách hàng, Bán hàng (POS), Kho lưu trữ.
 */

import type { MenuItemConfig } from '../types';

export const customerCareMenu: MenuItemConfig[] = [
  {
    key: 'cs-home',
    title: 'Trang chủ',
    icon: 'mdi-home-outline',
    materialIcon: 'home',
    to: '/cs-home',
    matchPrefix: '/cs-home',
    resource: 'conversation',
  },
  {
    key: 'cs-chat',
    title: 'Tin nhắn CS',
    icon: 'mdi-headset',
    materialIcon: 'inbox',
    to: '/cs-chat',
    matchPrefix: '/cs-chat',
    resource: 'conversation',
  },
  {
    key: 'appointments',
    title: 'Lịch hẹn',
    icon: 'mdi-calendar-outline',
    materialIcon: 'calendar_today',
    to: '/appointments',
    resource: 'appointment',
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
