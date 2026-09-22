import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

const mockContactFindFirst = vi.fn();
const mockContactFindMany = vi.fn();
const mockPosCustomerFindFirst = vi.fn();
const mockPosCustomerFindMany = vi.fn();
const mockGetContactScope = vi.fn();

vi.mock('../../src/shared/database/prisma-client.js', () => ({
  prisma: {
    contact: {
      findFirst: (...a: any[]) => mockContactFindFirst(...a),
      findMany: (...a: any[]) => mockContactFindMany(...a),
    },
    posCustomer: {
      findFirst: (...a: any[]) => mockPosCustomerFindFirst(...a),
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

const URL = '/api/v1/contacts/c1/chain-family';

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(contactFamilyRoutes);
  return app;
}

// Hai Contact cùng công ty POS "Gong Cha Việt Nam", khác posId.
const CHAIN = [
  {
    id: 'c1', phone: '0901111111', phone2: null, phone3: null,
    crmName: 'Gong Cha Quận 1', fullName: 'Gong Cha Quận 1',
    avatarUrl: null, zaloUid: null, posCustomerId: 10, posCustomerCode: 'P10',
    friends: [],
  },
  {
    id: 'c2', phone: '0902222222', phone2: null, phone3: null,
    crmName: 'Gong Cha Quận 7', fullName: 'Gong Cha Quận 7',
    avatarUrl: null, zaloUid: null, posCustomerId: 20, posCustomerCode: 'P20',
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
  // Cả bước tìm posId cùng org và bước enrichment POS đều dùng findMany.
  mockPosCustomerFindMany.mockResolvedValue([
    { posId: 10, code: 'P10', name: 'Gong Cha Quận 1', assignedSaleName: 'saleA' },
    { posId: 20, code: 'P20', name: 'Gong Cha Quận 7', assignedSaleName: 'saleB' },
  ]);
});

describe('GET /api/v1/contacts/:id/chain-family', () => {
  it('404 khi anchor không tồn tại trong org', async () => {
    mockContactFindFirst.mockResolvedValue(null);
    const res = await buildApp().inject({ method: 'GET', url: URL });
    expect(res.statusCode).toBe(404);
  });

  it('rỗng khi anchor không có liên kết POS', async () => {
    mockContactFindFirst.mockResolvedValue({ id: 'c1', posCustomerId: null });
    const res = await buildApp().inject({ method: 'GET', url: URL });
    const body = res.json();
    expect(body.chainKey).toBeNull();
    expect(body.contacts).toHaveLength(0);
    expect(mockContactFindMany).not.toHaveBeenCalled();
  });

  it('rỗng khi POS không phải hồ sơ tổ chức (chống chuỗi giả)', async () => {
    mockContactFindFirst.mockResolvedValue({ id: 'c1', posCustomerId: 10 });
    mockPosCustomerFindFirst.mockResolvedValue({
      organization: 'Nguyễn Văn A', isOrganization: false,
    });
    const res = await buildApp().inject({ method: 'GET', url: URL });
    const body = res.json();
    expect(body.chainKey).toBeNull();
    expect(body.contacts).toHaveLength(0);
    expect(mockContactFindMany).not.toHaveBeenCalled();
  });

  it('rỗng khi organization trống', async () => {
    mockContactFindFirst.mockResolvedValue({ id: 'c1', posCustomerId: 10 });
    mockPosCustomerFindFirst.mockResolvedValue({
      organization: '   ', isOrganization: true,
    });
    const res = await buildApp().inject({ method: 'GET', url: URL });
    const body = res.json();
    expect(body.chainKey).toBeNull();
    expect(body.contacts).toHaveLength(0);
  });

  it('nhóm được 2 Contact cùng công ty, đánh dấu isCurrent', async () => {
    mockContactFindFirst.mockResolvedValue({ id: 'c1', posCustomerId: 10 });
    mockPosCustomerFindFirst.mockResolvedValue({
      organization: 'Gong Cha Việt Nam', isOrganization: true,
    });
    mockContactFindMany.mockResolvedValue(CHAIN);

    const res = await buildApp().inject({ method: 'GET', url: URL });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.chainKey).toBe('Gong Cha Việt Nam');
    expect(body.contacts).toHaveLength(2);
    expect(body.contacts.find((c: any) => c.id === 'c1').isCurrent).toBe(true);
    expect(body.contacts.find((c: any) => c.id === 'c2').isCurrent).toBe(false);
  });

  it('query contact lọc theo posCustomerId của các POS cùng org', async () => {
    mockContactFindFirst.mockResolvedValue({ id: 'c1', posCustomerId: 10 });
    mockPosCustomerFindFirst.mockResolvedValue({
      organization: 'Gong Cha Việt Nam', isOrganization: true,
    });
    mockContactFindMany.mockResolvedValue(CHAIN);

    await buildApp().inject({ method: 'GET', url: URL });
    const contactQuery = mockContactFindMany.mock.calls[0][0];
    expect(contactQuery.where.orgId).toBe('org1');
    expect(contactQuery.where.mergedInto).toBeNull();
    expect(contactQuery.where.archivedAt).toBeNull();
    expect(contactQuery.where.posCustomerId.in).toEqual([10, 20]);
  });

  it('rỗng khi chỉ có một mình anchor trong chuỗi', async () => {
    mockContactFindFirst.mockResolvedValue({ id: 'c1', posCustomerId: 10 });
    mockPosCustomerFindFirst.mockResolvedValue({
      organization: 'Gong Cha Việt Nam', isOrganization: true,
    });
    mockContactFindMany.mockResolvedValue([CHAIN[0]]);

    const res = await buildApp().inject({ method: 'GET', url: URL });
    const body = res.json();
    expect(body.chainKey).toBe('Gong Cha Việt Nam');
    expect(body.contacts).toHaveLength(0);
  });

  it('accessible=false cho contact ngoài scope của sale', async () => {
    mockGetContactScope.mockResolvedValue({
      isOrgAdmin: false,
      isDeptManager: false,
      visibleUserIds: new Set(['u1']),
      accessibleContactIds: ['c1'],
      primaryContactIds: new Set(['c1']),
    });
    mockContactFindFirst.mockResolvedValue({ id: 'c1', posCustomerId: 10 });
    mockPosCustomerFindFirst.mockResolvedValue({
      organization: 'Gong Cha Việt Nam', isOrganization: true,
    });
    mockContactFindMany.mockResolvedValue(CHAIN);

    const res = await buildApp().inject({ method: 'GET', url: URL });
    const body = res.json();
    expect(body.contacts.find((c: any) => c.id === 'c1').accessible).toBe(true);
    expect(body.contacts.find((c: any) => c.id === 'c2').accessible).toBe(false);
  });
});
