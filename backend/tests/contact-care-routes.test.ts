import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

const prismaMock = {
  contact: { findFirst: vi.fn() },
  contactProductInterest: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  contactWorkshopAttendance: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  contactComplaint: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(async (fn: any) => fn(prismaMock)),
};

const assertContactVisible = vi.fn();
const assertContactEditable = vi.fn();

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (request: any) => {
    request.user = { id: 'user-1', orgId: 'org-1', role: 'member' };
  },
}));
vi.mock('../src/modules/contacts/contact-scope.js', () => ({
  assertContactVisible,
  assertContactEditable,
}));

const { contactCareRoutes } = await import('../src/modules/contacts/contact-care-routes.js');

function app() {
  const instance = Fastify();
  instance.register(contactCareRoutes);
  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
  assertContactVisible.mockResolvedValue(true);
  assertContactEditable.mockResolvedValue(undefined);
  prismaMock.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
  prismaMock.contactProductInterest.findMany.mockResolvedValue([]);
  prismaMock.contactWorkshopAttendance.findMany.mockResolvedValue([]);
  prismaMock.contactComplaint.findMany.mockResolvedValue([]);
  prismaMock.contactProductInterest.findFirst.mockResolvedValue(null);
  prismaMock.contactWorkshopAttendance.findFirst.mockResolvedValue(null);
  prismaMock.contactComplaint.findFirst.mockResolvedValue(null);
  prismaMock.contactProductInterest.create.mockResolvedValue({});
  prismaMock.contactWorkshopAttendance.create.mockResolvedValue({});
  prismaMock.contactComplaint.create.mockResolvedValue({});
});

describe('GET /api/v1/contacts/:contactId/care-fields', () => {
  it('trả lịch sử append và giá trị hiện tại mới nhất', async () => {
    prismaMock.contactProductInterest.findMany.mockResolvedValue([
      { id: 'p2', value: 'Serum mới', createdByUserId: 'user-1', createdAt: new Date() },
      { id: 'p1', value: 'Serum', createdByUserId: 'user-1', createdAt: new Date() },
    ]);
    prismaMock.contactProductInterest.findFirst.mockResolvedValue({ value: 'Serum mới' });
    prismaMock.contactComplaint.findMany.mockResolvedValue([
      { id: 'c1', value: '', createdByUserId: 'user-1', createdAt: new Date() },
    ]);
    // bản ghi rỗng là tombstone — current phản ánh bản ghi mới nhất, không chỉ bản ghi khác rỗng.
    prismaMock.contactComplaint.findFirst.mockResolvedValue({ value: '' });

    const response = await app().inject({ method: 'GET', url: '/api/v1/contacts/contact-1/care-fields' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.productInterests).toHaveLength(2);
    expect(body.current).toEqual({ productInterest: 'Serum mới', workshopsAttended: '', complaints: '' });
    expect(prismaMock.contact.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'contact-1', orgId: 'org-1' },
    }));
  });

  it('từ chối 404 khi contact không visible', async () => {
    assertContactVisible.mockResolvedValue(false);
    const response = await app().inject({ method: 'GET', url: '/api/v1/contacts/other/care-fields' });
    expect(response.statusCode).toBe(404);
  });

  it('từ chối 404 khi contact thuộc org khác', async () => {
    prismaMock.contact.findFirst.mockResolvedValue(null);
    const response = await app().inject({ method: 'GET', url: '/api/v1/contacts/contact-1/care-fields' });
    expect(response.statusCode).toBe(404);
  });
});

describe('PUT /api/v1/contacts/:contactId/care-fields', () => {
  it('từ chối 403 khi không có quyền sửa contact', async () => {
    const err = new Error('no edit') as any;
    err.statusCode = 403;
    err.code = 'CONTACT_EDIT_FORBIDDEN';
    assertContactEditable.mockRejectedValue(err);
    const response = await app().inject({
      method: 'PUT',
      url: '/api/v1/contacts/contact-1/care-fields',
      payload: { productInterest: 'Serum' },
    });
    expect(response.statusCode).toBe(403);
    expect(prismaMock.contactProductInterest.create).not.toHaveBeenCalled();
  });

  it('từ chối 400 khi giá trị không phải string hoặc quá dài', async () => {
    const response = await app().inject({
      method: 'PUT',
      url: '/api/v1/contacts/contact-1/care-fields',
      payload: { productInterest: 123, complaints: 'x'.repeat(5001) },
    });
    expect(response.statusCode).toBe(400);
  });

  it('chỉ append khi giá trị mới khác giá trị gần nhất', async () => {
    prismaMock.contactProductInterest.findFirst.mockResolvedValue({ value: 'Serum' });
    const response = await app().inject({
      method: 'PUT',
      url: '/api/v1/contacts/contact-1/care-fields',
      payload: { productInterest: 'Serum', workshopsAttended: 'Workshop A' },
    });
    expect(response.statusCode).toBe(200);
    expect(prismaMock.contactProductInterest.create).not.toHaveBeenCalled();
    expect(prismaMock.contactWorkshopAttendance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orgId: 'org-1', contactId: 'contact-1', value: 'Workshop A', createdByUserId: 'user-1' }),
    });
  });

  it('lưu tombstone rỗng để xoá giá trị hiện tại nhưng giữ lịch sử', async () => {
    prismaMock.contactProductInterest.findFirst.mockResolvedValue({ value: 'Serum' });
    await app().inject({
      method: 'PUT',
      url: '/api/v1/contacts/contact-1/care-fields',
      payload: { productInterest: '   ' },
    });
    expect(prismaMock.contactProductInterest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ value: '' }),
    });
  });
});
