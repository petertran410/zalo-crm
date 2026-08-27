/**
 * stores/rbac.ts — Pinia store cho RBAC (Department + PermissionGroup + Users).
 *
 * Endpoints:
 *   GET /departments                  → tree (root nodes với children)
 *   GET /permission-groups            → tree
 *   GET /permission-groups/meta       → resources + actions matrix shape
 *   GET /rbac/users                   → list (filter ?departmentId= ?permissionGroupId= ?q=)
 *   POST /admin/rbac/seed-default-groups → seed 7 system group (idempotent)
 */
import { defineStore } from 'pinia';
import { api } from '@/api/index';

export interface DepartmentNode {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  depth: number;
  displayOrder: number;
  archivedAt: string | null;
  memberCount: number;
  leaderUserId: string | null;
  deputyUserId: string | null;
  children: DepartmentNode[];
}

export interface PermissionGroupNode {
  id: string;
  name: string;
  parentId: string | null;
  isSystem: boolean;
  displayOrder: number;
  grants: Record<string, Record<string, boolean>>;
  memberCount: number;
  children: PermissionGroupNode[];
}

export type OnboardingStepKey = 'pin';

export interface OnboardingSummary {
  userId: string;
  completedCount: number;
  totalCount: number;
  percent: number;
  pendingSteps: OnboardingStepKey[];
  pin: boolean;
  pinSkipped: boolean;
  dismissed: boolean;
}

export interface RbacUser {
  id: string;
  email: string | null;
  // UI refactor 2026-05-27 — phone hiển thị cột chính, email ẩn theo toggle
  phone: string | null;
  // Avatar Zalo lưu lúc create-with-zalo (findUser response)
  avatarUrl: string | null;
  fullName: string;
  role: string;
  permissionGroupId: string | null;
  // `grants` đã có sẵn trong response (user-assignment-routes select) nhưng trước
  // giờ không khai báo ở type — màn "Quyền theo người" cần để tính quyền kế thừa.
  permissionGroup: { id: string; name: string; isSystem: boolean; grants?: Record<string, Record<string, boolean>> } | null;
  /** Override lẻ theo từng người: true = cấp thêm, false = TỪ CHỐI (đè nhóm), thiếu key = kế thừa. */
  customGrants?: Record<string, Record<string, boolean>> | null;
  departmentMember: {
    departmentId: string;
    deptRole: 'leader' | 'deputy' | 'member';
    department: { id: string; name: string; path: string };
  } | null;
  // UI refactor 2026-05-27 — "Liên lạc nội bộ" column hiển thị:
  //   internalContactNick (nick CRM)  → "Số điện thoại của nick CRM"
  //   internalContactPhone (Zalo cá nhân ngoài CRM) → "SĐT + tag 'Zalo ngoài'"
  internalContactMethod: 'crm_nick' | 'personal_phone' | null;
  internalContactPhone: string | null;
  internalContactZaloAccountId: string | null;
  internalContactNick: { id: string; displayName: string | null; avatarUrl: string | null; phone: string | null; zaloUid: string | null; status: string } | null;
  // UI 2026-05-27 — handshake status từ SystemNotifyRecipient row mới nhất
  //   ready                     → handshake đã verify
  //   pending_friend_request    → đã gửi friend request, chờ accept
  //   pending_user_confirm      → đã accept, chờ sale gõ mã 4 số
  //   invalid / missing_internal_contact → chưa setup hoặc lỗi
  recipientStatus: 'ready' | 'pending_friend_request' | 'pending_user_confirm' | 'invalid' | 'missing_internal_contact' | string | null;
  recipientError: string | null;
  maxPrivacyNicks?: number;
  // Phase status 4-state 2026-05-27 — FE compute status từ isActive + lastLoginAt:
  passwordChangedAt: string | null;
  lastLoginAt: string | null;
  isActive: boolean;
  onboarding?: OnboardingSummary | null;
}

// Tìm node nhóm quyền theo id trong cây (đệ quy children) — dùng để cập nhật grants
// tại chỗ sau khi PATCH, tránh reload toàn bộ cây.
function findGroupNode(nodes: PermissionGroupNode[], id: string): PermissionGroupNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findGroupNode(n.children ?? [], id);
    if (found) return found;
  }
  return null;
}

export const useRbacStore = defineStore('rbac', {
  state: () => ({
    departments: [] as DepartmentNode[],
    permissionGroups: [] as PermissionGroupNode[],
    users: [] as RbacUser[],
    matrixMeta: null as null | { resources: string[]; actions: string[]; resourceActions: Record<string, string[]> },
    loading: false,
  }),
  actions: {
    async loadDepartments() {
      this.loading = true;
      try {
        const { data } = await api.get('/departments');
        this.departments = data.tree ?? [];
      } finally {
        this.loading = false;
      }
    },
    async loadPermissionGroups() {
      this.loading = true;
      try {
        const [tree, meta] = await Promise.all([
          api.get('/permission-groups'),
          api.get('/permission-groups/meta'),
        ]);
        this.permissionGroups = tree.data.tree ?? [];
        this.matrixMeta = meta.data;
      } finally {
        this.loading = false;
      }
    },
    async loadUsers(filter: { departmentId?: string; permissionGroupId?: string; q?: string } = {}) {
      this.loading = true;
      try {
        const params = new URLSearchParams();
        if (filter.departmentId) params.set('departmentId', filter.departmentId);
        if (filter.permissionGroupId) params.set('permissionGroupId', filter.permissionGroupId);
        if (filter.q) params.set('q', filter.q);
        const { data } = await api.get('/rbac/users?' + params.toString());
        this.users = data.users ?? [];
      } finally {
        this.loading = false;
      }
    },
    async createDepartment(input: { name: string; parentId: string | null }) {
      await api.post('/departments', input);
      await this.loadDepartments();
    },
    async renameDepartment(id: string, name: string) {
      await api.patch(`/departments/${id}`, { name });
      await this.loadDepartments();
    },
    async moveDepartment(id: string, parentId: string | null) {
      await api.patch(`/departments/${id}`, { parentId });
      await this.loadDepartments();
    },
    async archiveDepartment(id: string) {
      await api.delete(`/departments/${id}`);
      await this.loadDepartments();
    },
    async assignMember(deptId: string, userId: string, deptRole: 'leader' | 'deputy' | 'member') {
      await api.post(`/departments/${deptId}/members`, { userId, deptRole });
      await Promise.all([this.loadDepartments(), this.loadUsers()]);
    },
    async createPermissionGroup(input: { name: string; parentId: string | null; cloneFromId?: string }) {
      await api.post('/permission-groups', input);
      await this.loadPermissionGroups();
    },
    async updateGroupGrants(id: string, grants: Record<string, Record<string, boolean>>) {
      await api.patch(`/permission-groups/${id}`, { grants });
      // Fix 2026-06-20: cập nhật grants TẠI CHỖ thay vì loadPermissionGroups().
      // Reload cả cây làm màn Phân quyền re-render → nhảy về đầu trang + khóa tick
      // liên tục. Grants đổi không ảnh hưởng cấu trúc cây/memberCount nên update node là đủ.
      const node = findGroupNode(this.permissionGroups, id);
      if (node) node.grants = JSON.parse(JSON.stringify(grants));
    },
    async setUserPermissionGroup(userId: string, permissionGroupId: string | null) {
      await api.patch(`/rbac/users/${userId}/permission-group`, { permissionGroupId });
      await this.loadUsers();
    },
    /**
     * Ghi override lẻ cho 1 user (màn "Quyền theo người").
     * Gửi NGUYÊN map customGrants — backend sanitize + chặn leo thang rồi mới lưu.
     * Cập nhật tại chỗ thay vì loadUsers() để bảng không nhảy sau mỗi lần tick.
     */
    async setUserOverrides(userId: string, customGrants: Record<string, Record<string, boolean>>) {
      const { data } = await api.patch(`/rbac/users/${userId}/overrides`, { customGrants });
      const u = this.users.find((x) => x.id === userId);
      if (u) u.customGrants = data.customGrants ?? {};
      return data.customGrants;
    },
    async seedDefaultGroups() {
      const { data } = await api.post('/admin/rbac/seed-default-groups');
      await this.loadPermissionGroups();
      return data;
    },
    async migrateLegacyUsers() {
      const { data } = await api.post('/admin/rbac/migrate-legacy-users');
      await this.loadUsers();
      return data;
    },
  },
});
