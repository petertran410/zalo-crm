/**
 * deleted-nick-revive-no-dup.test.ts — Hồi quy: nick ĐÃ XÓA login lại (quét QR đúng tài khoản)
 * SỐNG DẬY đúng record cũ, KHÔNG cướp uid của nick đang sống, KHÔNG nuốt lỗi trùng.
 *
 * Vòng đời nick Zalo (FIX 0 + T8, YC2 2026-06-20): updateAccountDB(connected) phải:
 *   • revive ĐÚNG id (prisma.update where {id:'acc-cu'}, KHÔNG create record mới).
 *   • updateMany nhả uid CHỈ khỏi nick ĐÃ ARCHIVED — where giữ
 *     {zaloUid, id:{not}, archivedAt:{not:null}} → KHÔNG đụng nick còn sống giữ uid.
 *   • status='connected' → data.archivedAt === null (clear soft-delete).
 *   • nếu uid kẹt ở nick SỐNG (update ném P2002) → ném DUPLICATE_ZALO_UID, KHÔNG nuốt im.
 *
 * Convention zalo-ghost-fix: mock prisma + mọi import nặng.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  zaloAccount: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
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
vi.mock('../src/modules/automation/friend-invite/nick-worker.js', () => ({
  respawnNickWorkerIfActive: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('fs/promises', () => ({ readFile: vi.fn() }));
vi.mock('image-size', () => ({ imageSize: vi.fn() }));

const { zaloPool } = await import('../src/modules/zalo/zalo-pool.js');
const updateAccountDB = (zaloPool as any).updateAccountDB.bind(zaloPool) as (
  accountId: string, status: string, zaloUid: string | null, reason?: string,
) => Promise<void>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deleted-nick-revive-no-dup — revive đúng id, không cướp uid, không nuốt lỗi', () => {
  it('REVIVE: connected → update where {id:cũ} + data.archivedAt=null; KHÔNG create record mới', async () => {
    prismaMock.zaloAccount.update.mockResolvedValue({ orgId: 'org-1', ownerUserId: 'user-1' });
    prismaMock.zaloAccount.updateMany.mockResolvedValue({ count: 0 });

    await updateAccountDB('acc-cu', 'connected', 'uid-real', 'reconnect_ok');

    // update đúng record cũ (revive), KHÔNG đẻ record mồ côi.
    expect(prismaMock.zaloAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'acc-cu' } }),
    );
    expect(prismaMock.zaloAccount.create).not.toHaveBeenCalled();
    // T8: clear soft-delete khi connected.
    const updData = prismaMock.zaloAccount.update.mock.calls[0][0].data;
    expect(updData.status).toBe('connected');
    expect(updData.archivedAt).toBeNull();
  });

  it('FIX 0: updateMany nhả uid CHỈ khỏi nick ĐÃ ARCHIVED (giữ where archivedAt:{not:null})', async () => {
    prismaMock.zaloAccount.update.mockResolvedValue({ orgId: 'org-1', ownerUserId: 'user-1' });
    prismaMock.zaloAccount.updateMany.mockResolvedValue({ count: 0 });

    await updateAccountDB('acc-cu', 'connected', 'uid-real', 'reconnect_ok');

    const releaseCall = prismaMock.zaloAccount.updateMany.mock.calls[0][0];
    expect(releaseCall.where).toEqual({
      zaloUid: 'uid-real',
      id: { not: 'acc-cu' },
      archivedAt: { not: null }, // KHÔNG cướp uid nick còn sống
    });
    expect(releaseCall.data).toEqual({ zaloUid: null });
  });

  it('UID kẹt ở nick SỐNG: prisma.update ném P2002 → DUPLICATE_ZALO_UID (KHÔNG nuốt im)', async () => {
    prismaMock.zaloAccount.updateMany.mockResolvedValue({ count: 0 });
    const p2002 = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: ['zalo_uid'] },
    });
    prismaMock.zaloAccount.update.mockRejectedValue(p2002);

    await expect(
      updateAccountDB('acc-cu', 'connected', 'uid-stuck', 'reconnect_ok'),
    ).rejects.toMatchObject({ code: 'DUPLICATE_ZALO_UID', zaloUid: 'uid-stuck' });
  });
});
