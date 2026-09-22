import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

const prismaMock = {
  contact: { findFirst: vi.fn() },
  contactAccess: { findMany: vi.fn() },
  appointment: { findMany: vi.fn() },
  note: { findMany: vi.fn() },
  task: { findMany: vi.fn() },
  ticket: { findMany: vi.fn() },
  posOrder: { findMany: vi.fn(), aggregate: vi.fn() },
  posCustomerDebt: { findFirst: vi.fn() },
  posInvoice: { findMany: vi.fn(), aggregate: vi.fn() },
  posCustomer: { findFirst: vi.fn() },
  posSaleMapping: { findFirst: vi.fn() },
  $queryRawUnsafe: vi.fn(),
};

const assertContactVisible = vi.fn();
const getContactScope = vi.fn();

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (request: any) => {
    request.user = { id: 'user-1', orgId: 'org-1', role: 'member' };
  },
}));
vi.mock('../src/modules/contacts/contact-scope.js', () => ({
  assertContactVisible,
  getContactScope,
}));

const { customer360Routes } = await import('../src/modules/contacts/customer-360-routes.js');

const contact = {
  id: 'contact-1', fullName: 'Nguyễn Văn A', crmName: null, phone: '0900000000',
  phone2: null, phone3: null, email: null, avatarUrl: null, source: 'zalo',
  status: 'active', posCustomerId: 99, posCustomerCode: 'KH099', posSyncedAt: new Date('2026-08-21'),
  assignedUser: { id: 'user-1', fullName: 'Sale A', email: 'sale@example.com' },
  createdAt: new Date(), updatedAt: new Date(),
};

function app() {
  const instance = Fastify();
  instance.register(customer360Routes);
  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
  assertContactVisible.mockResolvedValue(true);
  getContactScope.mockResolvedValue({ isOrgAdmin: false, primaryContactIds: new Set(['contact-1']) });
  prismaMock.contact.findFirst.mockResolvedValue(contact);
  prismaMock.contactAccess.findMany.mockResolvedValue([]);
  prismaMock.appointment.findMany.mockResolvedValue([]);
  prismaMock.note.findMany.mockResolvedValue([]);
  prismaMock.task.findMany.mockResolvedValue([]);
  prismaMock.ticket.findMany.mockResolvedValue([]);
  prismaMock.posOrder.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
    {
      id: 'order-1', code: 'HD0001', orderDate: new Date('2026-08-20'), branchName: 'Q1',
      items: [{ posProductId: 12, productCode: 'SP12', productName: 'Trà sữa', quantity: 2, totalPrice: 100000 }],
    },
  ]);
  prismaMock.posOrder.aggregate.mockResolvedValue({ _count: { id: 2 }, _sum: { finalAmount: 1250000 } });
  prismaMock.posCustomerDebt.findFirst.mockResolvedValue(null);
  prismaMock.posInvoice.findMany.mockResolvedValue([
    { id: 'invoice-1', remainingDebt: 500000, dueDate: null },
  ]);
  // Tổng nợ lấy từ aggregate (toàn bộ), không cộng từ trang hiển thị.
  prismaMock.posInvoice.aggregate
    .mockResolvedValueOnce({ _count: { id: 88 }, _sum: { remainingDebt: 1656423732 } })
    .mockResolvedValueOnce({ _sum: { remainingDebt: 0 } });
  prismaMock.posCustomer.findFirst.mockResolvedValue({
    customerType: 'Khách buôn', organization: 'CÔNG TY TNHH ABC',
    taxCode: '2401026619', isOrganization: true, assignedSaleName: 'phuongnt',
  });
  prismaMock.posSaleMapping.findFirst.mockResolvedValue({
    user: { id: 'user-2', fullName: 'Nguyễn Thị Phương', email: 'phuongnt@example.com' },
  });
  // Tín hiệu hành trình chạy 5 câu raw SQL — phân biệt theo nội dung query.
  prismaMock.$queryRawUnsafe.mockImplementation(async (sql: string) => {
    if (sql.includes('avg(')) return [{ first_order: new Date('2025-07-04'), last_order: new Date(), orders: 516, avg_amount: 47325995 }];
    if (sql.includes('to_char')) return [
      { month: '2026-08', orders: 44, revenue: 2165889200 },
      { month: '2026-07', orders: 56, revenue: 3757380800 },
    ];
    if (sql.includes('max(o.order_date)::date')) return [
      { productName: 'Trân châu Olong Nhài', quantity: 1898, orderCount: 29, lastPurchasedAt: new Date('2025-10-20'), quietDays: 308 },
    ];
    if (sql.includes('min(o.order_date)')) return [
      { productName: 'Siro Nho Xanh', firstPurchasedAt: new Date('2026-07-14'), orderCount: 10 },
    ];
    if (sql.includes('remaining_debt')) return [{ bucket: '0-30', invoices: 88, debt: 1656423732 }];
    return [];
  });
});

describe('GET /api/v1/contacts/:id/customer-360', () => {
  it('returns the org-scoped customer, commerce and service read model', async () => {
    const response = await app().inject({ method: 'GET', url: '/api/v1/contacts/contact-1/customer-360?limit=100' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.contact.id).toBe('contact-1');
    expect(body.contact.viewerRole).toBe('primary');
    expect(body.commerce.orders.total).toBe(2);
    expect(body.commerce.orders.lifetimeValue).toBe(1250000);
    expect(body.commerce.debt.totalDebt).toBe(1656423732);
    expect(body.commerce.debt.invoiceCount).toBe(88);
    expect(body.commerce.purchasedProducts.items).toEqual([expect.objectContaining({
      productName: 'Trà sữa', quantity: 2, orderCount: 1, grossRevenue: 100000,
    })]);
    expect(body.meta.limit).toBe(50);
    expect(prismaMock.posOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ orgId: 'org-1' }),
      take: 50,
    }));
  });

  // Phương án C (2026-08-25): khách đã liên kết POS → nhóm/công ty/mã sale lấy từ POS.
  it('trả profile POS + tín hiệu hành trình cho khách đã liên kết', async () => {
    const response = await app().inject({ method: 'GET', url: '/api/v1/contacts/contact-1/customer-360' });
    const body = response.json();

    expect(body.profile).toEqual(expect.objectContaining({
      linkedToPos: true,
      segment: 'Khách buôn',
      organization: 'CÔNG TY TNHH ABC',
      taxCode: '2401026619',
      posSaleCode: 'phuongnt',
      posSaleUser: expect.objectContaining({ fullName: 'Nguyễn Thị Phương' }),
    }));
    expect(body.journey.tenureDays).toBeGreaterThan(0);
    expect(body.journey.monthlyTrend[0]).toEqual({ month: '2026-08', orders: 44, revenue: 2165889200 });
    expect(body.journey.churnedProducts[0].productName).toBe('Trân châu Olong Nhài');
    expect(body.journey.newProducts[0].productName).toBe('Siro Nho Xanh');
    expect(body.journey.debtAging).toEqual([{ bucket: '0-30', invoices: 88, debt: 1656423732 }]);
  });

  // Khách CHƯA liên kết POS → segment = null (không tự chế), phân loại bằng
  // trạng thái chăm sóc CRM sẵn có; không truy vấn hồ sơ POS.
  it('không trả segment POS khi chưa liên kết — dùng trạng thái CRM', async () => {
    prismaMock.contact.findFirst.mockResolvedValue({ ...contact, posCustomerId: null, status: 'interested' });
    const response = await app().inject({ method: 'GET', url: '/api/v1/contacts/contact-1/customer-360' });
    const body = response.json();

    expect(body.profile.linkedToPos).toBe(false);
    expect(body.profile.segment).toBeNull();
    expect(body.profile.crmStatus).toBe('interested');
    expect(prismaMock.posCustomer.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.posSaleMapping.findFirst).not.toHaveBeenCalled();
  });

  // Hồi quy: POS trả status tiếng Việt theo luồng giao hàng ("Hoàn thành",
  // "Đã hủy"…). Lọc bằng ['Unpaid','Partial','Overdue'] hay so sánh
  // status !== 'Cancelled' đều không khớp bản ghi nào trên dữ liệu thật.
  it('loại đơn/hoá đơn đã huỷ bằng status tiếng Việt, không dùng nhãn tiếng Anh', async () => {
    await app().inject({ method: 'GET', url: '/api/v1/contacts/contact-1/customer-360' });

    const cancelled = ['Đã hủy', 'Đã huỷ', 'Cancelled', 'Void'];

    // LTV và "sản phẩm đã mua" phải loại đơn huỷ.
    for (const call of prismaMock.posOrder.aggregate.mock.calls) {
      expect(call[0].where.NOT).toEqual({ status: { in: cancelled } });
    }

    // Công nợ: lọc theo số tiền còn nợ + loại hoá đơn huỷ.
    for (const call of prismaMock.posInvoice.aggregate.mock.calls) {
      expect(call[0].where.remainingDebt).toEqual({ gt: 0 });
      expect(call[0].where.NOT).toEqual({ status: { in: cancelled } });
    }
    expect(prismaMock.posInvoice.aggregate).toHaveBeenCalledTimes(2);
  });

  it('returns 404 before reading any customer data when contact is inaccessible', async () => {
    assertContactVisible.mockResolvedValue(false);

    const response = await app().inject({ method: 'GET', url: '/api/v1/contacts/contact-1/customer-360' });

    expect(response.statusCode).toBe(404);
    expect(prismaMock.contact.findFirst).not.toHaveBeenCalled();
  });
});
