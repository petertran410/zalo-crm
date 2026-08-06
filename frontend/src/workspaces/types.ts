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

/**
 * Workspace NGỪNG DÙNG — chốt 2026-08-06 (song song với DEPRECATED_GROUP_NAMES
 * ở constants/permission-meta.ts).
 *
 * Kế hoạch chỉ còn 4 vai trò → chỉ cần 3 workspace: 'admin' (Admin + CEO),
 * 'sales' (Sale), 'customer-care' (CSKH).
 *
 * 5 cái dưới đây đều là STUB menu rỗng, chưa ai dùng thật. Giữ nguyên code +
 * registry để bật lại dễ; chỉ ẩn khỏi Workspace Switcher cho gọn.
 *
 * GIỮ LẠI 'manager' (KHÔNG ngừng dùng) dù nhóm "Trưởng phòng" đã ngừng: resolver
 * vẫn route deptRole = leader/deputy về workspace này, mà phòng ban thì còn dùng.
 */
export const DEPRECATED_WORKSPACE_IDS: readonly WorkspaceId[] = [
  'marketing',
  'finance',
  'director',
  'warehouse',
  'call-center',
];

export function isDeprecatedWorkspace(id: WorkspaceId | string): boolean {
  return (DEPRECATED_WORKSPACE_IDS as readonly string[]).includes(id);
}

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
