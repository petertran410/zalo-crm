/**
 * assignable-entity-permissions.ts — luật quyền dùng chung cho các entity dạng
 * "giao việc" (Task, Ticket, ...): có assigneeUserId + createdByUserId, sửa được
 * bởi admin/owner ∨ assignee ∨ creator, xóa được CHỈ bởi creator hoặc admin/owner.
 *
 * Tách ra vì task-permissions.ts và ticket-permissions.ts vốn có 2 hàm này BYTE-
 * IDENTICAL (chỉ khác tên tham số) — sinh ra khi Ticket copy nguyên Task. Thêm entity
 * "giao việc" thứ 3 sau này chỉ cần gọi lại, không copy nữa.
 */

export function canMutateAssignedEntity(
  user: { id: string; role: string },
  entity: { assigneeUserId: string; createdByUserId: string | null },
): boolean {
  if (user.role === 'owner' || user.role === 'admin') return true;
  return user.id === entity.assigneeUserId || user.id === entity.createdByUserId;
}

export function canDeleteCreatedEntity(
  user: { id: string; role: string },
  entity: { createdByUserId: string | null },
): boolean {
  if (user.role === 'owner' || user.role === 'admin') return true;
  return entity.createdByUserId !== null && user.id === entity.createdByUserId;
}
