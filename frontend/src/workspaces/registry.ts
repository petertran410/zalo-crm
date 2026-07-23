/**
 * Workspace Registry — Pure data map (NO store imports)
 * ──────────────────────────────────────────────────────
 * Tách riêng registry ra khỏi index.ts để tránh circular dependency
 * (resolver.ts cần registry, index.ts re-export resolver).
 *
 * ╔════════════════════════════════════════════════════════════╗
 * ║  THÊM WORKSPACE MỚI:                                     ║
 * ║  1. Tạo thư mục src/workspaces/<tên>/ với menu.ts + index ║
 * ║  2. Thêm literal vào WorkspaceId trong types.ts           ║
 * ║  3. Import config và thêm vào object bên dưới             ║
 * ║  4. Thêm rule vào detectWorkspaceId() trong resolver.ts   ║
 * ║  5. (Tuỳ chọn) Tạo Layout riêng trong src/layouts/       ║
 * ╚════════════════════════════════════════════════════════════╝
 */

import type { WorkspaceId, WorkspaceConfig } from './types';

// ── Active Workspaces (đã hoàn thiện) ────────────────────────────────────────
import { salesWorkspace } from './sales';
import { adminWorkspace } from './admin';
import { customerCareWorkspace } from './customer-care';
import { managerWorkspace } from './manager';

// ── Stub Workspaces (Phase 2+ — chỉ có khung, chưa có menu) ─────────────────
import { marketingWorkspace } from './marketing';
import { financeWorkspace } from './finance';
import { directorWorkspace } from './director';
import { warehouseWorkspace } from './warehouse';
import { callCenterWorkspace } from './call-center';

/** Registry map: WorkspaceId → WorkspaceConfig.
 *  Dùng Partial vì các stub chưa hoàn thiện có thể bật/tắt linh hoạt. */
export const workspaceRegistry: Partial<Record<WorkspaceId, WorkspaceConfig>> = {
  // ── Active ──
  sales: salesWorkspace,
  admin: adminWorkspace,
  'customer-care': customerCareWorkspace,
  manager: managerWorkspace,

  // ── Stubs Phase 2+ — menu rỗng, tạm dùng DefaultLayout/SalesLayout ──
  // Khi hoàn thiện menu.ts xong → workspace tự có menu đầy đủ.
  marketing: marketingWorkspace,
  finance: financeWorkspace,
  director: directorWorkspace,
  warehouse: warehouseWorkspace,
  'call-center': callCenterWorkspace,
};
