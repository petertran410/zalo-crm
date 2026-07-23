/**
 * Workspace-based Layout Architecture — Type Definitions
 * ──────────────────────────────────────────────────────────
 * Mỗi Workspace = 1 tập hợp (layout + menu + defaultRoute) dành cho 1 nhóm Role.
 * Business logic, component, API, state KHÔNG thuộc workspace — workspace chỉ
 * quyết định CÁCH TRÌNH BÀY (hiển thị menu nào, layout nào, default route nào).
 *
 * Mở rộng: thêm WorkspaceId literal + tạo thư mục workspace mới là đủ.
 */

import type { Component } from 'vue';

// ── Workspace ID ─────────────────────────────────────────────────────────────
/** Mã định danh Workspace — thêm literal khi mở rộng thêm bộ phận mới. */
export type WorkspaceId =
  | 'sales'
  | 'customer-care'
  | 'manager'
  | 'admin'
  // ── Stubs Phase 2+ — uncomment trong registry.ts khi hoàn thiện ──
  | 'marketing'
  | 'finance'
  | 'director'
  | 'warehouse'
  | 'call-center';

// ── Menu Config ──────────────────────────────────────────────────────────────
/** Cấu hình 1 mục menu (sidebar / topnav). Thiết kế dạng declarative config
 *  để sau này chỉ cần thêm/bớt JSON, không sửa Layout. */
export interface MenuItemConfig {
  /** Unique key — dùng cho `v-for :key` và tracking. */
  key: string;
  /** Nhãn hiển thị (VN). */
  title: string;
  /** Icon MDI — dạng `mdi-xxx-outline`. */
  icon: string;
  /** Google Material Symbols Outlined icon name (dùng cho Sales Glassmorphic layout). */
  materialIcon?: string;
  /** Route path — dạng absolute, vd `/chat`, `/settings/crm/tags`. */
  to: string;
  /** Prefix dùng để active-highlight (nếu khác `to`). Vd `/reports` match `/reports/*`. */
  matchPrefix?: string;
  /** RBAC resource — nếu user không có grant → ẩn menu item này. */
  resource?: string;
  /** RBAC action — mặc định 'access'. */
  action?: string;
  /** Badge count — reactive number (sẽ được bind từ composable bên ngoài). */
  badge?: number;
  /** Nhóm con (dropdown / sub-menu). */
  children?: MenuItemConfig[];
  /** Chỉ hiện trong edition mở rộng (EE). */
  eeOnly?: boolean;
  /** Divider trước mục này. */
  dividerBefore?: boolean;
}

// ── Workspace Config ─────────────────────────────────────────────────────────
/** Cấu hình đầy đủ của 1 Workspace. */
export interface WorkspaceConfig {
  /** ID workspace. */
  id: WorkspaceId;
  /** Tên hiển thị (VN). */
  name: string;
  /** Mô tả ngắn — hiện trong Workspace Switcher tooltip. */
  description: string;
  /** Icon đại diện — dùng trong Workspace Switcher. */
  icon: string;
  /** Route mặc định khi đăng nhập / chuyển workspace. */
  defaultRoute: string;
  /** Vue component Layout tương ứng (lazy import). */
  layoutComponent: Component;
  /** Menu items — topnav / sidebar tuỳ layout render. */
  menu: MenuItemConfig[];
  /**
   * Menu dropdown phụ (Báo cáo, Cài đặt, …).
   * Key = tên dropdown (vd 'reports', 'settings').
   */
  dropdownMenus?: Record<string, {
    label: string;
    icon: string;
    resource?: string;
    items: MenuItemConfig[];
  }>;
}
