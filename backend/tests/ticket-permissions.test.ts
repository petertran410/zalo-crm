// Unit test (thuần) — Ticket V1 (2026-07-09): ma trận quyền + lifecycle transition.
// Luật quyền: giống Task — sửa/đổi status = admin/owner ∨ assignee ∨ creator;
// XÓA = chỉ creator hoặc admin/owner. Lifecycle: resolved TERMINAL, không reopen.
import { describe, it, expect } from 'vitest';
import { canMutateTicket, canDeleteTicket, isValidTicketTransition } from '../src/modules/tickets/ticket-permissions.js';

const admin = { id: 'u-admin', role: 'admin' };
const owner = { id: 'u-owner', role: 'owner' };
const creator = { id: 'u-creator', role: 'member' };
const assignee = { id: 'u-assignee', role: 'member' };
const other = { id: 'u-other', role: 'member' };

const ticket = { assigneeUserId: assignee.id, createdByUserId: creator.id };

describe('canMutateTicket — sửa/đổi status', () => {
  it('admin/owner luôn được', () => {
    expect(canMutateTicket(admin, ticket)).toBe(true);
    expect(canMutateTicket(owner, ticket)).toBe(true);
  });
  it('assignee và creator được', () => {
    expect(canMutateTicket(assignee, ticket)).toBe(true);
    expect(canMutateTicket(creator, ticket)).toBe(true);
  });
  it('người ngoài không được', () => {
    expect(canMutateTicket(other, ticket)).toBe(false);
  });
  it('creator đã bị xóa (SetNull) → chỉ assignee/admin', () => {
    const orphan = { assigneeUserId: assignee.id, createdByUserId: null };
    expect(canMutateTicket(assignee, orphan)).toBe(true);
    expect(canMutateTicket(other, orphan)).toBe(false);
  });
});

describe('canDeleteTicket — xóa', () => {
  it('creator và admin/owner được', () => {
    expect(canDeleteTicket(creator, ticket)).toBe(true);
    expect(canDeleteTicket(admin, ticket)).toBe(true);
    expect(canDeleteTicket(owner, ticket)).toBe(true);
  });
  it('assignee KHÔNG được xóa ticket người khác tạo', () => {
    expect(canDeleteTicket(assignee, ticket)).toBe(false);
  });
  it('creator null (đã xóa user) → chỉ admin/owner', () => {
    const orphan = { createdByUserId: null };
    expect(canDeleteTicket(assignee, orphan)).toBe(false);
    expect(canDeleteTicket(other, orphan)).toBe(false);
    expect(canDeleteTicket(admin, orphan)).toBe(true);
  });
});

describe('isValidTicketTransition — lifecycle open→in_progress→resolved, resolved→in_progress (Mở lại)', () => {
  it('open → in_progress hợp lệ', () => {
    expect(isValidTicketTransition('open', 'in_progress')).toBe(true);
  });
  it('open → resolved hợp lệ (bỏ qua in_progress)', () => {
    expect(isValidTicketTransition('open', 'resolved')).toBe(true);
  });
  it('in_progress → open hợp lệ (bỏ nhận lại)', () => {
    expect(isValidTicketTransition('in_progress', 'open')).toBe(true);
  });
  it('in_progress → resolved hợp lệ', () => {
    expect(isValidTicketTransition('in_progress', 'resolved')).toBe(true);
  });
  it('resolved → in_progress hợp lệ (Mở lại — sửa lỗi bấm nhầm "Đánh dấu xong")', () => {
    expect(isValidTicketTransition('resolved', 'in_progress')).toBe(true);
  });
  it('resolved → open KHÔNG hợp lệ — chỉ có 1 đường lùi duy nhất là in_progress', () => {
    expect(isValidTicketTransition('resolved', 'open')).toBe(false);
  });
  it('resolved → resolved (PATCH giống hệt) → false', () => {
    expect(isValidTicketTransition('resolved', 'resolved')).toBe(false);
  });
  it('chuyển sang chính nó → false, không có lý do PATCH giống hệt', () => {
    expect(isValidTicketTransition('open', 'open')).toBe(false);
    expect(isValidTicketTransition('in_progress', 'in_progress')).toBe(false);
  });
  it('status đích không hợp lệ → false', () => {
    expect(isValidTicketTransition('open', 'closed')).toBe(false);
    expect(isValidTicketTransition('open', 'bogus')).toBe(false);
  });
});
