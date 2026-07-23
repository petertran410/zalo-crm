/**
 * Warehouse Workspace — STUB
 * TODO: Hoàn thiện khi cần.
 */
import { defineAsyncComponent } from 'vue';
import type { WorkspaceConfig } from '../types';
import { warehouseMenu } from './menu';

export const warehouseWorkspace: WorkspaceConfig = {
  id: 'warehouse',
  name: 'Kho vận',
  description: 'Giao diện dành cho bộ phận Kho vận / Logistics',
  icon: 'mdi-warehouse',
  defaultRoute: '/pos/products',
  layoutComponent: defineAsyncComponent(() => import('@/layouts/SalesLayout.vue')),
  menu: warehouseMenu,
};
