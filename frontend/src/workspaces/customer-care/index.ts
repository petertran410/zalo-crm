/**
 * Customer Care Workspace — Config Export (STUB Phase 2)
 */

import { defineAsyncComponent } from 'vue';
import type { WorkspaceConfig } from '../types';
import { customerCareMenu } from './menu';

export const customerCareWorkspace: WorkspaceConfig = {
  id: 'customer-care',
  name: 'Chăm sóc KH',
  description: 'Giao diện dành cho bộ phận chăm sóc khách hàng',
  icon: 'mdi-headset',
  defaultRoute: '/cs-chat',
  // Phase 2: sẽ tạo CsLayout.vue riêng. Tạm dùng SalesLayout (giao diện gọn nhẹ tương tự).
  layoutComponent: defineAsyncComponent(() => import('@/layouts/SalesLayout.vue')),
  menu: customerCareMenu,
};
