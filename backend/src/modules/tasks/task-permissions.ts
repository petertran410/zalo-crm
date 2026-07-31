/**
 * task-permissions.ts — Luật quyền cho Công việc (Task V1, 2026-07-07).
 * Logic thực tế dùng chung với Ticket qua assignable-entity-permissions.ts —
 * unit-test trực tiếp (backend/tests/task-permissions.test.ts).
 */
import { canMutateAssignedEntity, canDeleteCreatedEntity } from '../../shared/utils/assignable-entity-permissions.js';

/** Ai được SỬA/TOGGLE task: admin/owner ∨ người được giao ∨ người tạo. */
export function canMutateTask(
  user: { id: string; role: string },
  task: { assigneeUserId: string; createdByUserId: string | null },
): boolean {
  return canMutateAssignedEntity(user, task);
}

/** Ai được XÓA task: CHỈ người tạo hoặc admin/owner — người được giao thì hoàn thành, không xóa. */
export function canDeleteTask(
  user: { id: string; role: string },
  task: { createdByUserId: string | null },
): boolean {
  return canDeleteCreatedEntity(user, task);
}
