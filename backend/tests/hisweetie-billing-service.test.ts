/**
 * hisweetie-billing-service.test.ts — dispatch draft → POS SANDBOX (2026-07-18).
 *
 * Rủi ro cao nhất của cầu CRM→POS: gửi đôi đơn (double-click/race), gửi nhầm
 * môi trường (production), và draft kẹt trạng thái khi POS lỗi. Test chốt cả 3.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  contact: { findFirst: vi.fn() },
  posBillingDraft: {
    create: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
};
const ordersCreateMock = vi.fn();
// config mutable để test đổi URL sang production
const configMock = { hisweetieMcpUrl: 'https://sandbox-mcp.hisweetievietnam.com' };

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../src/config/index.js', () => ({ config: configMock }));
vi.mock('../src/modules/integrations/hisweetie-mcp-client.js', () => ({
  isHisweetieMcpConfigured: () => true,
  getHisweetieClient: () => ({ orders: { create: ordersCreateMock } }),
}));

const { createBillingDraft, dispatchBillingToPos } = await import('../src/modules/integrations/hisweetie-billing-service.js');

const ORG = 'org-1';
const IDEM = '11111111-2222-3333-4444-555555555555';

function draftRow(over: Record<string, unknown> = {}) {
  return {
    id: 'draft-1', orgId: ORG, contactId: 'c-1', createdByUserId: 'u-1',
    posCustomerId: 65550, posCustomerName: 'Chị Hoa', branchId: 2,
    items: [{ productId: 10, quantity: 2, unitPrice: 50000, productName: 'Trà đào cam sả', unit: 'hộp' }],
    totalAmount: '100000', paidAmount: null, description: 'Giao giờ hành chính',
    status: 'draft', idempotencyKey: IDEM, posOrderId: null, posInvoiceId: null,
    dispatchError: null, dispatchedAt: null, sourceMessageId: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.HISWEETIE_BILLING_DISPATCH = 'enabled';
  configMock.hisweetieMcpUrl = 'https://sandbox-mcp.hisweetievietnam.com';
  prismaMock.posBillingDraft.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.posBillingDraft.update.mockResolvedValue({});
});

describe('createBillingDraft — snapshot KH + SP', () => {
  it('lưu posCustomerName (crmName ưu tiên) + items kèm productName', async () => {
    prismaMock.contact.findFirst.mockResolvedValue({
      id: 'c-1', posCustomerId: 65550, archivedAt: null, crmName: 'Chị Hoa VIP', fullName: 'Nguyễn Thị Hoa',
    });
    prismaMock.posBillingDraft.create.mockResolvedValue({ id: 'draft-9' });

    const r = await createBillingDraft({
      orgId: ORG, contactId: 'c-1', createdByUserId: 'u-1', branchId: 2,
      items: [{ productId: 10, quantity: 2, unitPrice: 50000, productName: 'Trà đào cam sả', unit: 'hộp' }],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.posCustomerName).toBe('Chị Hoa VIP');
    const data = prismaMock.posBillingDraft.create.mock.calls[0][0].data;
    expect(data.posCustomerName).toBe('Chị Hoa VIP');
    expect(data.items[0]).toMatchObject({ productId: 10, productName: 'Trà đào cam sả', unit: 'hộp' });
    expect(data.status).toBe('draft');
  });
});

describe('dispatchBillingToPos — gửi POS sandbox', () => {
  it('cờ env tắt → DISPATCH_DISABLED, KHÔNG gọi POS', async () => {
    delete process.env.HISWEETIE_BILLING_DISPATCH;
    const r = await dispatchBillingToPos({ draftId: 'draft-1', orgId: ORG });
    expect(r).toMatchObject({ ok: false, code: 'DISPATCH_DISABLED' });
    expect(ordersCreateMock).not.toHaveBeenCalled();
  });

  it('URL production → THROW (sandbox guard), KHÔNG gọi POS, KHÔNG đụng draft', async () => {
    configMock.hisweetieMcpUrl = 'https://mcp.hisweetievietnam.com';
    await expect(dispatchBillingToPos({ draftId: 'draft-1', orgId: ORG })).rejects.toThrow(/sandbox/);
    expect(ordersCreateMock).not.toHaveBeenCalled();
    expect(prismaMock.posBillingDraft.updateMany).not.toHaveBeenCalled();
  });

  it('happy path: payload mang tên KH + tên SP, DÙNG LẠI idempotencyKey, status→sent', async () => {
    prismaMock.posBillingDraft.findFirst.mockResolvedValue(draftRow());
    ordersCreateMock.mockResolvedValue({ id: 777 });

    const r = await dispatchBillingToPos({ draftId: 'draft-1', orgId: ORG });

    expect(r).toEqual({ ok: true, posOrderId: 777 });
    const [payload, idem] = ordersCreateMock.mock.calls[0];
    expect(idem).toBe(IDEM); // key sinh lúc tạo draft — retry không nhân đôi đơn
    expect(payload.customerId).toBe(65550);
    expect(payload.branchId).toBe(2);
    expect(payload.description).toContain('Chị Hoa');
    expect(payload.description).toContain('draft-1');
    expect(payload.description).toContain('Giao giờ hành chính');
    expect(payload.items[0].note).toBe('Trà đào cam sả');
    // KHÔNG gửi key tự chế (bài học addresses goal 2)
    expect(Object.keys(payload.items[0]).sort()).toEqual(['note', 'productId', 'quantity', 'unitPrice']);

    const sentUpdate = prismaMock.posBillingDraft.update.mock.calls[0][0];
    expect(sentUpdate.data.status).toBe('sent');
    expect(sentUpdate.data.posOrderId).toBe(777);
    expect(sentUpdate.data.dispatchedAt).toBeInstanceOf(Date);
  });

  it('draft đã sent → ALREADY_SENT kèm posOrderId, không gửi lại', async () => {
    prismaMock.posBillingDraft.findFirst.mockResolvedValue(draftRow({ status: 'sent', posOrderId: 555 }));
    const r = await dispatchBillingToPos({ draftId: 'draft-1', orgId: ORG });
    expect(r).toMatchObject({ ok: false, code: 'ALREADY_SENT', posOrderId: 555 });
    expect(ordersCreateMock).not.toHaveBeenCalled();
  });

  it('thua race claim (updateMany count=0) → IN_FLIGHT, không gửi', async () => {
    prismaMock.posBillingDraft.findFirst.mockResolvedValue(draftRow());
    prismaMock.posBillingDraft.updateMany.mockResolvedValue({ count: 0 });
    const r = await dispatchBillingToPos({ draftId: 'draft-1', orgId: ORG });
    expect(r).toMatchObject({ ok: false, code: 'IN_FLIGHT' });
    expect(ordersCreateMock).not.toHaveBeenCalled();
  });

  it('POS lỗi → status=failed + dispatchError lưu lại, trả POS_ERROR', async () => {
    prismaMock.posBillingDraft.findFirst.mockResolvedValue(draftRow());
    ordersCreateMock.mockRejectedValue(new Error('MCP tool crm_create_order failed: branch closed'));

    const r = await dispatchBillingToPos({ draftId: 'draft-1', orgId: ORG });

    expect(r).toMatchObject({ ok: false, code: 'POS_ERROR' });
    const failUpdate = prismaMock.posBillingDraft.update.mock.calls[0][0];
    expect(failUpdate.data.status).toBe('failed');
    expect(failUpdate.data.dispatchError).toContain('branch closed');
  });

  it('draft khác org → NOT_FOUND (org-scoped)', async () => {
    prismaMock.posBillingDraft.findFirst.mockResolvedValue(null);
    const r = await dispatchBillingToPos({ draftId: 'draft-1', orgId: 'org-KHAC' });
    expect(r).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(prismaMock.posBillingDraft.findFirst.mock.calls[0][0].where.orgId).toBe('org-KHAC');
  });

  it('response POS không có id nhận ra được → vẫn sent, posOrderId=null', async () => {
    prismaMock.posBillingDraft.findFirst.mockResolvedValue(draftRow());
    ordersCreateMock.mockResolvedValue({ weird: 'shape' });
    const r = await dispatchBillingToPos({ draftId: 'draft-1', orgId: ORG });
    expect(r).toEqual({ ok: true, posOrderId: null });
    expect(prismaMock.posBillingDraft.update.mock.calls[0][0].data.status).toBe('sent');
  });
});
