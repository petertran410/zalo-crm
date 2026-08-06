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
  appointment:      { icon: '📅', label: 'Lịch hẹn' },
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

/**
 * Nhóm quyền NGỪNG DÙNG — chốt 2026-08-06.
 *
 * Kế hoạch chỉ dùng 4 vai trò: Admin · CEO · Sale · Chăm sóc khách hàng.
 * 4 tên dưới đây giữ lại phòng khi cần, nhưng không seed cho org mới và UI ẩn
 * mặc định. PHẢI khớp DEPRECATED_GROUP_NAMES ở backend permission-types.ts —
 * lệch nhau thì màn này ẩn một đằng, backend seed một nẻo.
 */
export const DEPRECATED_GROUP_NAMES: readonly string[] = [
  'Trưởng phòng',
  'Sale Senior',
  'Marketing',
  'Hành chính - Nhân sự',
];

export function isDeprecatedGroup(name: string | null | undefined): boolean {
  return !!name && DEPRECATED_GROUP_NAMES.includes(name);
}

/**
 * Icon cho từng hành động — 2026-08-06.
 *
 * Vì sao KHÔNG dùng chữ cái: bảng so sánh cũ hiện A/C/E/D/V = chữ đầu tiếng ANH
 * (Access, Create, Edit, Delete, View all) → người Việt phải học thuộc mới đọc
 * được. Mà dịch sang chữ đầu tiếng Việt thì ĐỤNG NHAU:
 *   Truy cập / Thêm mới  → đều 'T'
 *   Xóa     / Xem tất cả → đều 'X'
 * Nên bỏ hẳn lối mã hoá bằng chữ cái, dùng icon (không phụ thuộc ngôn ngữ) +
 * nhãn tiếng Việt đầy đủ khi rê chuột.
 */
export const ACTION_ICON: Record<string, string> = {
  access: '👁',
  create: '➕',
  edit: '✏️',
  delete: '🗑',
  view_all: '🌐',
};
export function actionIcon(a: string): string {
  return ACTION_ICON[a] ?? '•';
}

/**
 * Gộp danh sách hành động đã cấp thành MỘT nhãn tiếng Việt đọc phát hiểu ngay.
 * Dùng cho chế độ "Rút gọn" của bảng So sánh nhóm quyền — admin cần trả lời
 * "nhóm này làm được gì với Khách hàng?" chứ không cần đọc từng ô tick.
 *
 * `validActions` = các hành động resource đó HỖ TRỢ (RESOURCE_ACTIONS), để phân
 * biệt "toàn quyền" thật với "được hết những gì có thể" — vd Engagement chỉ có
 * access + view_all thì cấp cả 2 đã là toàn quyền.
 */
export interface GrantSummary {
  /** Nhãn ngắn hiển thị trong ô. */
  label: string;
  /** Mức độ, dùng để tô màu: none < view < edit < full. */
  level: 'none' | 'view' | 'edit' | 'full';
  /** Có quyền xem dữ liệu của người khác không (view_all). */
  viewAll: boolean;
}

export function summarizeGrants(granted: string[], validActions: string[]): GrantSummary {
  const has = (a: string) => granted.includes(a);
  const viewAll = has('view_all');
  if (granted.length === 0) return { label: 'Không có', level: 'none', viewAll: false };

  // Các hành động "ghi" mà resource này hỗ trợ
  const writes = ['create', 'edit', 'delete'].filter((a) => validActions.includes(a));
  const hasAllWrites = writes.length > 0 && writes.every(has);

  let label: string;
  let level: GrantSummary['level'];
  if (hasAllWrites) {
    label = 'Toàn quyền';
    level = 'full';
  } else if (has('edit') || has('create')) {
    // Liệt kê đúng việc làm được, tránh nói quá
    const parts: string[] = [];
    if (has('create')) parts.push('Thêm');
    if (has('edit')) parts.push('Sửa');
    if (has('delete')) parts.push('Xóa');
    label = parts.join(' · ');
    level = 'edit';
  } else if (has('delete')) {
    label = 'Xóa';
    level = 'edit';
  } else {
    label = 'Chỉ xem';
    level = 'view';
  }
  return { label, level, viewAll };
}

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
