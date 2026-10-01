import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  contact: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  contactPosLink: { findMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  posCustomer: { findFirst: vi.fn() },
  posOrder: { updateMany: vi.fn() }, posInvoice: { updateMany: vi.fn() }, posCustomerDebt: { updateMany: vi.fn() },
  activityLog: { create: vi.fn() }, $executeRaw: vi.fn(),
}));
vi.mock('../../src/shared/database/prisma-client.js', () => ({
  prisma: db, tenantTransaction: (callback: (tx: typeof db) => unknown) => callback(db),
}));
const access = vi.hoisted(() => ({ visible: vi.fn(), editable: vi.fn() }));
vi.mock('../../src/modules/contacts/contact-scope.js', () => ({
  assertContactVisible: access.visible, assertContactEditable: access.editable,
}));
vi.mock('../../src/modules/integrations/hisweetie-public-api-client.js', () => ({
  getHisweetiePublicApiClient: () => { throw new Error('No network allowed'); },
}));
vi.mock('../../src/modules/rbac/permission-group-service.js', () => ({ userHasGrant: vi.fn(async () => true) }));
import {
  addPosLinks, removePosLink, requireCustomer, summarizeDebt, ensureLinkedPosCustomer,
  purchaseSummary,
} from '../../src/modules/contacts/customer-workspace-service.js';
const actor = { id: 'sale', orgId: 'org-a', role: 'member' };

beforeEach(() => {
  vi.resetAllMocks();
  access.visible.mockResolvedValue(true); access.editable.mockResolvedValue(undefined);
  db.contact.findFirst.mockResolvedValue({ id: 'person', orgId: actor.orgId });
  db.contact.findMany.mockResolvedValue([]);
  db.contactPosLink.findMany.mockResolvedValue([]);
  db.posCustomer.findFirst.mockImplementation(async ({ where }) => ({ posId: where.posId, orgId: where.orgId, name: 'Shop' }));
});

describe('manual multi-shop ownership', () => {
  it('links multiple shops with one atomic transaction and no phone lookup', async () => {
    await addPosLinks(actor, 'person', [2, 1, 2]);
    expect(db.contactPosLink.upsert).toHaveBeenCalledTimes(2);
    expect(db.contactPosLink.upsert.mock.calls[0][0].create).toMatchObject({ orgId: 'org-a', contactId: 'person', posCustomerId: 1 });
    expect(db.contact.findMany.mock.calls[0][0].where).not.toHaveProperty('phone');
    expect(db.activityLog.create).toHaveBeenCalledTimes(1);
  });
  it('rejects a conflicting POS owner without changing any link', async () => {
    db.contactPosLink.findMany.mockResolvedValue([{ contactId: 'other' }]);
    await expect(addPosLinks(actor, 'person', [1, 2])).rejects.toMatchObject({ statusCode: 409 });
    expect(db.contactPosLink.upsert).not.toHaveBeenCalled();
  });
  it('does not bypass an unresolved legacy conflict', async () => {
    db.contact.findMany.mockResolvedValue([{ id: 'legacy-owner' }]);
    await expect(addPosLinks(actor, 'person', [1])).rejects.toMatchObject({ statusCode: 409 });
  });
  it('rejects customer IDs outside the organization even for admin', async () => {
    db.contact.findFirst.mockResolvedValue(null);
    await expect(requireCustomer({ ...actor, role: 'admin' }, 'foreign')).rejects.toMatchObject({ statusCode: 404 });
    expect(db.contact.findFirst.mock.calls[0][0].where.orgId).toBe(actor.orgId);
  });
  it('rejects a read-only or invisible customer', async () => {
    access.visible.mockResolvedValue(false);
    await expect(addPosLinks(actor, 'person', [1])).rejects.toMatchObject({ statusCode: 404 });
    expect(db.contactPosLink.upsert).not.toHaveBeenCalled();
  });
  it('requires edit access to link', async () => {
    access.editable.mockRejectedValue(Object.assign(new Error('denied'), { statusCode: 403 }));
    await expect(addPosLinks(actor, 'person', [1])).rejects.toMatchObject({ statusCode: 403 });
  });
  it.each([[], [0], [-1], [1.5], Array.from({ length: 51 }, (_, i) => i + 1)].map(ids => ({ ids })))('rejects invalid selection $ids', async ({ ids }) => {
    await expect(addPosLinks(actor, 'person', ids)).rejects.toMatchObject({ statusCode: 400 });
  });
  it('requires explicitly linked shop before creating an order or reading its ledger', async () => {
    db.contactPosLink.findFirst.mockResolvedValue(null);
    await expect(ensureLinkedPosCustomer('org-a', 'person', 7)).rejects.toMatchObject({ statusCode: 409 });
  });
  it('unlink removes stale commerce projections but not POS documents', async () => {
    await removePosLink(actor, 'person', 2);
    expect(db.posOrder.updateMany).toHaveBeenCalledWith({
      where: { orgId: 'org-a', contactId: 'person', posCustomerId: 2 }, data: { contactId: null },
    });
    expect(db.contact.updateMany.mock.calls[0][0].where.posCustomerId).toBe(2);
  });
});

describe('authoritative balances', () => {
  it('does not turn missing/unlinked data into zero', () => {
    expect(summarizeDebt([], 0).amount).toBeNull();
    expect(summarizeDebt([], 1).amount).toBeNull();
    expect(summarizeDebt([{ totalDebt: 9, lastSyncedAt: new Date() }], 2).amount).toBeNull();
  });
  it('preserves negative balances and real zero', () => {
    expect(summarizeDebt([{ totalDebt: -5, lastSyncedAt: new Date() }], 1).amount).toBe(-5);
    expect(summarizeDebt([{ totalDebt: 0, lastSyncedAt: new Date() }], 1).state).toBe('available');
  });
  it('marks stale balances and rejects invalid amounts', () => {
    expect(summarizeDebt([{ totalDebt: 7, lastSyncedAt: new Date(0) }], 1).state).toBe('stale');
    expect(summarizeDebt([{ totalDebt: NaN, lastSyncedAt: new Date() }], 1).amount).toBeNull();
  });
});

describe('purchases are invoice-backed, not order-backed', () => {
  it('does not classify missing history as no purchase', () => {
    expect(purchaseSummary([], false, 1).state).toBe('unknown');
    expect(purchaseSummary([], true, 0).state).toBe('unknown');
  });
  it('excludes cancelled/replaced invoices and refuses unknown statuses', () => {
    expect(purchaseSummary(['Cancelled', 'Replaced'], true, 1)).toEqual({ state: 'not_purchased', validInvoiceCount: 0 });
    expect(purchaseSummary(['Unknown'], true, 1).state).toBe('unknown');
    expect(purchaseSummary(['Phiếu tạm'], true, 1).state).not.toBe('purchased');
  });
  it('recognizes a valid credit sale without requiring full payment', () => {
    expect(purchaseSummary(['Đang xử lý', 'Cancelled'], true, 1)).toEqual({ state: 'purchased', validInvoiceCount: 1 });
  });
});
