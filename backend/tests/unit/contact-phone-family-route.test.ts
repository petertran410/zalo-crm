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

import { contactFamilyRoutes } from '../../src/modules/contacts/contact-family-routes.js';

const URL = '/api/v1/contacts/c-base/phone-family';

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(contactFamilyRoutes);
  return app;
}

// Một family thực tế: SĐT gốc + bản ".1" của nó, cùng org.
const FAMILY = [
  {
    id: 'c-base', phone: '0335862112', phone2: null, phone3: null,
    crmName: null, fullName: 'Khách buôn em Huyền HĐ (Sale 1 - A1)',
    avatarUrl: null, zaloUid: null, posCustomerId: 33191, posCustomerCode: 'P1',
    friends: [],
  },
  {
    id: 'c-dotted', phone: '0335862112.1', phone2: null, phone3: null,
    crmName: null, fullName: 'Khách buôn em Huyền HĐ (Sale 2 - A2)',
    avatarUrl: null, zaloUid: null, posCustomerId: 638, posCustomerCode: 'P2',
    friends: [],
  },
];

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
    { posId: 33191, code: 'P1', name: 'Khách buôn em Huyền HĐ (Sale 1 - A1)', assignedSaleName: 'thanhptp' },
    { posId: 638, code: 'P2', name: 'Khách buôn em Huyền HĐ (Sale 2 - A2)', assignedSaleName: 'anhmtv' },
  ]);
});

describe('GET /api/v1/contacts/:id/phone-family', () => {
  it('404 khi anchor không tồn tại trong org', async () => {
    mockContactFindFirst.mockResolvedValue(null);
    const res = await buildApp().inject({ method: 'GET', url: URL });
    expect(res.statusCode).toBe(404);
  });

  it('nhóm được base + bản .1, đánh dấu isCurrent, tách phoneSuffix', async () => {
    mockContactFindFirst.mockResolvedValue({ id: 'c-base', phone: '0335862112' });
    mockContactFindMany.mockResolvedValue(FAMILY);

    const res = await buildApp().inject({ method: 'GET', url: URL });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.familyKey).toBe('84335862112');
    expect(body.contacts).toHaveLength(2);

    const base = body.contacts.find((c: any) => c.id === 'c-base');
    const dotted = body.contacts.find((c: any) => c.id === 'c-dotted');
    expect(base.isCurrent).toBe(true);
    expect(base.phoneSuffix).toBeNull();
    expect(dotted.isCurrent).toBe(false);
    expect(dotted.phoneSuffix).toBe('.1');
  });

  it('mở từ bản .1 vẫn tìm ra base (hai chiều)', async () => {
    mockContactFindFirst.mockResolvedValue({ id: 'c-dotted', phone: '0335862112.1' });
    mockContactFindMany.mockResolvedValue(FAMILY);

    const res = await buildApp().inject({ method: 'GET', url: '/api/v1/contacts/c-dotted/phone-family' });
    const body = res.json();
    expect(body.contacts).toHaveLength(2);
    expect(body.contacts.find((c: any) => c.id === 'c-dotted').isCurrent).toBe(true);
    expect(body.contacts.find((c: any) => c.id === 'c-base').isCurrent).toBe(false);
  });

  it('trả posName + posSaleName cho từng dòng (join theo posId)', async () => {
    mockContactFindFirst.mockResolvedValue({ id: 'c-base', phone: '0335862112' });
    mockContactFindMany.mockResolvedValue(FAMILY);

    const res = await buildApp().inject({ method: 'GET', url: URL });
    const body = res.json();
    const dotted = body.contacts.find((c: any) => c.id === 'c-dotted');
    expect(dotted.posName).toBe('Khách buôn em Huyền HĐ (Sale 2 - A2)');
    expect(dotted.posSaleName).toBe('anhmtv');
  });

  it('lọc candidate KHÔNG cùng family (chống false-positive từ bước contains)', async () => {
    mockContactFindFirst.mockResolvedValue({ id: 'c-base', phone: '0335862112' });
    // contains('335862112') có thể kéo về số KHÁC chứa dãy này — handler phải loại.
    mockContactFindMany.mockResolvedValue([
      ...FAMILY,
      { ...FAMILY[0], id: 'c-intruder', phone: '0999335862112', fullName: 'Số khác', posCustomerId: 1 },
    ]);

    const res = await buildApp().inject({ method: 'GET', url: URL });
    const body = res.json();
    const ids = body.contacts.map((c: any) => c.id);
    expect(ids).toContain('c-base');
    expect(ids).toContain('c-dotted');
    expect(ids).not.toContain('c-intruder');
  });

  it('rỗng khi chỉ có một mình anchor (không nick khác)', async () => {
    mockContactFindFirst.mockResolvedValue({ id: 'c-solo', phone: '0901111111' });
    mockContactFindMany.mockResolvedValue([
      { id: 'c-solo', phone: '0901111111', phone2: null, phone3: null, crmName: null,
        fullName: 'Một mình', avatarUrl: null, zaloUid: null, posCustomerId: null,
        posCustomerCode: null, friends: [] },
    ]);

    const res = await buildApp().inject({ method: 'GET', url: '/api/v1/contacts/c-solo/phone-family' });
    const body = res.json();
    expect(body.contacts).toHaveLength(0);
  });

  it('familyKey null khi SĐT anchor không chuẩn hoá được', async () => {
    mockContactFindFirst.mockResolvedValue({ id: 'c-bad', phone: '123' });
    const res = await buildApp().inject({ method: 'GET', url: '/api/v1/contacts/c-bad/phone-family' });
    const body = res.json();
    expect(body.familyKey).toBeNull();
    expect(body.contacts).toHaveLength(0);
    expect(mockContactFindMany).not.toHaveBeenCalled();
  });

  it('accessible=false cho contact ngoài scope của sale', async () => {
    mockGetContactScope.mockResolvedValue({
      isOrgAdmin: false,
      isDeptManager: false,
      visibleUserIds: new Set(['u1']),
      accessibleContactIds: ['c-base'], // chỉ thấy base, không thấy bản .1
      primaryContactIds: new Set(['c-base']),
    });
    mockContactFindFirst.mockResolvedValue({ id: 'c-base', phone: '0335862112' });
    mockContactFindMany.mockResolvedValue(FAMILY);

    const res = await buildApp().inject({ method: 'GET', url: URL });
    const body = res.json();
    expect(body.contacts.find((c: any) => c.id === 'c-base').accessible).toBe(true);
    expect(body.contacts.find((c: any) => c.id === 'c-dotted').accessible).toBe(false);
  });
});
