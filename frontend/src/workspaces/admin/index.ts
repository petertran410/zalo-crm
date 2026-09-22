/**
 * Admin Workspace — Config Export
 */

import { defineAsyncComponent } from 'vue';
import type { WorkspaceConfig } from '../types';
import { adminMenu, adminSettingsShortcuts } from './menu';

export const adminWorkspace: WorkspaceConfig = {
  id: 'admin',
  name: 'Admin',
  description: 'Giao diện quản trị toàn bộ hệ thống',
  icon: 'mdi-shield-crown-outline',
  defaultRoute: '/',
  // Admin dùng lại DefaultLayout.vue hiện tại — không sửa, không tạo mới.
  layoutComponent: defineAsyncComponent(() => import('@/layouts/DefaultLayout.vue')),
  menu: adminMenu,
  dropdownMenus: {
    settings: {
      label: 'Cài đặt',
      icon: 'mdi-cog-outline',
      items: adminSettingsShortcuts,
    },
  },
};
