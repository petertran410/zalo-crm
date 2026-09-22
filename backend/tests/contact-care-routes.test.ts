import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

const prismaMock = {
  contact: { findFirst: vi.fn() },
  contactProductInterest: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  contactWorkshopAttendance: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  contactComplaint: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(async (fn: any) => fn(prismaMock)),
  $queryRawUnsafe: vi.fn(),
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

const { contactCareRoutes, deriveProductInterests, resolveWindowMonths } = await import('../src/modules/contacts/contact-care-routes.js');

function app() {
  const instance = Fastify();
  instance.register(contactCareRoutes);
  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
  assertContactVisible.mockResolvedValue(true);
  assertContactEditable.mockResolvedValue(undefined);
  prismaMock.contact.findFirst.mockResolvedValue({ id: 'contact-1', posCustomerId: null });
  prismaMock.$queryRawUnsafe.mockResolvedValue([]);
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

  it('trả khối derived từ hoá đơn POS kèm giá trị nhập tay trong current', async () => {
    prismaMock.contactProductInterest.findFirst.mockResolvedValue({ value: '' });
    prismaMock.$queryRawUnsafe.mockResolvedValue([
      { posProductId: 2, productCode: 'C2', productName: 'Serum B', quantity: 1, orderId: 'o1', orderDate: new Date('2026-08-20') },
      { posProductId: 1, productCode: 'C1', productName: 'Kem A', quantity: 1, orderId: 'o2', orderDate: new Date('2026-08-25') },
    ]);

    const response = await app().inject({ method: 'GET', url: '/api/v1/contacts/contact-1/care-fields' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    // Sắp theo đơn gần nhất, không theo thứ tự trả về của DB.
    expect(body.derived.productInterests).toEqual(['Kem A', 'Serum B']);
    expect(body.derived.rankedBy).toBe('recency');
    expect(body.derived.latestOrderProductCount).toBe(1);
    expect(body.derived.source).toBe('pos-invoices');
    expect(body.derived.windowMonths).toBe(2);
    // current vẫn lấy từ lịch sử append, không bị derived ghi đè.
    expect(body.current.productInterest).toBe('');
    expect(prismaMock.$queryRawUnsafe).toHaveBeenCalled();
  });

  it('không sập drawer khi truy vấn POS lỗi — derived rỗng, current vẫn trả về', async () => {
    prismaMock.$queryRawUnsafe.mockRejectedValue(new Error('db down'));
    prismaMock.contactProductInterest.findFirst.mockResolvedValue({ value: 'Nhập tay' });

    const response = await app().inject({ method: 'GET', url: '/api/v1/contacts/contact-1/care-fields' });
    expect(response.statusCode).toBe(200);
    expect(response.json().derived.productInterests).toEqual([]);
    expect(response.json().current.productInterest).toBe('Nhập tay');
  });
});

describe('deriveProductInterests', () => {
  // Dòng mua hàng thật: mỗi dòng là một item của một đơn, kèm quantity + ngày đơn.
  // Mặc định cùng orderId để các test không quan tâm ngưỡng coi như một đơn.
  const d = (over: Partial<Parameters<typeof deriveProductInterests>[0][number]> = {}) => ({
    posProductId: null as number | null,
    productCode: null as string | null,
    productName: 'Sản phẩm',
    quantity: 1,
    orderId: 'o',
    orderDate: new Date('2026-08-01'),
    ...over,
  });

  it('khử trùng theo posProductId, cộng dồn số lượng và giữ tên của lần mua gần nhất', () => {
    const items = [
      d({ posProductId: 7, productName: 'Tên cũ', orderDate: new Date('2026-07-01'), quantity: 3 }),
      d({ posProductId: 7, productName: 'Tên mới', orderDate: new Date('2026-08-15'), quantity: 4 }),
    ];
    expect(deriveProductInterests(items).products).toEqual(['Tên mới']);
  });

  it('rơi xuống productCode khi không có posProductId', () => {
    const items = [
      d({ productCode: 'SKU-1', productName: 'Biến thể A', orderDate: new Date('2026-08-10') }),
      d({ productCode: 'SKU-1', productName: 'Biến thể B', orderDate: new Date('2026-08-20') }),
    ];
    expect(deriveProductInterests(items).products).toEqual(['Biến thể B']);
  });

  it('rơi xuống tên thường hoá khi không có cả hai bậc định danh', () => {
    const items = [
      d({ productName: '  Serum  ', orderDate: new Date('2026-08-10') }),
      d({ productName: 'serum', orderDate: new Date('2026-08-05') }),
    ];
    expect(deriveProductInterests(items).products).toEqual(['Serum']);
  });

  it('mặc định sắp xếp từ đơn gần nhất trở đi', () => {
    const items = [
      d({ posProductId: 1, productName: 'Cũ nhất', orderDate: new Date('2026-07-01') }),
      d({ posProductId: 3, productName: 'Gần nhất', orderDate: new Date('2026-08-30') }),
      d({ posProductId: 2, productName: 'Ở giữa', orderDate: new Date('2026-08-10') }),
    ];
    const result = deriveProductInterests(items);
    expect(result.products).toEqual(['Gần nhất', 'Ở giữa', 'Cũ nhất']);
    expect(result.rankedBy).toBe('recency');
  });

  it('giới hạn tối đa 5 sản phẩm duy nhất', () => {
    const items = Array.from({ length: 9 }, (_, i) =>
      d({ posProductId: i + 1, productName: `SP ${i + 1}`, orderDate: new Date(2026, 7, i + 1) }),
    );
    expect(deriveProductInterests(items).products).toHaveLength(5);
  });

  it('bỏ qua dòng tên rỗng và trả mảng rỗng khi không có dữ liệu', () => {
    expect(deriveProductInterests([d({ productName: '   ' }), d({ productName: '' })]).products).toEqual([]);
    expect(deriveProductInterests([])).toEqual({ products: [], rankedBy: 'recency', latestOrderProductCount: 0 });
  });

  describe('ngưỡng >= 5 sản phẩm của đơn gần nhất', () => {
    // Đơn gần nhất 4 mặt hàng: vẫn xếp theo thời gian dù sản phẩm cũ mua nhiều hơn.
    it('vẫn xếp theo recency khi đơn gần nhất có 4 sản phẩm khác nhau', () => {
      const recent = new Date('2026-08-30');
      const items = [
        // Món mua nhiều nhất nằm ở đơn CŨ — nếu nhảy sang quantity nó sẽ lên đầu.
        d({ posProductId: 99, productName: 'Mua nhiều', orderId: 'old', orderDate: new Date('2026-07-05'), quantity: 500 }),
        ...[1, 2, 3, 4].map((i) => d({ posProductId: i, productName: `Mới ${i}`, orderId: 'new', orderDate: recent, quantity: 1 })),
      ];
      const result = deriveProductInterests(items);
      expect(result.latestOrderProductCount).toBe(4);
      expect(result.rankedBy).toBe('recency');
      expect(result.products[0]).toBe('Mới 1');
      expect(result.products).toContain('Mua nhiều');
    });

    it('chuyển sang xếp theo TỔNG số lượng cả cửa sổ khi đơn gần nhất có 5 sản phẩm', () => {
      const recent = new Date('2026-08-30');
      const items = [
        d({ posProductId: 99, productName: 'Mua nhiều', orderId: 'old', orderDate: new Date('2026-07-05'), quantity: 500 }),
        ...[1, 2, 3, 4, 5].map((i) => d({ posProductId: i, productName: `Mới ${i}`, orderId: 'new', orderDate: recent, quantity: 2 })),
      ];
      const result = deriveProductInterests(items);
      expect(result.latestOrderProductCount).toBe(5);
      expect(result.rankedBy).toBe('quantity');
      // 500 > 2: món mua nhiều ở đơn cũ lên đầu dù không phải mua gần nhất.
      expect(result.products[0]).toBe('Mua nhiều');
      expect(result.products).toHaveLength(5);
    });

    it('cộng dồn số lượng qua nhiều đơn trước khi so', () => {
      const items = [
        // Đơn gần nhất có 5 món nên bật quantity; 'Lặp lại' mua 3 lần x100 = 300.
        d({ posProductId: 1, productName: 'Lặp lại', orderId: 'recent', orderDate: new Date('2026-08-30'), quantity: 100 }),
        d({ posProductId: 2, productName: 'Một lần', orderId: 'recent', orderDate: new Date('2026-08-30'), quantity: 250 }),
        d({ posProductId: 3, productName: 'Đệm 3', orderId: 'recent', orderDate: new Date('2026-08-30'), quantity: 1 }),
        d({ posProductId: 4, productName: 'Đệm 4', orderId: 'recent', orderDate: new Date('2026-08-30'), quantity: 1 }),
        d({ posProductId: 5, productName: 'Đệm 5', orderId: 'recent', orderDate: new Date('2026-08-30'), quantity: 1 }),
        d({ posProductId: 1, productName: 'Lặp lại', orderId: 'old1', orderDate: new Date('2026-07-10'), quantity: 100 }),
        d({ posProductId: 1, productName: 'Lặp lại', orderId: 'old2', orderDate: new Date('2026-07-01'), quantity: 100 }),
      ];
      const result = deriveProductInterests(items);
      expect(result.rankedBy).toBe('quantity');
      // 300 > 250: 'Lặp lại' thắng 'Một lần' nhờ cộng dồn, không phải nhờ mua gần.
      expect(result.products.slice(0, 2)).toEqual(['Lặp lại', 'Một lần']);
    });

    it('dùng thời gian làm tiebreak khi tổng số lượng bằng nhau', () => {
      const items = [
        d({ posProductId: 1, productName: 'Bằng nhau A', orderId: 'oA', orderDate: new Date('2026-07-01'), quantity: 10 }),
        d({ posProductId: 2, productName: 'Bằng nhau B', orderId: 'oB', orderDate: new Date('2026-08-20'), quantity: 10 }),
        // Đơn mới nhất đủ 5 món để bật quantity.
        ...[3, 4, 5, 6, 7].map((i) => d({ posProductId: i, productName: `Đủ ngưỡng ${i}`, orderId: 'oNew', orderDate: new Date('2026-08-30'), quantity: 1 })),
      ];
      const result = deriveProductInterests(items);
      expect(result.rankedBy).toBe('quantity');
      // Cùng 10 đơn vị: món mua gần hơn (B, 08-20) xếp trước món cũ (A, 07-01).
      expect(result.products.indexOf('Bằng nhau B')).toBeLessThan(result.products.indexOf('Bằng nhau A'));
    });

    it('tính riêng từng đơn trùng ngày — không đơn nào >= 5 thì vẫn recency', () => {
      const sameTs = new Date('2026-08-30T10:00:00Z');
      // Hai đơn trùng order_date, mỗi đơn 3 món. Gộp theo timestamp (cách cũ) sẽ ra 6
      // và nhảy sang quantity — sai, vì không đơn nào thực sự có >= 5 mặt hàng.
      const items = [
        ...[1, 2, 3].map((i) => d({ posProductId: i, productName: `Đơn A ${i}`, orderId: 'orderA', orderDate: sameTs, quantity: 1 })),
        ...[4, 5, 6].map((i) => d({ posProductId: i, productName: `Đơn B ${i}`, orderId: 'orderB', orderDate: sameTs, quantity: 1 })),
      ];
      const result = deriveProductInterests(items);
      expect(result.latestOrderProductCount).toBe(3);
      expect(result.rankedBy).toBe('recency');
      // Đảo thứ tự dòng không đổi kết quả: đơn thắng chốt bằng orderId, không bằng vị trí.
      const reversed = deriveProductInterests([...items].reverse());
      expect(reversed.latestOrderProductCount).toBe(3);
      expect(reversed.rankedBy).toBe('recency');
    });

    it('khi hai đơn trùng ngày có số món khác nhau, chốt đơn thắng theo orderId chứ không theo thứ tự dòng', () => {
      const sameTs = new Date('2026-08-30T10:00:00Z');
      // 'orderB' (5 món) > 'orderA' (1 món) nên orderB là đơn gần nhất được chọn → đủ ngưỡng.
      const bigOrder = [1, 2, 3, 4, 5].map((i) => d({ posProductId: i, productName: `B ${i}`, orderId: 'orderB', orderDate: sameTs, quantity: i }));
      const smallOrder = [d({ posProductId: 100, productName: 'A 1', orderId: 'orderA', orderDate: sameTs, quantity: 1 })];
      const forward = deriveProductInterests([...smallOrder, ...bigOrder]);
      const backward = deriveProductInterests([...bigOrder, ...smallOrder]);
      expect(forward.latestOrderProductCount).toBe(5);
      expect(backward.latestOrderProductCount).toBe(5);
      expect(forward.rankedBy).toBe('quantity');
      expect(backward.rankedBy).toBe('quantity');
    });

    it('chấp nhận orderDate dạng chuỗi ISO từ driver', () => {
      const items = [
        d({ posProductId: 1, productName: 'Cũ', orderDate: '2026-07-01T00:00:00.000Z', quantity: 9 }),
        d({ posProductId: 2, productName: 'Mới', orderDate: '2026-08-30T00:00:00.000Z', quantity: 1 }),
      ];
      const result = deriveProductInterests(items);
      expect(result.rankedBy).toBe('recency');
      expect(result.products).toEqual(['Mới', 'Cũ']);
    });
  });
});

describe('resolveWindowMonths', () => {
  const original = process.env.CARE_PRODUCT_WINDOW_MONTHS;
  afterEach(() => {
    if (original === undefined) delete process.env.CARE_PRODUCT_WINDOW_MONTHS;
    else process.env.CARE_PRODUCT_WINDOW_MONTHS = original;
  });

  it('mặc định 2 tháng khi không đặt env', () => {
    delete process.env.CARE_PRODUCT_WINDOW_MONTHS;
    expect(resolveWindowMonths()).toBe(2);
  });

  it('nhận giá trị env hợp lệ để nới cửa sổ khi test', () => {
    process.env.CARE_PRODUCT_WINDOW_MONTHS = '12';
    expect(resolveWindowMonths()).toBe(12);
  });

  it('rơi về 2 khi env không phải số hoặc ngoài khoảng 1-120', () => {
    // '1.9' không nằm ở đây vì parseInt cắt thành 1 — vẫn hợp lệ, không phải lỗi.
    for (const bad of ['abc', '', '0', '-3', '121']) {
      process.env.CARE_PRODUCT_WINDOW_MONTHS = bad;
      expect(resolveWindowMonths()).toBe(2);
    }
  });
});

describe('GET /api/v1/contacts/:contactId/care-fields/debug', () => {
  it('trả từng sản phẩm kèm đơn + hoá đơn nguồn', async () => {
    prismaMock.contact.findFirst.mockResolvedValue({ id: 'contact-1', posCustomerId: 40281 });
    prismaMock.$queryRawUnsafe.mockResolvedValue([
      {
        posProductId: 9, productCode: 'SP007382', productName: 'Sữa AMO 960ml',
        orderCode: 'DH037603', orderId: 37603, orderDate: new Date('2026-01-12'),
        orderStatus: 'completed', invoiceCode: 'HD097112', invoiceStatus: 'Đang xử lý', quantity: 2,
      },
    ]);

    const response = await app().inject({ method: 'GET', url: '/api/v1/contacts/contact-1/care-fields/debug' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.linkedToPos).toBe(true);
    expect(body.posCustomerId).toBe(40281);
    expect(body.derivedProducts).toEqual(['Sữa AMO 960ml']);
    expect(body.sourceCount).toBe(1);
    expect(body.sources[0]).toMatchObject({ orderCode: 'DH037603', invoiceCode: 'HD097112', productName: 'Sữa AMO 960ml' });
  });

  it('báo linkedToPos=false và sources rỗng khi contact chưa liên kết POS', async () => {
    prismaMock.contact.findFirst.mockResolvedValue({ id: 'contact-1', posCustomerId: null });
    prismaMock.$queryRawUnsafe.mockResolvedValue([]);
    const response = await app().inject({ method: 'GET', url: '/api/v1/contacts/contact-1/care-fields/debug' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ linkedToPos: false, sources: [], sourceCount: 0, derivedProducts: [] });
  });

  it('từ chối 404 khi contact không visible', async () => {
    assertContactVisible.mockResolvedValue(false);
    const response = await app().inject({ method: 'GET', url: '/api/v1/contacts/other/care-fields/debug' });
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
