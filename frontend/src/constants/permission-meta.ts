/**
 * permission-meta.ts — Single source of truth cho label + icon của
 * RBAC resource × action matrix.
 *
 * Dùng chung bởi:
 *   - views/rbac/PermissionGroupsView.vue
 *   - views/rbac/NetworkPermissionView.vue
 *   - components/rbac/PermissionGroupEditPanel.vue
 *
 * AUDIT action labels (user.handoff, user.reset_password...) ở AuditLogView
 * là DOMAIN KHÁC, KHÔNG gộp vào đây.
 *
 * ĐỒNG BỘ: Khi thêm resource mới vào backend permission-types.ts, phải
 * thêm vào RESOURCE_META bên dưới — nếu không UI sẽ hiển thị raw key.
 */
export interface ResourceMeta {
  icon: string;
  label: string;
}

export interface ActionMeta {
  label: string;
  shortLabel: string;
}

export const RESOURCE_META: Record<string, ResourceMeta> = {
  // ── Hệ thống & tổ chức ──
  department:       { icon: '🏢', label: 'Phòng ban' },
  user:             { icon: '👤', label: 'Người dùng' },
  permission_group: { icon: '🛡', label: 'Nhóm quyền' },
  settings:         { icon: '⚙',  label: 'Cài đặt' },
  audit_log:        { icon: '📜', label: 'Audit Log' },
  // ── Khách hàng & hội thoại ──
  contact:          { icon: '👥', label: 'Khách hàng' },
  friend:           { icon: '🫂', label: 'Bạn bè Zalo' },
  conversation:     { icon: '💬', label: 'Hội thoại' },
  customer_list:    { icon: '📋', label: 'Tệp khách hàng' },
  // ── Marketing / Tự động hoá ──
  trigger:          { icon: '⚡', label: 'Trigger' },
  sequence:         { icon: '🔁', label: 'Sequence' },
  broadcast:        { icon: '📢', label: 'Chiến dịch' },
  block:            { icon: '🧱', label: 'Message Block' },
  care_session:     { icon: '🩺', label: 'Phiên chăm sóc' },
  // ── Kênh & tài nguyên ──
  zalo_account:     { icon: '🟢', label: 'Nick Zalo' },
  media:            { icon: '🖼', label: 'Kho phương tiện' },
  webhook:          { icon: '🔌', label: 'Webhook' },
  // ── Báo cáo ──
  engagement_score: { icon: '📊', label: 'Engagement / Score' },
};

export const ACTION_META: Record<string, ActionMeta> = {
  access:   { label: 'Truy cập',    shortLabel: 'Acc'  },
  create:   { label: 'Thêm mới',    shortLabel: 'Add'  },
  edit:     { label: 'Chỉnh sửa',   shortLabel: 'Edit' },
  delete:   { label: 'Xóa',         shortLabel: 'Del'  },
  view_all: { label: 'Xem tất cả',  shortLabel: 'All'  },
};

// ─── Drop-in helpers ─────────────────────────────────────────────
// Call-site không cần đổi syntax; fallback về raw key cho safety.
export function resourceLabel(r: string): string {
  return RESOURCE_META[r]?.label ?? r;
}
export function resourceIcon(r: string): string {
  return RESOURCE_META[r]?.icon ?? '•';
}
export function actionLabel(a: string): string {
  return ACTION_META[a]?.label ?? a;
}
export function actionLabelShort(a: string): string {
  return ACTION_META[a]?.shortLabel ?? a;
}
