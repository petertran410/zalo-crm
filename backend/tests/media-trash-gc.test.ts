/**
 * media-trash-gc.test.ts — GĐ13a (2026-06-13): cron tự dọn thùng rác Media.
 *
 * IRON RULE (regression CRITICAL): chứng minh cron CHỈ đụng asset đã ở thùng rác quá hạn,
 * TUYỆT ĐỐI không xóa asset active (archivedAt = null). Cộng: dry-run không xóa, cap chặn,
 * xóa theo tenant per-org, KHÔNG đụng byte MinIO (không gọi removeObject).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  mediaAsset: { findMany: vi.fn(), deleteMany: vi.fn() },
};
// withTenant chỉ chạy callback (giả lập tenant context), trả kết quả callback.
const withTenantMock = vi.fn(async (_orgId: string, fn: () => Promise<unknown>) => fn());
const removeObjectMock = vi.fn();

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/tenant/tenant-context.js', () => ({ withTenant: withTenantMock }));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('node-cron', () => ({ default: { schedule: vi.fn().mockReturnValue({ stop: vi.fn() }) } }));
// Nếu cron lỡ import minio removeObject thì test sẽ bắt được — mock để theo dõi KHÔNG được gọi.
vi.mock('../src/shared/storage/minio-client.js', () => ({
  uploadBuffer: vi.fn(),
  removeObject: removeObjectMock,
}));

const { runMediaTrashGc } = await import('../src/modules/media/media-trash-gc-cron.js');

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.mediaAsset.findMany.mockReset();
  prismaMock.mediaAsset.deleteMany.mockReset();
  removeObjectMock.mockReset();
});

describe('runMediaTrashGc — an toàn (D1/D3)', () => {
  it('WHERE luôn có archivedAt {not:null, lt:cutoff} — KHÔNG BAO GIỜ khớp asset active (regression CRITICAL)', async () => {
    prismaMock.mediaAsset.findMany.mockResolvedValue([]);
    await runMediaTrashGc({ dryRunOverride: false });

    const arg = prismaMock.mediaAsset.findMany.mock.calls[0][0];
    // archivedAt phải có cả 2 điều kiện: not null (đang trong thùng rác) + lt cutoff (quá 30d).
    expect(arg.where.archivedAt.not).toBeNull();          // not: null → archivedAt IS NOT NULL
    expect(arg.where.archivedAt.lt).toBeInstanceOf(Date);
    // cutoff phải lùi ~30 ngày so với now (không phải hôm nay → không quét nhầm đồ mới xóa).
    const ageDays = (Date.now() - arg.where.archivedAt.lt.getTime()) / 86400000;
    expect(ageDays).toBeGreaterThan(29.9);
    expect(ageDays).toBeLessThan(30.1);
  });

  it('dry-run (mặc định) → KHÔNG gọi deleteMany, trả deleted=0 + scanned đúng', async () => {
    prismaMock.mediaAsset.findMany.mockResolvedValue([
      { id: 'a1', orgId: 'org-1', name: 'cũ.jpg', archivedAt: new Date('2026-01-01') },
      { id: 'a2', orgId: 'org-1', name: 'cũ2.jpg', archivedAt: new Date('2026-01-02') },
    ]);
    const res = await runMediaTrashGc({ dryRunOverride: true });
    expect(prismaMock.mediaAsset.deleteMany).not.toHaveBeenCalled();
    expect(res.dryRun).toBe(true);
    expect(res.deleted).toBe(0);
    expect(res.scanned).toBe(2);
  });

  it('chạy thật → xóa theo tenant per-org, gom đúng id, KHÔNG đụng byte MinIO', async () => {
    prismaMock.mediaAsset.findMany.mockResolvedValue([
      { id: 'a1', orgId: 'org-1', name: 'x', archivedAt: new Date('2026-01-01') },
      { id: 'a2', orgId: 'org-2', name: 'y', archivedAt: new Date('2026-01-02') },
      { id: 'a3', orgId: 'org-1', name: 'z', archivedAt: new Date('2026-01-03') },
    ]);
    prismaMock.mediaAsset.deleteMany.mockResolvedValue({ count: 2 });

    const res = await runMediaTrashGc({ dryRunOverride: false });

    // 2 org → 2 lần withTenant + 2 lần deleteMany (gom id theo org).
    expect(withTenantMock).toHaveBeenCalledTimes(2);
    expect(prismaMock.mediaAsset.deleteMany).toHaveBeenCalledTimes(2);
    // INVARIANT D1: tuyệt đối KHÔNG gọi removeObject (giữ byte cho lịch sử chat).
    expect(removeObjectMock).not.toHaveBeenCalled();
    expect(res.dryRun).toBe(false);
    expect(res.scanned).toBe(3);
  });

  it('cap truyền vào findMany take — chặn xóa ạt', async () => {
    prismaMock.mediaAsset.findMany.mockResolvedValue([]);
    await runMediaTrashGc({ dryRunOverride: true, cap: 10 });
    expect(prismaMock.mediaAsset.findMany.mock.calls[0][0].take).toBe(10);
  });

  it('không có asset quá hạn → no-op, không xóa gì', async () => {
    prismaMock.mediaAsset.findMany.mockResolvedValue([]);
    const res = await runMediaTrashGc({ dryRunOverride: false });
    expect(prismaMock.mediaAsset.deleteMany).not.toHaveBeenCalled();
    expect(res.deleted).toBe(0);
    expect(res.scanned).toBe(0);
  });

  it('orderBy archivedAt asc, id asc — xác định, không starve hàng cũ', async () => {
    prismaMock.mediaAsset.findMany.mockResolvedValue([]);
    await runMediaTrashGc({ dryRunOverride: true });
    const arg = prismaMock.mediaAsset.findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual([{ archivedAt: 'asc' }, { id: 'asc' }]);
  });
});
