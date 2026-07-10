/**
 * ticket-permissions.ts — Luật quyền + lifecycle cho Ticket (V1, 2026-07-09).
 * Quyền dùng chung với Task qua assignable-entity-permissions.ts (anh chốt
 * "follow same permission flow as tasks") — unit-test trực tiếp
 * (backend/tests/ticket-permissions.test.ts).
 *
 *   - Sửa/đổi status: admin/owner ∨ assignee ∨ người tạo.
 *   - Xóa: CHỈ người tạo hoặc admin/owner.
 */
import { canMutateAssignedEntity, canDeleteCreatedEntity } from '../../shared/utils/assignable-entity-permissions.js';

/** Ai được SỬA/ĐỔI STATUS ticket: admin/owner ∨ người được giao ∨ người tạo. */
export function canMutateTicket(
  user: { id: string; role: string },
  ticket: { assigneeUserId: string; createdByUserId: string | null },
): boolean {
  return canMutateAssignedEntity(user, ticket);
}

/** Ai được XÓA ticket: CHỈ người tạo hoặc admin/owner. */
export function canDeleteTicket(
  user: { id: string; role: string },
  ticket: { createdByUserId: string | null },
): boolean {
  return canDeleteCreatedEntity(user, ticket);
}

export const TICKET_STATUSES = ['open', 'in_progress', 'resolved'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/**
 * Lifecycle (SỬA 2026-07-10): resolved KHÔNG còn terminal tuyệt đối — cho phép
 * "Mở lại" (resolved→in_progress) để sửa lỗi bấm nhầm "Đánh dấu xong". Đây là
 * đường lùi DUY NHẤT từ resolved (không resolved→open trực tiếp, tránh 2 đường
 * mơ hồ) — nhân viên mở lại xong muốn "bỏ nhận" thì đi tiếp in_progress→open
 * như bình thường.
 *
 * Hợp lệ: open→in_progress, open→resolved (bỏ qua in_progress), in_progress→open
 * (bỏ nhận lại), in_progress→resolved, resolved→in_progress (mở lại). Riêng
 * resolved→open và resolved→resolved vẫn false.
 */
export function isValidTicketTransition(from: string, to: string): boolean {
  if (!TICKET_STATUSES.includes(to as TicketStatus)) return false;
  if (from === to) return false;
  if (from === 'resolved') return to === 'in_progress';
  return true;
}
