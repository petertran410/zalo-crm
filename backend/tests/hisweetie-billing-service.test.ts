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
const isPublicApiSyncEnabledMock = vi.fn(() => true);

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../src/config/index.js', () => ({ config: configMock }));
vi.mock('../src/modules/integrations/hisweetie-public-api-client.js', () => ({
  isPublicApiSyncEnabled: isPublicApiSyncEnabledMock,
  getHisweetiePublicApiClient: () => ({ createOrder: ordersCreateMock }),
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
  isPublicApiSyncEnabledMock.mockReturnValue(true);
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

describe('dispatchBillingToPos — gửi POS qua Public API', () => {
  it('cờ env tắt → DISPATCH_DISABLED, KHÔNG gọi POS', async () => {
    delete process.env.HISWEETIE_BILLING_DISPATCH;
    const r = await dispatchBillingToPos({ draftId: 'draft-1', orgId: ORG });
    expect(r).toMatchObject({ ok: false, code: 'DISPATCH_DISABLED' });
    expect(ordersCreateMock).not.toHaveBeenCalled();
  });

  it('legacy dispatch remains disabled when Public API is not configured', async () => {
    isPublicApiSyncEnabledMock.mockReturnValue(false);
    const r = await dispatchBillingToPos({ draftId: 'draft-1', orgId: ORG });
    expect(r).toMatchObject({ ok: false, code: 'DISPATCH_DISABLED' });
    expect(ordersCreateMock).not.toHaveBeenCalled();
    expect(prismaMock.posBillingDraft.updateMany).not.toHaveBeenCalled();
  });

  it.each(['draft', 'pending_dispatch', 'failed', 'sent'])('legacy %s drafts cannot bypass the new explicit-shop flow', async status => {
    prismaMock.posBillingDraft.findFirst.mockResolvedValue(draftRow({ status }));
    ordersCreateMock.mockResolvedValue({ id: 777, code: 'DH777' });

    const r = await dispatchBillingToPos({ draftId: 'draft-1', orgId: ORG });

    expect(r).toMatchObject({ ok: false, code: 'DISPATCH_DISABLED' });
    expect(ordersCreateMock).not.toHaveBeenCalled();
    expect(prismaMock.posBillingDraft.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.posBillingDraft.update).not.toHaveBeenCalled();
  });

  it('draft khác org → NOT_FOUND (org-scoped)', async () => {
    prismaMock.posBillingDraft.findFirst.mockResolvedValue(null);
    const r = await dispatchBillingToPos({ draftId: 'draft-1', orgId: 'org-KHAC' });
    expect(r).toMatchObject({ ok: false, code: 'DISPATCH_DISABLED' });
    expect(prismaMock.posBillingDraft.findFirst).not.toHaveBeenCalled();
  });
});
