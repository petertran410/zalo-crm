// Unit test (thuần) — Công việc V1 (2026-07-07): ma trận quyền sửa/toggle/xóa.
// Luật: sửa/toggle = admin/owner ∨ assignee ∨ creator; XÓA = chỉ creator hoặc admin/owner
// (người được giao thì hoàn thành, không xóa việc quản lý giao).
import { describe, it, expect } from 'vitest';
import { canMutateTask, canDeleteTask } from '../src/modules/tasks/task-permissions.js';

const admin = { id: 'u-admin', role: 'admin' };
const owner = { id: 'u-owner', role: 'owner' };
const creator = { id: 'u-creator', role: 'member' };
const assignee = { id: 'u-assignee', role: 'member' };
const other = { id: 'u-other', role: 'member' };

const task = { assigneeUserId: assignee.id, createdByUserId: creator.id };

describe('canMutateTask — sửa/toggle', () => {
  it('admin/owner luôn được', () => {
    expect(canMutateTask(admin, task)).toBe(true);
    expect(canMutateTask(owner, task)).toBe(true);
  });
  it('assignee và creator được', () => {
    expect(canMutateTask(assignee, task)).toBe(true);
    expect(canMutateTask(creator, task)).toBe(true);
  });
  it('người ngoài không được', () => {
    expect(canMutateTask(other, task)).toBe(false);
  });
  it('creator đã bị xóa (SetNull) → chỉ assignee/admin', () => {
    const orphan = { assigneeUserId: assignee.id, createdByUserId: null };
    expect(canMutateTask(assignee, orphan)).toBe(true);
    expect(canMutateTask(other, orphan)).toBe(false);
  });
});

describe('canDeleteTask — xóa', () => {
  it('creator và admin/owner được', () => {
    expect(canDeleteTask(creator, task)).toBe(true);
    expect(canDeleteTask(admin, task)).toBe(true);
    expect(canDeleteTask(owner, task)).toBe(true);
  });
  it('assignee KHÔNG được xóa việc người khác giao', () => {
    expect(canDeleteTask(assignee, task)).toBe(false);
  });
  it('creator null (đã xóa user) → chỉ admin/owner', () => {
    const orphan = { createdByUserId: null };
    expect(canDeleteTask(assignee, orphan)).toBe(false);
    expect(canDeleteTask(other, orphan)).toBe(false);
    expect(canDeleteTask(admin, orphan)).toBe(true);
  });
});
