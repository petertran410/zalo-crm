/**
 * Customer Care Workspace — Config Export
 */

import { defineAsyncComponent } from 'vue';
import type { WorkspaceConfig } from '../types';
import { customerCareMenu } from './menu';

export const customerCareWorkspace: WorkspaceConfig = {
  id: 'customer-care',
  name: 'Chăm sóc KH',
  description: 'Giao diện dành cho bộ phận chăm sóc khách hàng',
  icon: 'mdi-headset',
  defaultRoute: '/cs-home',
  layoutComponent: defineAsyncComponent(() => import('@/layouts/CsLayout.vue')),
  menu: customerCareMenu,
  themeClass: 'cskh-theme',
};
