/**
 * Finance Workspace — STUB
 * TODO: Hoàn thiện khi cần.
 */
import { defineAsyncComponent } from 'vue';
import type { WorkspaceConfig } from '../types';
import { financeMenu } from './menu';

export const financeWorkspace: WorkspaceConfig = {
  id: 'finance',
  name: 'Tài chính',
  description: 'Giao diện dành cho bộ phận Tài chính / Kế toán',
  icon: 'mdi-cash-multiple',
  defaultRoute: '/',
  layoutComponent: defineAsyncComponent(() => import('@/layouts/DefaultLayout.vue')),
  menu: financeMenu,
};
