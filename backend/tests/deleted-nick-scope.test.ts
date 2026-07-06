/**
 * deleted-nick-scope.test.ts — Hồi quy: nick ĐÃ XÓA hiện trong SCOPE của owner (đọc-only),
 * KHÔNG lộ sang sale khác.
 *
 * Vòng đời nick Zalo (YC2 2026-06-20): getZaloScope trả thêm `displayableIds` (gồm nick
 * archived-có-uid của mình) ngoài `accessibleIds` (chỉ nick còn sống). Bất biến:
 *   • viewer A → displayableIds gồm A-deleted + A-live; accessibleIds chỉ A-live.
 *   • viewer B → KHÔNG thấy nick của A (cả deleted lẫn live).
 *   • admin → thấy tất cả nick displayable trong org.
 *
 * Convention zalo-ghost-fix: mock prisma. Mock mô phỏng DB đã lọc DISPLAYABLE_NICK_WHERE +
 * ownerUserId (Prisma where) — test khoá cách getZaloScope DỰNG output từ rows trả về.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  zaloAccount: { findMany: vi.fn() },
  user: { findFirst: vi.fn() },
  department: { findMany: vi.fn() },
  departmentMember: { findMany: vi.fn() },
  zaloAccountAccess: { findMany: vi.fn() },
};
vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('@prisma/client', () => ({ Prisma: { JsonNull: 'JSON_NULL', DbNull: 'DB_NULL' } }));

const { getZaloScope, DISPLAYABLE_NICK_WHERE } = await import('../src/modules/zalo/zalo-scope.js');

const ORG = 'org-1';

// 3 nick (đã mô phỏng DB lọc displayable + có archivedAt để phân loại):
const A_DELETED = { id: 'A-deleted', ownerUserId: 'A', archivedAt: new Date() }; // archived-có-uid
const B_DELETED = { id: 'B-deleted', ownerUserId: 'B', archivedAt: new Date() };
const A_LIVE = { id: 'A-live', ownerUserId: 'A', archivedAt: null };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deleted-nick-scope — displayableIds gồm nick xóa của owner', () => {
  it('DISPLAYABLE_NICK_WHERE: nick sống HOẶC nick xóa-có-uid (loại nick-ma uid=null)', () => {
    expect(DISPLAYABLE_NICK_WHERE).toEqual({
      OR: [
        { archivedAt: null },
        { archivedAt: { not: null }, zaloUid: { not: null } },
      ],
    });
  });

  it('viewer A (member): displayableIds gồm A-deleted + A-live; accessibleIds chỉ A-live', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'A', departmentMember: null });
    // DB đã lọc theo ownerUserId in [A] + DISPLAYABLE → chỉ trả nick của A.
    prismaMock.zaloAccount.findMany.mockResolvedValue([A_DELETED, A_LIVE]);
    prismaMock.zaloAccountAccess.findMany.mockResolvedValue([]);

    const scope = await getZaloScope('A', ORG, 'member');

    expect(scope.displayableIds.sort()).toEqual(['A-deleted', 'A-live']);
    expect(scope.accessibleIds).toEqual(['A-live']); // nick xóa KHÔNG gửi được
    // KHÔNG thấy nick của B
    expect(scope.displayableIds).not.toContain('B-deleted');
    // ownedIds = nick mình sở hữu CÒN SỐNG (gate action)
    expect([...scope.ownedIds]).toEqual(['A-live']);
    // owned query phải AND DISPLAYABLE + đúng org + ownerUserId của A
    const ownedWhere = prismaMock.zaloAccount.findMany.mock.calls[0][0].where;
    expect(ownedWhere.orgId).toBe(ORG);
    expect(ownedWhere.OR).toEqual(DISPLAYABLE_NICK_WHERE.OR);
  });

  it('viewer B (member): KHÔNG thấy A-deleted (nick xóa của người khác không lọt scope)', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'B', departmentMember: null });
    prismaMock.zaloAccount.findMany.mockResolvedValue([B_DELETED]); // DB chỉ trả nick của B
    prismaMock.zaloAccountAccess.findMany.mockResolvedValue([]);

    const scope = await getZaloScope('B', ORG, 'member');

    expect(scope.displayableIds).toEqual(['B-deleted']);
    expect(scope.displayableIds).not.toContain('A-deleted');
    expect(scope.accessibleIds).toEqual([]); // nick xóa không gửi được
  });

  it('admin: thấy CẢ nick xóa của mọi owner trong org (displayable), org giữ nguyên', async () => {
    // admin nhánh: 1 findMany duy nhất trả toàn bộ displayable trong org.
    prismaMock.zaloAccount.findMany.mockResolvedValue([A_DELETED, B_DELETED, A_LIVE]);

    const scope = await getZaloScope('ADMIN', ORG, 'admin');

    expect(scope.isOrgAdmin).toBe(true);
    expect(scope.displayableIds.sort()).toEqual(['A-deleted', 'A-live', 'B-deleted']);
    expect(scope.accessibleIds).toEqual(['A-live']); // chỉ nick còn sống gửi được
    const adminWhere = prismaMock.zaloAccount.findMany.mock.calls[0][0].where;
    expect(adminWhere.orgId).toBe(ORG);
    expect(adminWhere.OR).toEqual(DISPLAYABLE_NICK_WHERE.OR);
  });
});
