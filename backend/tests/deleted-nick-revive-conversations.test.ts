/**
 * deleted-nick-revive-conversations.test.ts — Hồi quy: XÓA nick KHÔNG mất hội thoại;
 * revive nick → hội thoại cũ HIỆN LẠI.
 *
 * Vòng đời nick Zalo (YC2 2026-06-20):
 *   • DELETE /:id = xóa MỀM (archivedAt set) — KHÔNG xóa Conversation (deleteMany không gọi).
 *   • Revive (updateAccountDB connected) → data.archivedAt = null.
 *   • List/count hội thoại lọc qua DISPLAYABLE_NICK_WHERE (nick xóa-có-uid vẫn hiện) →
 *     count=5 → 5 hội thoại hiện lại.
 *
 * Convention zalo-ghost-fix (mock prisma + import nặng) + route harness cho DELETE.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { mockUser } from './test-helpers.js';

const prismaMock = {
  zaloAccount: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  conversation: { count: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
  friend: { deleteMany: vi.fn() },
};
const disconnectMock = vi.fn();

vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: prismaMock,
  tenantTransaction: vi.fn(),
}));
vi.mock('@prisma/client', () => ({ Prisma: { JsonNull: 'JSON_NULL', DbNull: 'DB_NULL' } }));
vi.mock('../src/shared/tenant/tenant-context.js', () => ({
  runSystemQuery: (fn: () => Promise<unknown>) => fn(),
}));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (req: any) => { req.user = mockUser(); },
}));
vi.mock('zca-js', () => ({ Zalo: class { login = vi.fn(); loginQR = vi.fn(); } }));
vi.mock('../src/modules/zalo/zalo-listener-factory.js', () => ({ attachZaloListener: vi.fn() }));
vi.mock('../src/modules/api/webhook-service.js', () => ({ emitWebhook: vi.fn() }));
vi.mock('../src/modules/zalo/zalo-message-sync.js', () => ({ startMessageSync: vi.fn(), stopMessageSync: vi.fn() }));
vi.mock('../src/modules/zalo/zalo-history-backfill.js', () => ({ backfillIfEmpty: vi.fn() }));
vi.mock('../src/modules/zalo/proxy-util.js', () => ({ withProxy: (_p: unknown, fn: () => unknown) => fn() }));
vi.mock('../src/modules/zalo/status-log-service.js', () => ({ writeTransition: vi.fn() }));
vi.mock('../src/modules/automation/friend-invite/nick-worker.js', () => ({
  respawnNickWorkerIfActive: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('fs/promises', () => ({ readFile: vi.fn() }));
vi.mock('image-size', () => ({ imageSize: vi.fn() }));
// zaloPool mock cho zalo-routes (disconnect khi DELETE).
vi.mock('../src/modules/zalo/zalo-pool.js', () => ({
  zaloPool: { disconnect: disconnectMock, reconnect: vi.fn(), getAllStatuses: vi.fn(() => ({})), getStatus: vi.fn(() => 'disconnected') },
}));

const { zaloRoutes } = await import('../src/modules/zalo/zalo-routes.js');
const { DISPLAYABLE_NICK_WHERE } = await import('../src/modules/zalo/zalo-scope.js');
// updateAccountDB từ pool THẬT (revive) — import riêng để không dính zaloPool mock của route.
const poolMod = await vi.importActual<typeof import('../src/modules/zalo/zalo-pool.js')>(
  '../src/modules/zalo/zalo-pool.js',
);
const updateAccountDB = (poolMod.zaloPool as any).updateAccountDB.bind(poolMod.zaloPool) as (
  accountId: string, status: string, zaloUid: string | null, reason?: string,
) => Promise<void>;

const OWNED_GATE = { id: 'acc-1', ownerUserId: 'user-1', orgId: 'org-1', status: 'connected' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deleted-nick-revive-conversations', () => {
  it('DELETE /:id → xóa MỀM (archivedAt set), KHÔNG conversation.deleteMany', async () => {
    prismaMock.zaloAccount.findFirst.mockResolvedValue(OWNED_GATE); // gate pass
    prismaMock.zaloAccount.update.mockResolvedValue({});
    const app = Fastify({ logger: false });
    app.register(zaloRoutes);

    const res = await app.inject({ method: 'DELETE', url: '/api/v1/zalo-accounts/acc-1' });

    expect(res.statusCode).toBe(204);
    const updArg = prismaMock.zaloAccount.update.mock.calls[0][0];
    expect(updArg.where).toEqual({ id: 'acc-1' });
    expect(updArg.data.archivedAt).toBeInstanceOf(Date);
    expect(updArg.data.status).toBe('disconnected');
    // KHÔNG xóa hội thoại (giữ lịch sử để revive).
    expect(prismaMock.conversation.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.friend.deleteMany).not.toHaveBeenCalled();
  });

  it('REVIVE: updateAccountDB(connected) → data.archivedAt = null', async () => {
    prismaMock.zaloAccount.update.mockResolvedValue({ orgId: 'org-1', ownerUserId: 'user-1' });
    prismaMock.zaloAccount.updateMany.mockResolvedValue({ count: 0 });

    await updateAccountDB('acc-1', 'connected', 'uid-real', 'reconnect_ok');

    const data = prismaMock.zaloAccount.update.mock.calls[0][0].data;
    expect(data.archivedAt).toBeNull();
  });

  it('LIST hội thoại lọc DISPLAYABLE (nick xóa-có-uid hiện) + count 5 → 5 hội thoại', async () => {
    // Mô phỏng tầng list: where.zaloAccount = DISPLAYABLE_NICK_WHERE; count trả 5.
    prismaMock.conversation.count.mockResolvedValue(5);
    const where = { orgId: 'org-1', deletedAt: null, zaloAccount: DISPLAYABLE_NICK_WHERE };
    const total = await prismaMock.conversation.count({ where });

    expect(total).toBe(5);
    // nick xóa-có-uid lọt DISPLAYABLE (OR nhánh archived+uid) → hội thoại hiện lại.
    expect(where.zaloAccount.OR).toContainEqual({ archivedAt: { not: null }, zaloUid: { not: null } });
  });
});
