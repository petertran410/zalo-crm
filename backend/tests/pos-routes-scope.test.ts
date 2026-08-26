// Phân quyền POS: dữ liệu thương mại của khách (đơn, công nợ, hồ sơ POS) chỉ
// mở cho sale phụ trách, người có grant `contact.view_all`, hoặc admin/owner.
// Trước đây các route này chỉ chặn bằng JWT nên mọi user đăng nhập đều đọc được
// công nợ của mọi khách.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

const prismaMock = {
  contact: { findUnique: vi.fn(), findFirst: vi.fn() },
  posCustomerDebt: { findFirst: vi.fn() },
  posInvoice: { findMany: vi.fn() },
};

const assertContactVisible = vi.fn();
const dispatch = vi.fn();

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (request: any) => {
    request.user = { id: 'sale-1', orgId: 'org-1', role: 'member' };
  },
}));
vi.mock('../src/modules/contacts/contact-scope.js', () => ({ assertContactVisible }));
vi.mock('../src/shared/commands/command-dispatcher.js', () => ({
  commandDispatcher: { dispatch: (...args: any[]) => dispatch(...args) },
}));
vi.mock('../src/modules/pos/commands/customer-commands.js', () => ({}));
vi.mock('../src/modules/pos/commands/order-commands.js', () => ({}));
vi.mock('../src/modules/integrations/hisweetie-public-api-client.js', () => ({
  getHisweetiePublicApiClient: vi.fn(() => ({ getCustomer: vi.fn(), searchCustomers: vi.fn(), listBranches: vi.fn() })),
  isPublicApiSyncEnabled: vi.fn(() => true),
}));

const { posRoutes } = await import('../src/modules/pos/pos-routes.js');

const CONTACT = 'contact-1';
const PROTECTED = [
  `/api/v1/pos/customers/${CONTACT}/debts`,
  `/api/v1/pos/customers/${CONTACT}/orders`,
  `/api/v1/pos/orders/contact/${CONTACT}`,
  `/api/v1/pos/contacts/${CONTACT}/status`,
];

async function app() {
  const instance = Fastify();
  await instance.register(posRoutes);
  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
  dispatch.mockResolvedValue({ success: true, data: [] });
  prismaMock.contact.findUnique.mockResolvedValue({ id: CONTACT, posCustomerId: null, phone: null });
  prismaMock.contact.findFirst.mockResolvedValue({ id: CONTACT, posCustomerId: null, posCustomerCode: null, fullName: 'KH', crmName: null, phone: null });
  prismaMock.posCustomerDebt.findFirst.mockResolvedValue(null);
  prismaMock.posInvoice.findMany.mockResolvedValue([]);
});

describe('Phân quyền POS theo contact-scope', () => {
  it('trả 404 và không đọc dữ liệu khi sale không phụ trách contact', async () => {
    assertContactVisible.mockResolvedValue(false);
    const instance = await app();

    for (const url of PROTECTED) {
      const res = await instance.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(404);
    }

    // Chặn trước khi chạm dữ liệu: không query, không dispatch command.
    expect(prismaMock.posCustomerDebt.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.posInvoice.findMany).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('cho qua khi contact-scope xác nhận sale có quyền', async () => {
    assertContactVisible.mockResolvedValue(true);
    const instance = await app();

    for (const url of PROTECTED) {
      const res = await instance.inject({ method: 'GET', url });
      expect(res.statusCode, url).not.toBe(404);
    }
    expect(assertContactVisible).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'sale-1', orgId: 'org-1', contactId: CONTACT }),
    );
  });

  it('chặn cả thao tác ghi: liên kết và huỷ liên kết POS', async () => {
    assertContactVisible.mockResolvedValue(false);
    const instance = await app();

    const link = await instance.inject({
      method: 'POST', url: `/api/v1/pos/contacts/${CONTACT}/link`,
      payload: { posCustomerId: 21133 },
    });
    const unlink = await instance.inject({ method: 'DELETE', url: `/api/v1/pos/contacts/${CONTACT}/link` });

    expect(link.statusCode).toBe(404);
    expect(unlink.statusCode).toBe(404);
  });
});
