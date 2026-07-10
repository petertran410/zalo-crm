/**
 * ticket-permissions.ts — Luật quyền + lifecycle thuần cho Ticket (V1, 2026-07-09).
 * Pure function, không import gì — unit-test trực tiếp (backend/tests/ticket-permissions.test.ts).
 *
 * Quyền mirror Task V1 (anh chốt "follow same permission flow as tasks"):
 *   - Sửa/đổi status: admin/owner ∨ assignee ∨ người tạo.
 *   - Xóa: CHỈ người tạo hoặc admin/owner.
 */

/** Ai được SỬA/ĐỔI STATUS ticket: admin/owner ∨ người được giao ∨ người tạo. */
export function canMutateTicket(
  user: { id: string; role: string },
  ticket: { assigneeUserId: string; createdByUserId: string | null },
): boolean {
  if (user.role === 'owner' || user.role === 'admin') return true;
  return user.id === ticket.assigneeUserId || user.id === ticket.createdByUserId;
}

/** Ai được XÓA ticket: CHỈ người tạo hoặc admin/owner. */
export function canDeleteTicket(
  user: { id: string; role: string },
  ticket: { createdByUserId: string | null },
): boolean {
  if (user.role === 'owner' || user.role === 'admin') return true;
  return ticket.createdByUserId !== null && user.id === ticket.createdByUserId;
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
