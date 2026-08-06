/**
 * permission-types.ts — Resource × Action matrix định nghĩa
 *
 * Reference: GetflyCRM screenshot (matrix 7 cột × 15 resource).
 * Lock 2026-05-21 trong design doc thanh-rbac-m2-design-20260521.md.
 */

// 5 action columns. 'approve'/'pay' (Getfly) đã gỡ 2026-06-20: không có quy trình
// duyệt/thanh toán trong Hi-CRM nên 2 cột đó chỉ là ô tick vô tác dụng.
export const ACTIONS = [
  'access',       // Truy cập
  'create',       // Thêm mới
  'edit',         // Chỉnh sửa
  'delete',       // Xóa
  'view_all',     // Xem tất cả — KEY FLAG bypass dept scope
] as const;
export type Action = (typeof ACTIONS)[number];

// 18 resources, GOM THEO NHÓM MÀN HÌNH (2026-06-20) để ma trận phân quyền đọc theo
// menu — admin gán quyền dễ hơn. Thứ tự ở đây = thứ tự cột dọc trong UI ma trận.
export const RESOURCES = [
  // ── Hệ thống & tổ chức (menu Cài đặt / Phân quyền) ──
  'department',         // Quản lý phòng ban   → /settings/rbac/departments
  'user',               // Quản lý người dùng  → /settings/rbac/users
  'permission_group',   // Quản lý quyền       → /settings/rbac/permission-groups
  'settings',           // Cài đặt chung       → /settings/* (org, crm, channels...)
  'audit_log',          // Nhật ký hành động   → /settings/org/audit
  // ── Khách hàng & hội thoại (menu chính) ──
  'contact',            // Khách hàng          → /contacts
  'friend',             // Bạn bè (Zalo)       → /friends
  'conversation',       // Tin nhắn / Hội thoại→ /chat
  'customer_list',      // Tệp khách hàng      → /marketing/lists
  // 2026-08-06 — Lịch hẹn TỪNG không có resource RBAC nào: quyền xem chỉ suy từ
  // owner/admin + contact-scope, nên "cho anh A xem lịch của người khác" không
  // diễn tả được. Thêm resource để cấp lẻ qua customGrants.
  //   access   = vào màn Lịch hẹn
  //   view_all = xem lịch của NGƯỜI KHÁC (bỏ giới hạn chỉ-lịch-của-mình)
  'appointment',        // Lịch hẹn            → /appointments
  // ── Marketing / Tự động hoá (menu Marketing) ──
  'trigger',            // Mục tiêu / Trigger  → /marketing/triggers
  'sequence',           // Sequence            → /marketing/sequences
  'broadcast',          // Chiến dịch          → /marketing/broadcasts
  'block',              // Message Block       → /marketing/blocks
  'care_session',       // Phiên chăm sóc      → /marketing/care-sessions
  // ── Kênh & tài nguyên ──
  'zalo_account',       // Nick Zalo           → /settings/channels/zalo
  'media',              // Kho phương tiện     → /media
  'webhook',            // Webhook / API key   → /settings/dev/api
  // ── Báo cáo ──
  'engagement_score',   // Engagement + Score  → /reports
] as const;
export type Resource = (typeof RESOURCES)[number];

// Mỗi resource declare actions hợp lệ (subset của ACTIONS).
// Vd Engagement không có "create/edit/delete" — chỉ computed.
export const RESOURCE_ACTIONS: Record<Resource, readonly Action[]> = {
  department: ['access', 'create', 'edit', 'delete'],
  user: ['access', 'create', 'edit', 'delete'],
  permission_group: ['access', 'create', 'edit', 'delete'],
  conversation: ['access', 'edit', 'delete', 'view_all'],
  contact: ['access', 'create', 'edit', 'delete', 'view_all'],
  friend: ['access', 'create', 'edit', 'delete', 'view_all'],
  customer_list: ['access', 'create', 'edit', 'delete', 'view_all'],
  broadcast: ['access', 'create', 'edit', 'delete', 'view_all'],
  sequence: ['access', 'create', 'edit', 'delete', 'view_all'],
  trigger: ['access', 'create', 'edit', 'delete', 'view_all'],
  block: ['access', 'create', 'edit', 'delete', 'view_all'],
  zalo_account: ['access', 'create', 'edit', 'delete', 'view_all'],
  webhook: ['access', 'create', 'edit', 'delete'],
  engagement_score: ['access', 'view_all'],
  audit_log: ['access', 'view_all'],
  settings: ['access', 'create', 'edit'],
  // Phiên chăm sóc — access=xem phiên mình, view_all=xem cả org (scope theo dept tree).
  care_session: ['access', 'view_all'],
  // Lịch hẹn — CRUD vẫn theo chủ sở hữu (canMutateAppointment), RBAC chỉ quyết
  // định XEM: access = vào màn, view_all = thấy lịch người khác.
  appointment: ['access', 'view_all'],
  // Kho phương tiện — access=xem/dùng kho, create=tải lên/lưu, edit=sửa quyền/tag/watermark,
  // delete=archive, view_all=xem cả org bỏ qua scope owner (admin/marketing).
  media: ['access', 'create', 'edit', 'delete', 'view_all'],
};

// JSON shape lưu trong permission_groups.grants:
//   { "<resource>": { "<action>": boolean } }
// Vd:
//   { "conversation": { "access": true, "view_all": true, "edit": true } }
export type GrantsJson = {
  [R in Resource]?: {
    [A in Action]?: boolean;
  };
};

/**
 * Check 1 action có grant không.
 * Default deny (return false nếu thiếu).
 */
export function hasGrant(grants: GrantsJson, resource: Resource, action: Action): boolean {
  return grants?.[resource]?.[action] === true;
}

/**
 * Đọc grant 3 TRẠNG THÁI (2026-08-06) — dùng cho customGrants của từng user:
 *   true      = CHO PHÉP tường minh
 *   false     = TỪ CHỐI tường minh (đè lên quyền của nhóm)
 *   undefined = không có ý kiến → kế thừa nhóm quyền
 *
 * hasGrant() ở trên chỉ 2 trạng thái (true / không-true) nên KHÔNG diễn tả được
 * "gỡ 1 quyền của riêng 1 người". Giữ hasGrant cho grants của NHÓM (nhóm không
 * cần deny — không tick là không có), dùng resolveGrant cho customGrants.
 */
export function resolveGrant(
  grants: GrantsJson | null | undefined,
  resource: Resource,
  action: Action,
): boolean | undefined {
  const v = grants?.[resource]?.[action];
  return typeof v === 'boolean' ? v : undefined;
}

/**
 * Validate grants JSON từ user input — strip mọi key không nằm trong whitelist.
 * Tránh injection: grants.adminBackdoor = true sẽ bị strip.
 */
export function sanitizeGrants(input: unknown): GrantsJson {
  if (!input || typeof input !== 'object') return {};
  const result: GrantsJson = {};
  for (const [r, actions] of Object.entries(input as Record<string, unknown>)) {
    if (!RESOURCES.includes(r as Resource)) continue;
    if (!actions || typeof actions !== 'object') continue;
    const validActions = RESOURCE_ACTIONS[r as Resource];
    const cleanActions: Record<string, boolean> = {};
    for (const [a, v] of Object.entries(actions as Record<string, unknown>)) {
      if (!validActions.includes(a as Action)) continue;
      if (typeof v === 'boolean') cleanActions[a] = v;
    }
    if (Object.keys(cleanActions).length > 0) {
      result[r as Resource] = cleanActions as any;
    }
  }
  return result;
}

// ════════════════════════════════════════════════════════════════════════
// DEFAULT PERMISSION GROUPS (system, ship khi migration D13)
// 7 group anh chốt trong design doc.
// ════════════════════════════════════════════════════════════════════════

function fullCrud(resource: Resource): GrantsJson[Resource] {
  const actions: any = {};
  for (const a of RESOURCE_ACTIONS[resource]) actions[a] = true;
  return actions;
}

function readOnly(resource: Resource): GrantsJson[Resource] {
  return { access: true };
}

function viewAll(resource: Resource): GrantsJson[Resource] {
  return { access: true, view_all: true };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PHẠM VI VAI TRÒ — chốt 2026-08-06
 * ════════════════════════════════════════════════════════════════════════════
 * Kế hoạch chỉ dùng 4 vai trò: Admin · CEO (chủ tổ chức) · Sale · Chăm sóc khách hàng.
 *
 * 4 nhóm còn lại (Trưởng phòng, Sale Senior, Marketing, Hành chính - Nhân sự)
 * NGỪNG DÙNG chứ KHÔNG XOÁ — có thể cần lại. Cách làm:
 *   - Giữ nguyên định nghĩa grants bên dưới (không mất công định nghĩa lại).
 *   - KHÔNG seed vào org mới nữa (seedDefaultPermissionGroups bỏ qua).
 *   - Org cũ đã có thì GIỮ NGUYÊN, chạy y như trước — không đụng dữ liệu, không
 *     ai mất quyền. Hiện tại cả 4 nhóm này đều có 0 user.
 *   - UI gắn nhãn "Ngừng dùng" và ẩn mặc định.
 *
 * BẬT LẠI: xoá tên khỏi DEPRECATED_GROUP_NAMES là xong, không cần migration.
 *
 * CỐ Ý không dùng archivedAt để "ẩn": archive làm userHasGrant coi như nhóm
 * không còn quyền → ai đang ở trong nhóm sẽ mất sạch quyền; archivePermissionGroup
 * cũng chặn thẳng nhóm hệ thống.
 */
export const DEPRECATED_GROUP_NAMES: readonly string[] = [
  'Trưởng phòng',
  'Sale Senior',
  'Marketing',
  'Hành chính - Nhân sự',
];

export function isDeprecatedGroup(name: string): boolean {
  return DEPRECATED_GROUP_NAMES.includes(name);
}

/**
 * Default groups. Migration D13 sẽ tạo các group này với is_system=true.
 * Admin → full mọi resource × mọi action.
 * Marketing → anh chốt A: contact.view_all=true (Zalo test loop 2026-05-21 13:25).
 * Workspace 2026-07-22: kèm workspaceId để frontend resolver đọc chính xác.
 * 2026-08-06: thêm cờ `deprecated` — xem khối PHẠM VI VAI TRÒ ở trên.
 */
export const DEFAULT_PERMISSION_GROUPS: Array<{
  name: string;
  deprecated?: boolean;
  isSystem: boolean;
  workspaceId: string;
  grants: GrantsJson;
}> = [
  {
    name: 'Admin',
    isSystem: true,
    workspaceId: 'admin',
    grants: Object.fromEntries(
      RESOURCES.map((r) => [r, fullCrud(r)])
    ) as GrantsJson,
  },
  {
    name: 'CEO',
    isSystem: true,
    workspaceId: 'admin',
    grants: {
      // CEO xem mọi resource business, không sửa permission/department/user
      department: { access: true },
      user: { access: true },
      permission_group: { access: true },
      conversation: viewAll('conversation'),
      contact: viewAll('contact'),
      friend: viewAll('friend'),
      customer_list: { access: true, view_all: true, create: true, edit: true },
      broadcast: { access: true, view_all: true, create: true, edit: true },
      sequence: { access: true, view_all: true, create: true, edit: true },
      trigger: viewAll('trigger'),
      block: viewAll('block'),
      zalo_account: viewAll('zalo_account'),
      engagement_score: viewAll('engagement_score'),
      audit_log: viewAll('audit_log'),
      settings: { access: true },
      media: viewAll('media'), // xem cả kho org
    } as GrantsJson,
  },
  {
    name: 'Trưởng phòng',
    deprecated: true, // 2026-08-06 — ngoài 4 vai trò dùng tiếp; giữ để bật lại
    isSystem: true,
    workspaceId: 'manager',
    grants: {
      // Manager full CRUD trong scope dept + sub-depts (view_all = false vì scope dept tree, không phải global)
      department: { access: true },
      user: { access: true },
      conversation: { access: true, edit: true, delete: true, view_all: true }, // view_all trong scope dept
      contact: fullCrud('contact'),
      friend: fullCrud('friend'),
      customer_list: { access: true, create: true, edit: true, delete: true, view_all: true },
      broadcast: { access: true, create: true, edit: true, delete: true, view_all: true },
      sequence: { access: true, create: true, edit: true, view_all: true },
      trigger: { access: true, create: true, edit: true, view_all: true },
      block: { access: true, create: true, edit: true, delete: true, view_all: true },
      zalo_account: { access: true, view_all: true },
      engagement_score: viewAll('engagement_score'),
      audit_log: { access: true },
      settings: { access: true },
      media: { access: true, create: true, edit: true, delete: true, view_all: true }, // full trong scope dept
    } as GrantsJson,
  },
  {
    name: 'Sale Senior',
    deprecated: true, // 2026-08-06 — gộp về Sale; giữ định nghĩa để bật lại
    isSystem: true,
    workspaceId: 'sales',
    grants: {
      // Sale Senior CRUD KH + Conversation của mình, có Xóa
      conversation: { access: true, edit: true, delete: true },
      contact: { access: true, create: true, edit: true, delete: true },
      friend: { access: true, create: true, edit: true },
      customer_list: { access: true, create: true, edit: true },
      broadcast: { access: true, create: true, edit: true },
      sequence: { access: true, create: true, edit: true },
      trigger: { access: true },
      block: { access: true, create: true, edit: true },
      zalo_account: { access: true },
      engagement_score: { access: true },
      audit_log: { access: true },
      media: { access: true, create: true, edit: true }, // kho của mình (scope owner)
    } as GrantsJson,
  },
  {
    name: 'Sale',
    isSystem: true,
    workspaceId: 'sales',
    grants: {
      // Sale CR KH của mình, không Xóa Conversation
      conversation: { access: true, edit: true },
      contact: { access: true, create: true, edit: true },
      friend: { access: true, create: true, edit: true },
      customer_list: { access: true },
      broadcast: { access: true },
      sequence: { access: true },
      trigger: { access: true },
      block: { access: true },
      // 2026-06-09 (Anh chốt): sale tự kết nối nick mới + xóa MỀM nick CỦA MÌNH.
      // Ownership check ở requireAccountManagement đảm bảo chỉ đụng nick mình owner.
      zalo_account: { access: true, create: true, delete: true },
      engagement_score: { access: true },
      media: { access: true, create: true, edit: true }, // kho của mình (scope owner) — sale dùng nhiều nhất
    } as GrantsJson,
  },
  {
    // 2026-08-06 — 1 trong 4 vai trò dùng tiếp, TRƯỚC GIỜ CHƯA CÓ NHÓM QUYỀN.
    // Workspace 'customer-care' đã dựng sẵn (menu Tin nhắn CS / Khách hàng / Lịch hẹn)
    // nhưng không nhóm nào trỏ tới → chỉ vào được bằng cách đoán tên nhóm chứa "CS"
    // trong resolver. Có nhóm này rồi thì workspaceId quyết định thẳng, hết đoán.
    //
    // Grants khởi điểm = Y HỆT Sale + care_session (màn "Phiên chăm sóc" vốn chỉ
    // Admin có, mà CS mới đúng là người dùng nó). CỐ Ý không sáng tác thêm — anh
    // chốt lại bộ quyền CS sau, cùng đợt sửa hardcode các vai trò.
    name: 'Chăm sóc khách hàng',
    isSystem: true,
    workspaceId: 'customer-care',
    grants: {
      conversation: { access: true, edit: true },
      contact: { access: true, create: true, edit: true },
      friend: { access: true, create: true, edit: true },
      customer_list: { access: true },
      broadcast: { access: true },
      sequence: { access: true },
      trigger: { access: true },
      block: { access: true },
      zalo_account: { access: true, create: true, delete: true },
      engagement_score: { access: true },
      media: { access: true, create: true, edit: true },
      // Riêng CS: phiên chăm sóc + lịch hẹn (xem màn, chưa mở "xem của người khác")
      care_session: { access: true },
      appointment: { access: true },
    } as GrantsJson,
  },
  {
    name: 'Marketing',
    deprecated: true, // 2026-08-06 — ngoài 4 vai trò dùng tiếp; giữ để bật lại
    isSystem: true,
    workspaceId: 'marketing',
    grants: {
      // Marketing CRUD Broadcast/Sequence/Trigger/Block, view_all Contact (anh chốt A 2026-05-21 13:25)
      contact: { access: true, view_all: true },
      friend: { access: true, view_all: true },
      customer_list: { access: true, create: true, edit: true, view_all: true },
      broadcast: { access: true, create: true, edit: true, delete: true, view_all: true },
      sequence: { access: true, create: true, edit: true, delete: true, view_all: true },
      trigger: { access: true, create: true, edit: true, delete: true, view_all: true },
      block: { access: true, create: true, edit: true, delete: true, view_all: true },
      engagement_score: viewAll('engagement_score'),
      audit_log: { access: true },
      media: { access: true, create: true, edit: true, delete: true, view_all: true }, // tài sản marketing dùng chung
    } as GrantsJson,
  },
  {
    name: 'Hành chính - Nhân sự',
    deprecated: true, // 2026-08-06 — ngoài 4 vai trò dùng tiếp; giữ để bật lại
    isSystem: true,
    workspaceId: 'admin',
    grants: {
      // HC-NS view-only User + report, không access Conversation/Contact content
      user: { access: true, create: true, edit: true },
      department: { access: true },
      engagement_score: { access: true },
      audit_log: { access: true, view_all: true },
      settings: { access: true },
    } as GrantsJson,
  },
];
