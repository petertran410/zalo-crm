/**
 * Director Workspace — STUB
 * TODO: Hoàn thiện khi cần.
 */
import { defineAsyncComponent } from 'vue';
import type { WorkspaceConfig } from '../types';
import { directorMenu } from './menu';

export const directorWorkspace: WorkspaceConfig = {
  id: 'director',
  name: 'Ban Giám đốc',
  description: 'Giao diện tổng quan dành cho CEO / Ban Giám đốc',
  icon: 'mdi-briefcase-outline',
  defaultRoute: '/',
  layoutComponent: defineAsyncComponent(() => import('@/layouts/DefaultLayout.vue')),
  menu: directorMenu,
};
