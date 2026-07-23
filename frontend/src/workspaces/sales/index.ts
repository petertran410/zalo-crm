/**
 * Sales Workspace — Config Export
 */

import { defineAsyncComponent } from 'vue';
import type { WorkspaceConfig } from '../types';
import { salesMenu, salesSettingsShortcuts } from './menu';

export const salesWorkspace: WorkspaceConfig = {
  id: 'sales',
  name: 'Sales',
  description: 'Giao diện tối ưu cho nhân viên kinh doanh',
  icon: 'mdi-account-tie-outline',
  defaultRoute: '/sales-chat',
  layoutComponent: defineAsyncComponent(() => import('@/layouts/SalesLayout.vue')),
  menu: salesMenu,
  dropdownMenus: {
    settings: {
      label: 'Cài đặt',
      icon: 'mdi-cog-outline',
      items: salesSettingsShortcuts,
    },
  },
};
