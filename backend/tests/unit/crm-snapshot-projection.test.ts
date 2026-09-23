import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ snapshot: null as any }));
const db = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  posSnapshot: {
    findUnique: vi.fn(async () => state.snapshot),
    upsert: vi.fn(async ({ create, update }) => { state.snapshot = state.snapshot ? { ...state.snapshot, ...update } : create; return state.snapshot; }),
    update: vi.fn(async ({ data }) => { Object.assign(state.snapshot, data); return state.snapshot; }),
  },
  posOrder: { upsert: vi.fn(async () => ({ id: 'local-order' })) },
  posOrderItem: { deleteMany: vi.fn(), createMany: vi.fn() },
  posInvoice: { upsert: vi.fn() },
  posCustomer: { upsert: vi.fn() },
  posCustomerDebt: { upsert: vi.fn() },
}));
vi.mock('../../src/shared/database/prisma-client.js', () => ({
  tenantTransaction: (fn: (tx: typeof db) => unknown) => fn(db),
}));
import { applyPosSnapshots } from '../../src/modules/pos/pos-snapshot-service.js';
beforeEach(() => { vi.clearAllMocks(); state.snapshot = null; });
const order = { id: 7, customerId: 8, updatedAt: '2026-09-21T03:00:00Z', total: 100, status: 1, statusValue: 'Phiếu tạm' };
describe('transactional POS projection', () => {
  it('ignores a stale update after a newer order was applied', async () => {
    await applyPosSnapshots('org', 'orders', [order]);
    await applyPosSnapshots('org', 'orders', [{ ...order, total: 5, updatedAt: '2026-09-20T03:00:00Z' }]);
    expect(db.posOrder.upsert).toHaveBeenCalledTimes(1);
    expect(state.snapshot.payload.total).toBe(100);
  });
  it('never creates customer debt from a draft order', async () => {
    await applyPosSnapshots('org', 'orders', [order]);
    expect(db.posOrder.upsert.mock.calls[0][0].create.debtAmount).toBe(0);
    expect(db.posCustomerDebt.upsert).not.toHaveBeenCalled();
  });
  it('replaces a supplied empty item list, but preserves items when details are omitted', async () => {
    await applyPosSnapshots('org', 'orders', [{ ...order, items: [{ productId: 2, productName: 'Tea', quantity: 1, unitPrice: 100 }] }]);
    await applyPosSnapshots('org', 'orders', [{ ...order, updatedAt: '2026-09-21T04:00:00Z' }]);
    expect(db.posOrderItem.deleteMany).toHaveBeenCalledTimes(1);
    await applyPosSnapshots('org', 'orders', [{ ...order, updatedAt: '2026-09-21T05:00:00Z', items: [] }]);
    expect(db.posOrderItem.deleteMany).toHaveBeenCalledTimes(2);
    expect(db.posOrderItem.createMany).toHaveBeenCalledTimes(1);
  });
  it('enriches same-version details after a lightweight webhook', async () => {
    await applyPosSnapshots('org', 'orders', [order]);
    await applyPosSnapshots('org', 'orders', [{ ...order, items: [{ productId: 2, quantity: 1, unitPrice: 100 }] }]);
    expect(db.posOrderItem.createMany).toHaveBeenCalledTimes(1);
  });
  it('preserves a POS credit balance and does not invent a missing balance', async () => {
    await applyPosSnapshots('org', 'customers', [{ id: 8, name: 'Shop', updatedAt: order.updatedAt, totalDebt: -25 }]);
    expect(db.posCustomerDebt.upsert.mock.calls[0][0].create.totalDebt).toBe(-25);
    state.snapshot = null; db.posCustomerDebt.upsert.mockClear();
    await applyPosSnapshots('org', 'customers', [{ id: 9, name: 'Shop', updatedAt: order.updatedAt }]);
    expect(db.posCustomerDebt.upsert).not.toHaveBeenCalled();
  });
});
