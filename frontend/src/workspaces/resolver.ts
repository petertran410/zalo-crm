/**
 * Workspace Resolver — Pinia Store
 * ──────────────────────────────────────────────────────────────
 * Đây là NƠI DUY NHẤT chịu trách nhiệm xác định Workspace hiện tại.
 * Không if-else rải rác trong project — tất cả logic nằm ở đây.
 *
 * Flow:
 *   1. Login thành công / init → gọi resolveForUser(user)
 *   2. Resolver đọc user.role + user.deptRole + user.permissionGroupName
 *   3. Xác định WorkspaceId phù hợp → set activeWorkspaceId
 *   4. WorkspaceShell.vue đọc activeConfig (computed) → render Layout tương ứng
 *
 * Admin/Manager:
 *   - Có thể switchWorkspace(id) để giả lập / xem dưới góc nhìn Sales.
 *   - switchWorkspace là TẠM THỜI trong session, reload trang sẽ auto-resolve lại.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { WorkspaceId, WorkspaceConfig } from './types';
import { workspaceRegistry } from './registry';

export const useWorkspaceStore = defineStore('workspace', () => {
  // ── State ──────────────────────────────────────────────────────────────
  const activeWorkspaceId = ref<WorkspaceId>('admin');
  /** true nếu admin đang dùng switchWorkspace() để giả lập vai trò khác. */
  const isSimulationMode = ref(false);
  /** Workspace gốc (trước khi switch). null nếu không đang simulate. */
  const originalWorkspaceId = ref<WorkspaceId | null>(null);

  // ── Getters ────────────────────────────────────────────────────────────
  const activeConfig = computed<WorkspaceConfig>(() => {
    return workspaceRegistry[activeWorkspaceId.value] ?? workspaceRegistry.admin!;
  });

  /** Danh sách tất cả workspace có config (dùng cho Workspace Switcher). */
  const allWorkspaces = computed<WorkspaceConfig[]>(() => {
    return Object.values(workspaceRegistry).filter((v): v is WorkspaceConfig => !!v);
  });

  // ── Actions ────────────────────────────────────────────────────────────

  /**
   * Tự động xác định Workspace phù hợp dựa trên thông tin user.
   * Gọi 1 lần sau login / page refresh (fetchProfile xong).
   */
  function resolveForUser(user: {
    role: string;
    deptRole?: string | null;
    permissionGroupName?: string | null;
    canViewAll?: boolean;
  }) {
    const resolved = detectWorkspaceId(user);
    activeWorkspaceId.value = resolved;
    isSimulationMode.value = false;
    originalWorkspaceId.value = null;
  }

  /**
   * Chuyển đổi Workspace thủ công (chỉ Admin/Manager mới gọi).
   * Vào chế độ Simulation — header hiển thị badge nhắc nhở.
   */
  function switchWorkspace(target: WorkspaceId) {
    if (!isSimulationMode.value) {
      originalWorkspaceId.value = activeWorkspaceId.value;
    }
    activeWorkspaceId.value = target;
    isSimulationMode.value = target !== originalWorkspaceId.value;
  }

  /** Quay về Workspace gốc (thoát chế độ giả lập). */
  function exitSimulation() {
    if (originalWorkspaceId.value) {
      activeWorkspaceId.value = originalWorkspaceId.value;
    }
    isSimulationMode.value = false;
    originalWorkspaceId.value = null;
  }

  return {
    activeWorkspaceId,
    isSimulationMode,
    originalWorkspaceId,
    activeConfig,
    allWorkspaces,
    resolveForUser,
    switchWorkspace,
    exitSimulation,
  };
});

// ── Pure function — logic phân loại workspace ────────────────────────────────
/**
 * Xác định WorkspaceId dựa trên thông tin user.
 * Đây là hàm THUẦN TÚY, dễ unit-test, dễ mở rộng thêm role mới.
 *
 * Thứ tự ưu tiên:
 *   1. owner / admin (role field) → 'admin'   [short-circuit, luôn đúng]
 *   2. workspaceId từ PermissionGroup          [chính xác, không fragile]
 *   3. deptRole = leader / deputy              [fallback nếu chưa gán nhóm]
 *   4. canViewAll                              [fallback CEO không qua nhóm]
 *   5. permissionGroupName chứa "CS" / ...    [legacy fallback, backward compat]
 *   6. Default → 'sales'
 */
function detectWorkspaceId(user: {
  role: string;
  workspaceId?: string | null;
  deptRole?: string | null;
  permissionGroupName?: string | null;
  canViewAll?: boolean;
}): WorkspaceId {
  // Admin / Owner → Workspace đầy đủ (short-circuit, không cần check thêm)
  if (user.role === 'owner' || user.role === 'admin') {
    return 'admin';
  }

  // ── Đọc trực tiếp từ PermissionGroup.workspaceId (chính xác, không đoán) ──
  if (user.workspaceId) {
    // Validate: chỉ nhận các WorkspaceId hợp lệ
    const validIds: WorkspaceId[] = [
      'sales', 'customer-care', 'manager', 'admin',
      'marketing', 'finance', 'director', 'warehouse', 'call-center',
    ];
    if (validIds.includes(user.workspaceId as WorkspaceId)) {
      return user.workspaceId as WorkspaceId;
    }
  }

  // ── Fallback: chưa gán nhóm, dùng deptRole ──
  if (user.deptRole === 'leader' || user.deptRole === 'deputy') {
    return 'manager';
  }

  // canViewAll = có quyền xem tất cả → cũng coi là manager
  if (user.canViewAll) {
    return 'manager';
  }

  // Legacy fallback: đoán từ tên nhóm (backward compat cho nhóm custom chưa gán workspaceId)
  const pgName = (user.permissionGroupName || '').toLowerCase();
  if (pgName.includes('cs') || pgName.includes('chăm sóc') || pgName.includes('cham soc') || pgName.includes('support')) {
    return 'customer-care';
  }
  if (pgName.includes('marketing')) {
    return 'marketing';
  }
  if (pgName.includes('giám đốc') || pgName.includes('giam doc') || pgName.includes('ceo') || pgName.includes('director')) {
    return 'director';
  }
  if (pgName.includes('kho') || pgName.includes('warehouse') || pgName.includes('logistics')) {
    return 'warehouse';
  }

  // Default: Sales workspace (giao diện gọn nhẹ nhất)
  return 'sales';
}
