/**
 * task-permissions.ts — Luật quyền thuần cho Công việc (Task V1, 2026-07-07).
 * Pure function, không import gì — unit-test trực tiếp (backend/tests/task-permissions.test.ts).
 */

/** Ai được SỬA/TOGGLE task: admin/owner ∨ người được giao ∨ người tạo. */
export function canMutateTask(
  user: { id: string; role: string },
  task: { assigneeUserId: string; createdByUserId: string | null },
): boolean {
  if (user.role === 'owner' || user.role === 'admin') return true;
  return user.id === task.assigneeUserId || user.id === task.createdByUserId;
}

/** Ai được XÓA task: CHỈ người tạo hoặc admin/owner — người được giao thì hoàn thành, không xóa. */
export function canDeleteTask(
  user: { id: string; role: string },
  task: { createdByUserId: string | null },
): boolean {
  if (user.role === 'owner' || user.role === 'admin') return true;
  return task.createdByUserId !== null && user.id === task.createdByUserId;
}
