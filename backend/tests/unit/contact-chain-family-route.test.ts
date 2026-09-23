import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

const mockContactFindFirst = vi.fn();
const mockContactFindMany = vi.fn();
const mockPosCustomerFindMany = vi.fn();
const mockGetContactScope = vi.fn();

vi.mock('../../src/shared/database/prisma-client.js', () => ({
  prisma: {
    contact: {
      findFirst: (...a: any[]) => mockContactFindFirst(...a),
      findMany: (...a: any[]) => mockContactFindMany(...a),
    },
    posCustomer: {
      findMany: (...a: any[]) => mockPosCustomerFindMany(...a),
    },
  },
}));

vi.mock('../../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (request: any) => {
    request.user = { id: 'u1', orgId: 'org1', role: 'owner' };
  },
}));

vi.mock('../../src/modules/rbac/rbac-middleware.js', () => ({
  requireGrant: () => async () => {},
}));

vi.mock('../../src/modules/contacts/contact-scope.js', () => ({
  getContactScope: (...a: any[]) => mockGetContactScope(...a),
}));

import {
  contactFamilyRoutes,
  chainBrandOf,
} from '../../src/modules/contacts/contact-family-routes.js';

const URL = '/api/v1/contacts/c1/chain-family';

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(contactFamilyRoutes);
  return app;
}

// Hai outlet cùng brand "Gongcha", đặt tên theo convention team bán.
const GONGCHA = (id: string, outlet: string) => ({
  id, phone: '090000000', phone2: null, phone3: null,
  crmName: null, fullName: `Chuỗi Gongcha ${outlet} (Sale 1)`,
  avatarUrl: null, zaloUid: null, posCustomerId: 10, posCustomerCode: 'P10',
  friends: [],
});
const CHAIN = [GONGCHA('c1', 'Thảo Điền'), GONGCHA('c2', 'Cầu Giấy')];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetContactScope.mockResolvedValue({
    isOrgAdmin: true,
    isDeptManager: true,
    visibleUserIds: new Set(),
    accessibleContactIds: null,
    primaryContactIds: new Set(),
  });
  mockPosCustomerFindMany.mockResolvedValue([
    { posId: 10, code: 'P10', name: 'Chuỗi Gongcha Thảo Điền (Sale 1)', assignedSaleName: 'saleA' },
  ]);
});

describe('chainBrandOf — tách brand từ tên', () => {
  it('lấy token đầu sau "Chuỗi"', () => {
    expect(chainBrandOf('Chuỗi Gongcha Thảo Điền - Thủ Đức, HCM (Sale 1)')).toBe('gongcha');
    expect(chainBrandOf('CHUỖI Haidilao HN - Ms Huệ (Sale 1)')).toBe('haidilao');
  });

  it('từ chung (matcha/bánh...) thì lấy thêm token kế để khỏi gộp nhầm brand', () => {
    expect(chainBrandOf('Chuỗi Matcha Vibe Long Biên (Sale 4)')).toBe('matcha vibe');
    expect(chainBrandOf('Chuỗi Matcha Wawa - Quận 1 (Sale 4)')).toBe('matcha wawa');
    expect(chainBrandOf('Chuỗi Bánh Gà Chi Chi Ko (Sale 4)')).toBe('bánh gà');
  });

  it('từ chung nhiều token ("cà phê") vẫn group nhất quán', () => {
    expect(chainBrandOf('Chuỗi cà phê Ông Bầu Mr Quân (Đóng)')).toBe('cà phê ông');
  });

  it('null khi không phải tên chuỗi / không có brand', () => {
    expect(chainBrandOf('Khách buôn em Huyền (Sale 1)')).toBeNull();
    expect(chainBrandOf('Chuỗi')).toBeNull();
    expect(chainBrandOf(null)).toBeNull();
    expect(chainBrandOf(undefined)).toBeNull();
  });

  it('chuẩn hoá: lowercase + bỏ dấu câu + thống nhất nháy', () => {
    expect(chainBrandOf('Chuỗi S’MORES - Cầu Giấy (Sale 4)')).toBe("s'mores");
  });
});

describe('GET /api/v1/contacts/:id/chain-family', () => {
  it('404 khi anchor không tồn tại trong org', async () => {
    mockContactFindFirst.mockResolvedValue(null);
    const res = await buildApp().inject({ method: 'GET', url: URL });
    expect(res.statusCode).toBe(404);
  });

  it('rỗng khi tên anchor không phải chuỗi', async () => {
    mockContactFindFirst.mockResolvedValue({
      id: 'c1', crmName: null, fullName: 'Khách lẻ Nguyễn Văn A',
    });
    const res = await buildApp().inject({ method: 'GET', url: URL });
    const body = res.json();
    expect(body.chainKey).toBeNull();
    expect(body.contacts).toHaveLength(0);
    expect(mockContactFindMany).not.toHaveBeenCalled();
  });

  it('nhóm được các outlet cùng brand, đánh dấu isCurrent', async () => {
    mockContactFindFirst.mockResolvedValue({
      id: 'c1', crmName: null, fullName: 'Chuỗi Gongcha Thảo Điền (Sale 1)',
    });
    mockContactFindMany.mockResolvedValue(CHAIN);

    const res = await buildApp().inject({ method: 'GET', url: URL });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.chainKey).toBe('gongcha');
    expect(body.contacts).toHaveLength(2);
    expect(body.contacts.find((c: any) => c.id === 'c1').isCurrent).toBe(true);
    expect(body.contacts.find((c: any) => c.id === 'c2').isCurrent).toBe(false);
  });

  it('lọc bỏ candidate khác brand (chống false-positive từ quét prefix)', async () => {
    mockContactFindFirst.mockResolvedValue({
      id: 'c1', crmName: null, fullName: 'Chuỗi Gongcha Thảo Điền (Sale 1)',
    });
    mockContactFindMany.mockResolvedValue([
      ...CHAIN,
      { ...GONGCHA('c-x', 'Long Biên'), fullName: 'Chuỗi Matchaholic (CS5) - HN (Sale 4)' },
    ]);

    const res = await buildApp().inject({ method: 'GET', url: URL });
    const ids = res.json().contacts.map((c: any) => c.id);
    expect(ids).toContain('c1');
    expect(ids).toContain('c2');
    expect(ids).not.toContain('c-x');
  });

  it('tách "Matcha Vibe" khỏi "Matcha Wawa" (cùng từ chung, khác brand)', async () => {
    mockContactFindFirst.mockResolvedValue({
      id: 'c1', crmName: null, fullName: 'Chuỗi Matcha Vibe Long Biên (Sale 4)',
    });
    mockContactFindMany.mockResolvedValue([
      { ...GONGCHA('c1', 'x'), fullName: 'Chuỗi Matcha Vibe Long Biên (Sale 4)' },
      { ...GONGCHA('c2', 'y'), fullName: 'Chuỗi Matcha Vibe Tân Bình (Sale 4)' },
      { ...GONGCHA('c3', 'z'), fullName: 'Chuỗi Matcha Wawa - Quận 1 (Sale 4)' },
    ]);

    const res = await buildApp().inject({ method: 'GET', url: URL });
    const body = res.json();
    expect(body.chainKey).toBe('matcha vibe');
    const ids = body.contacts.map((c: any) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['c1', 'c2']));
    expect(ids).not.toContain('c3');
  });

  it('ưu tiên crmName, fallback fullName (POS name)', async () => {
    mockContactFindFirst.mockResolvedValue({
      id: 'c1', crmName: 'Chuỗi Gongcha CRM', fullName: 'Tên POS khác',
    });
    mockContactFindMany.mockResolvedValue([
      { ...GONGCHA('c1', 'a'), crmName: 'Chuỗi Gongcha CRM', fullName: 'Tên POS khác' },
      GONGCHA('c2', 'b'),
    ]);

    const res = await buildApp().inject({ method: 'GET', url: URL });
    expect(res.json().chainKey).toBe('gongcha');
    expect(res.json().contacts).toHaveLength(2);
  });

  it('rỗng khi chỉ có một mình anchor trong chuỗi', async () => {
    mockContactFindFirst.mockResolvedValue({
      id: 'c1', crmName: null, fullName: 'Chuỗi Gongcha Thảo Điền (Sale 1)',
    });
    mockContactFindMany.mockResolvedValue([CHAIN[0]]);

    const res = await buildApp().inject({ method: 'GET', url: URL });
    const body = res.json();
    expect(body.chainKey).toBe('gongcha');
    expect(body.contacts).toHaveLength(0);
  });

  it('query candidate bó trong org + loại merged/archived', async () => {
    mockContactFindFirst.mockResolvedValue({
      id: 'c1', crmName: null, fullName: 'Chuỗi Gongcha Thảo Điền (Sale 1)',
    });
    mockContactFindMany.mockResolvedValue(CHAIN);

    await buildApp().inject({ method: 'GET', url: URL });
    const q = mockContactFindMany.mock.calls[0][0];
    expect(q.where.orgId).toBe('org1');
    expect(q.where.mergedInto).toBeNull();
    expect(q.where.archivedAt).toBeNull();
  });

  it('accessible=false cho contact ngoài scope của sale', async () => {
    mockGetContactScope.mockResolvedValue({
      isOrgAdmin: false,
      isDeptManager: false,
      visibleUserIds: new Set(['u1']),
      accessibleContactIds: ['c1'],
      primaryContactIds: new Set(['c1']),
    });
    mockContactFindFirst.mockResolvedValue({
      id: 'c1', crmName: null, fullName: 'Chuỗi Gongcha Thảo Điền (Sale 1)',
    });
    mockContactFindMany.mockResolvedValue(CHAIN);

    const res = await buildApp().inject({ method: 'GET', url: URL });
    const body = res.json();
    expect(body.contacts.find((c: any) => c.id === 'c1').accessible).toBe(true);
    expect(body.contacts.find((c: any) => c.id === 'c2').accessible).toBe(false);
  });
});
