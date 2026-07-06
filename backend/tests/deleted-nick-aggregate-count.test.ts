/**
 * deleted-nick-aggregate-count.test.ts — Hồi quy: tầng ĐẾM Contact ("đang chăm") GIỮ
 * archivedAt:null — nick ĐÃ XÓA KHÔNG tính là "đang chăm".
 *
 * Vòng đời nick Zalo (NHÓM C YC2 2026-06-20): tầng ĐẾM khác tầng HIỂN THỊ chat. Chat dùng
 * DISPLAYABLE_NICK_WHERE (nick xóa-có-uid vẫn hiện hội thoại đọc-only). Nhưng số liệu
 * Contact ("Có nick chăm") phải lọc {zaloAccount:{archivedAt:null}, relationshipKind:{not:'ghost'}}
 * — nếu đổi sang DISPLAYABLE thì số phình (đếm nick đã ngừng làm việc).
 *
 * Bất biến khoá:
 *   • Query shape REAL_FRIEND_SOME == AGGREGATE_INCLUDE.friends.where (canonical, đồng bộ).
 *   • Predicate "đang chăm": nick archived → KHÔNG tính; revive (archivedAt=null) → tính lại.
 *
 * Convention contact-ghost-filter (test predicate đếm, KHÔNG mock DB).
 */
import { describe, it, expect } from 'vitest';
import { AGGREGATE_INCLUDE } from '../src/modules/contacts/contact-aggregate-display.js';

// Predicate replicate luật Prisma `friends: { some: {...} }` của REAL_FRIEND_SOME.
// 1 Friend "thật" (đang chăm) = nick CÒN SỐNG (archivedAt=null) + quan hệ != 'ghost'.
const REAL_FRIEND_SOME_WHERE = {
  zaloAccount: { archivedAt: null },
  relationshipKind: { not: 'ghost' },
};
function isCaringFriend(f: { archivedAt: Date | null; relationshipKind: string }): boolean {
  return f.archivedAt === null && f.relationshipKind !== 'ghost';
}
function countCaring(contacts: Array<{ friends: Array<{ archivedAt: Date | null; relationshipKind: string }> }>): number {
  return contacts.filter((c) => c.friends.some(isCaringFriend)).length;
}

describe('deleted-nick-aggregate-count — tầng đếm GIỮ archivedAt:null', () => {
  it('REAL_FRIEND_SOME khớp AGGREGATE_INCLUDE.friends.where (canonical đồng bộ)', () => {
    expect(AGGREGATE_INCLUDE.friends.where).toEqual(REAL_FRIEND_SOME_WHERE);
    // Khoá cứng: KHÔNG được nới sang DISPLAYABLE (OR archived+uid) ở tầng đếm.
    expect((AGGREGATE_INCLUDE.friends.where as any).zaloAccount).toEqual({ archivedAt: null });
    expect((AGGREGATE_INCLUDE.friends.where as any).OR).toBeUndefined();
  });

  it('nick ĐÃ XÓA → friend KHÔNG lọt some → KHÔNG tính "đang chăm"', () => {
    const contacts = [
      { friends: [{ archivedAt: new Date(), relationshipKind: 'friend' }] }, // nick xóa
    ];
    expect(countCaring(contacts)).toBe(0);
  });

  it('ghost (relationshipKind=ghost) → KHÔNG tính dù nick sống', () => {
    const contacts = [
      { friends: [{ archivedAt: null, relationshipKind: 'ghost' }] },
    ];
    expect(countCaring(contacts)).toBe(0);
  });

  it('REVIVE: nick archivedAt=null → friend lọt some → count + 1', () => {
    const before = [
      { friends: [{ archivedAt: new Date(), relationshipKind: 'friend' }] }, // còn xóa
    ];
    const after = [
      { friends: [{ archivedAt: null, relationshipKind: 'friend' }] }, // revive
    ];
    expect(countCaring(before)).toBe(0);
    expect(countCaring(after)).toBe(1);
  });
});
