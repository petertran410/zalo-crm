/**
 * Call Center Workspace — STUB
 * TODO: Hoàn thiện khi cần.
 */
import { defineAsyncComponent } from 'vue';
import type { WorkspaceConfig } from '../types';
import { callCenterMenu } from './menu';

export const callCenterWorkspace: WorkspaceConfig = {
  id: 'call-center',
  name: 'Tổng đài',
  description: 'Giao diện dành cho bộ phận Tổng đài / Call Center',
  icon: 'mdi-phone-in-talk-outline',
  defaultRoute: '/chat',
  layoutComponent: defineAsyncComponent(() => import('@/layouts/SalesLayout.vue')),
  menu: callCenterMenu,
};
