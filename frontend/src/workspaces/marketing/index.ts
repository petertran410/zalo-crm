/**
 * Marketing Workspace — STUB
 * TODO: Hoàn thiện khi cần. Hiện dùng DefaultLayout.
 */
import { defineAsyncComponent } from 'vue';
import type { WorkspaceConfig } from '../types';
import { marketingMenu } from './menu';

export const marketingWorkspace: WorkspaceConfig = {
  id: 'marketing',
  name: 'Marketing',
  description: 'Giao diện dành cho bộ phận Marketing',
  icon: 'mdi-bullhorn-outline',
  defaultRoute: '/marketing',
  // TODO: Tạo MarketingLayout.vue riêng nếu cần. Tạm dùng DefaultLayout.
  layoutComponent: defineAsyncComponent(() => import('@/layouts/DefaultLayout.vue')),
  menu: marketingMenu,
};
