/**
 * Manager Workspace — Config Export (STUB Phase 2)
 */

import { defineAsyncComponent } from 'vue';
import type { WorkspaceConfig } from '../types';
import { managerMenu, managerReportsDropdown } from './menu';

export const managerWorkspace: WorkspaceConfig = {
  id: 'manager',
  name: 'Quản lý',
  description: 'Giao diện dành cho trưởng/phó phòng',
  icon: 'mdi-account-supervisor-outline',
  defaultRoute: '/',
  // Phase 2: sẽ tạo ManagerLayout.vue riêng. Tạm dùng DefaultLayout (full admin).
  layoutComponent: defineAsyncComponent(() => import('@/layouts/DefaultLayout.vue')),
  menu: managerMenu,
  dropdownMenus: {
    reports: {
      label: 'Báo cáo',
      icon: 'mdi-chart-box-outline',
      resource: 'engagement_score',
      items: managerReportsDropdown,
    },
  },
};
