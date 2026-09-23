import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rows: new Map<string, any>() }));
vi.mock('../../src/shared/database/prisma-client.js', () => ({
  prisma: { posWriteOperation: {
    findUnique: vi.fn(async ({ where }) => state.rows.get(where.orgId_operationKey.orgId + ':' + where.orgId_operationKey.operationKey) ?? null),
    create: vi.fn(async ({ data }) => {
      const key = data.orgId + ':' + data.operationKey;
      if (state.rows.has(key)) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
      const row = { ...data, createdAt: new Date() }; state.rows.set(key, row); return { ...row };
    }),
    updateMany: vi.fn(async ({ where, data }) => {
      const row = [...state.rows.values()].find(r => r.id === where.id && r.orgId === where.orgId);
      if (!row || !where.status.in.includes(row.status)) return { count: 0 };
      Object.assign(row, data); return { count: 1 };
    }),
    update: vi.fn(async ({ where, data }) => {
      const row = [...state.rows.values()].find(r => r.id === where.id); Object.assign(row, data); return row;
    }),
  } },
  tenantTransaction: vi.fn(),
}));
vi.mock('../../src/modules/contacts/customer-workspace-service.js', () => ({
  workspaceError: (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode }),
}));
import { runPosWrite, writeFingerprint } from '../../src/modules/pos/pos-write-operation.js';
import { assertDraftContractVerified, verifiedDraftResponse } from '../../src/modules/pos/pos-write-policy.js';
import { sourceVersion, shouldApplySnapshot, documentAmount } from '../../src/modules/pos/pos-snapshot-service.js';
const context = { orgId: 'org-a', userId: 'sale' }, key = 'stable_operation_key_123';
beforeEach(() => { state.rows.clear(); vi.stubEnv('CRM_POS_WRITE_ENABLED', 'false'); vi.stubEnv('CRM_POS_DRAFT_CONTRACT_VERIFIED', 'false'); });
afterEach(() => vi.unstubAllEnvs());

describe('POS write contract', () => {
  it('is off by default and requires both operator approvals', () => {
    expect(() => assertDraftContractVerified()).toThrow();
    vi.stubEnv('CRM_POS_WRITE_ENABLED', 'true');
    expect(() => assertDraftContractVerified()).toThrow();
    vi.stubEnv('CRM_POS_DRAFT_CONTRACT_VERIFIED', 'true');
    expect(() => assertDraftContractVerified()).not.toThrow();
  });
  it('accepts only a verified draft response', () => {
    expect(verifiedDraftResponse({ id: 1, status: 1, statusValue: 'Phiếu tạm' }).id).toBe(1);
    expect(() => verifiedDraftResponse({ id: 1, status: 2, statusValue: 'Đã xác nhận' })).toThrow();
    expect(() => verifiedDraftResponse({ id: 1 })).toThrow();
    expect(() => verifiedDraftResponse({ id: 'bad', status: 1, statusValue: 'Phiếu tạm' })).toThrow();
  });
  it('has canonical fingerprints but distinguishes meaningful payload changes', () => {
    expect(writeFingerprint('order', { a: 1, b: 2 })).toBe(writeFingerprint('order', { b: 2, a: 1 }));
    expect(writeFingerprint('order', { a: 1 })).not.toBe(writeFingerprint('order', { a: 2 }));
  });
  it('replays success without a second remote write', async () => {
    const send = vi.fn(async () => ({ posOrderId: 4 }));
    await runPosWrite(context, key, 'order', { customerId: 1 }, send);
    const result = await runPosWrite(context, key, 'order', { customerId: 1 }, send);
    expect(send).toHaveBeenCalledTimes(1); expect(result.posOrderId).toBe(4);
  });
  it('uses the same remote key after an uncertain network result', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ posOrderId: 4 });
    await expect(runPosWrite(context, key, 'order', { customerId: 1 }, send)).rejects.toMatchObject({ statusCode: 409 });
    await runPosWrite(context, key, 'order', { customerId: 1 }, send);
    expect(send.mock.calls[0][0]).toBe(send.mock.calls[1][0]);
  });
  it('rejects changing customer or user under a key', async () => {
    const send = vi.fn(async () => ({ id: 1 }));
    await runPosWrite(context, key, 'order', { customerId: 1 }, send);
    await expect(runPosWrite(context, key, 'order', { customerId: 2 }, send)).rejects.toMatchObject({ statusCode: 409 });
    await expect(runPosWrite({ ...context, userId: 'other' }, key, 'order', { customerId: 1 }, send)).rejects.toMatchObject({ statusCode: 409 });
  });
  it('does not replay unknown writes after the POS retention window', async () => {
    const send = vi.fn().mockRejectedValue(new Error('timeout'));
    await expect(runPosWrite(context, key, 'order', {}, send)).rejects.toThrow();
    state.rows.values().next().value.createdAt = new Date(0);
    await expect(runPosWrite(context, key, 'order', {}, send)).rejects.toThrow('23');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('serializes double clicks', async () => {
    let release!: (v: { id: number }) => void;
    const send = vi.fn(() => new Promise<{ id: number }>(resolve => { release = resolve; }));
    const first = runPosWrite(context, key, 'order', {}, send);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    await expect(runPosWrite(context, key, 'order', {}, send)).rejects.toMatchObject({ statusCode: 409 });
    release({ id: 1 }); await first;
  });
  it('allows correcting an explicit 400 rejection without treating it as an uncertain write', async () => {
    const send = vi.fn().mockRejectedValue(Object.assign(new Error('bad address'), { status: 400 }));
    await expect(runPosWrite(context, key, 'order', {}, send)).rejects.toMatchObject({ code: 'POS_REJECTED' });
    expect([...state.rows.values()][0].status).toBe('rejected');
    await expect(runPosWrite(context, key, 'order', {}, send)).rejects.toMatchObject({ code: 'POS_REJECTED' });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
describe('monotonic POS snapshots', () => {
  it('does not fabricate zero totals or subtract local discounts from POS totals', () => {
    expect(() => documentAmount({})).toThrow();
    expect(() => documentAmount({ total: '1200' })).toThrow();
    expect(documentAmount({ total: 0 })).toBe(0);
    expect(documentAmount({ grandTotal: 900, total: 1000, discount: 100 })).toBe(900);
  });
  it('rejects records without a trustworthy source version', () => {
    expect(() => sourceVersion({})).toThrow();
    expect(() => sourceVersion({ updatedAt: 'invalid' })).toThrow();
  });
  it('does not apply older or duplicate versions', () => {
    const newer = new Date('2026-09-21T10:00:00Z'), older = new Date('2026-09-21T09:00:00Z');
    expect(shouldApplySnapshot(newer, older)).toBe(false);
    expect(shouldApplySnapshot(newer, newer)).toBe(false);
    expect(shouldApplySnapshot(older, newer)).toBe(true);
    expect(shouldApplySnapshot(null, newer)).toBe(true);
  });
});
