/**
 * ghost-visible-within-24h.test.ts — Hồi quy: thẻ ma MỚI (createdAt < 24h) KHÔNG bị
 * cleanupStaleGhosts ẩn — vẫn hiện để user kịp quét QR/xử lý.
 *
 * Vòng đời nick Zalo: cleanupStaleGhosts(staleMinutes=24*60) chỉ dọn thẻ ma quá cũ.
 * Bất biến: cutoff = now - 24h; thẻ ma mới (findMany trả []) → n=0, updateMany KHÔNG gọi.
 *
 * Convention zalo-ghost-fix.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  zaloAccount: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
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

describe('ghost-visible-within-24h — thẻ ma mới KHÔNG bị ẩn', () => {
  it('findMany trả [] (createdAt mới) → n=0, updateMany KHÔNG gọi', async () => {
    prismaMock.zaloAccount.findMany.mockResolvedValue([]);

    const n = await zaloPool.cleanupStaleGhosts(24 * 60);

    expect(n).toBe(0);
    expect(prismaMock.zaloAccount.updateMany).not.toHaveBeenCalled();
  });

  it('cutoff = now - 24h (gần đúng tới giây)', async () => {
    prismaMock.zaloAccount.findMany.mockResolvedValue([]);

    await zaloPool.cleanupStaleGhosts(24 * 60);

    const cutoff: Date = prismaMock.zaloAccount.findMany.mock.calls[0][0].where.createdAt.lt;
    expect(cutoff).toBeInstanceOf(Date);
    expect(Date.now() - cutoff.getTime()).toBeCloseTo(24 * 60 * 60 * 1000, -4);
  });
});
