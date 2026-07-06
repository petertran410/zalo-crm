/**
 * ghost-soft-hide-after-24h.test.ts — Hồi quy: thẻ ma quá 24h bị ẨN MỀM (archivedAt),
 * KHÔNG hard-delete (giữ lịch sử/Friend/Conversation).
 *
 * Vòng đời nick Zalo: cleanupStaleGhosts ẩn mềm bằng updateMany
 *   { archivedAt: Date, status: 'disconnected', sessionData: Prisma.JsonNull }.
 * Bất biến: n=2; KHÔNG gọi delete/deleteMany (zaloAccount lẫn friend).
 *
 * Convention zalo-ghost-fix (Prisma.JsonNull mock = 'JSON_NULL').
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  zaloAccount: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  friend: { deleteMany: vi.fn() },
};
vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('@prisma/client', () => ({ Prisma: { JsonNull: 'JSON_NULL', DbNull: 'DB_NULL' } }));
vi.mock('../src/shared/tenant/tenant-context.js', () => ({
  runSystemQuery: (fn: () => Promise<unknown>) => fn(),
}));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('zca-js', () => ({ Zalo: class { login = vi.fn(); loginQR = vi.fn(); } }));
vi.mock('../src/modules/zalo/zalo-listener-factory.js', () => ({ attachZaloListener: vi.fn() }));
vi.mock('../src/modules/api/webhook-service.js', () => ({ emitWebhook: vi.fn() }));
vi.mock('../src/modules/zalo/zalo-message-sync.js', () => ({ startMessageSync: vi.fn(), stopMessageSync: vi.fn() }));
vi.mock('../src/modules/zalo/zalo-history-backfill.js', () => ({ backfillIfEmpty: vi.fn() }));
vi.mock('../src/modules/zalo/proxy-util.js', () => ({ withProxy: (_p: unknown, fn: () => unknown) => fn() }));
vi.mock('../src/modules/zalo/status-log-service.js', () => ({ writeTransition: vi.fn() }));
vi.mock('fs/promises', () => ({ readFile: vi.fn() }));
vi.mock('image-size', () => ({ imageSize: vi.fn() }));

const { zaloPool } = await import('../src/modules/zalo/zalo-pool.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ghost-soft-hide-after-24h — ẩn mềm, KHÔNG hard-delete', () => {
  it('thẻ ma cũ → n=2, ẩn mềm đúng id, status=disconnected, sessionData=JsonNull', async () => {
    prismaMock.zaloAccount.findMany.mockResolvedValue([{ id: 'g1' }, { id: 'g2' }]);
    prismaMock.zaloAccount.updateMany.mockResolvedValue({ count: 2 });

    const n = await zaloPool.cleanupStaleGhosts(24 * 60);

    expect(n).toBe(2);
    const upd = prismaMock.zaloAccount.updateMany.mock.calls[0][0];
    expect(upd.where.id.in).toEqual(['g1', 'g2']);
    expect(upd.data.archivedAt).toBeInstanceOf(Date);
    expect(upd.data.status).toBe('disconnected');
    expect(upd.data.sessionData).toBe('JSON_NULL'); // Prisma.JsonNull (xoá session)
  });

  it('KHÔNG hard-delete: zaloAccount.delete/deleteMany + friend.deleteMany không gọi', async () => {
    prismaMock.zaloAccount.findMany.mockResolvedValue([{ id: 'g1' }, { id: 'g2' }]);
    prismaMock.zaloAccount.updateMany.mockResolvedValue({ count: 2 });

    await zaloPool.cleanupStaleGhosts(24 * 60);

    expect(prismaMock.zaloAccount.delete).not.toHaveBeenCalled();
    expect(prismaMock.zaloAccount.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.friend.deleteMany).not.toHaveBeenCalled();
  });
});
