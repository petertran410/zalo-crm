/**
 * manual-disconnect-needs-qr.test.ts — Hồi quy: nick NGẮT THỦ CÔNG (disconnectReason='manual')
 * KHÔNG reconnect ngầm — buộc QUÉT QR MỚI.
 *
 * Vòng đời nick Zalo (T3 YC1 2026-06-20):
 *   • POST /reconnect: nick manual → 409 {needsQR:true}, zaloPool.reconnect KHÔNG gọi.
 *   • POST /reconnect: nick passive (hoặc null) → 200, zaloPool.reconnect ĐƯỢC gọi.
 *   • POST /check-phone: nick manual của mình → duplicate.disconnectReason==='manual'.
 *
 * DRIVING qua Fastify inject (convention chat-operations-routes).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { mockUser } from './test-helpers.js';

const prismaMock = {
  zaloAccount: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  organization: { findUnique: vi.fn() },
};
const reconnectMock = vi.fn().mockResolvedValue(undefined);
const disconnectMock = vi.fn();
const findUserMock = vi.fn();

vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: prismaMock,
  tenantTransaction: vi.fn(),
}));
vi.mock('@prisma/client', () => ({ Prisma: { JsonNull: 'JSON_NULL', DbNull: 'DB_NULL' } }));
vi.mock('../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (req: any) => { req.user = mockUser(); },
}));
vi.mock('../src/modules/zalo/zalo-pool.js', () => ({
  zaloPool: { reconnect: reconnectMock, disconnect: disconnectMock, getAllStatuses: vi.fn(() => ({})), getStatus: vi.fn(() => 'disconnected') },
}));
// Dynamic import trong check-phone.
vi.mock('../src/shared/zalo-operations.js', () => ({
  zaloOps: { findUser: findUserMock },
}));

const { zaloRoutes } = await import('../src/modules/zalo/zalo-routes.js');

// user-1 LÀ owner nick → requireAccountManagement (canManageAccount) cho qua.
const OWNED_GATE = { id: 'acc-1', ownerUserId: 'user-1', orgId: 'org-1', status: 'disconnected' };

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(zaloRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Gate findFirst (requireAccountManagement) → user là owner.
  prismaMock.zaloAccount.findFirst.mockResolvedValue(OWNED_GATE);
});

describe('POST /reconnect — nick manual buộc QR', () => {
  it('manual → 409 needsQR=true, zaloPool.reconnect KHÔNG gọi', async () => {
    prismaMock.zaloAccount.findUnique.mockResolvedValue({
      sessionData: { cookie: {}, imei: 'imei-1', userAgent: 'ua' },
      proxyUrl: null,
      disconnectReason: 'manual',
    });
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/zalo-accounts/acc-1/reconnect', payload: {} });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).needsQR).toBe(true);
    expect(reconnectMock).not.toHaveBeenCalled();
  });

  it('passive → 200 + zaloPool.reconnect ĐƯỢC gọi', async () => {
    prismaMock.zaloAccount.findUnique.mockResolvedValue({
      sessionData: { cookie: {}, imei: 'imei-1', userAgent: 'ua' },
      proxyUrl: null,
      disconnectReason: 'passive',
    });
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/zalo-accounts/acc-1/reconnect', payload: {} });
    expect(res.statusCode).toBe(200);
    expect(reconnectMock).toHaveBeenCalledWith('acc-1', expect.objectContaining({ imei: 'imei-1' }), null);
  });
});

describe('POST /check-phone — nick manual của mình', () => {
  it('duplicate.disconnectReason === "manual"', async () => {
    prismaMock.organization.findUnique.mockResolvedValue({
      systemNotifyZaloAccountId: 'sys-1',
      systemNotifyNick: { id: 'sys-1', status: 'connected' },
    });
    findUserMock.mockResolvedValue({ uid: 'uid-x', display_name: 'KH Test' });
    prismaMock.zaloAccount.findFirst.mockResolvedValue({
      id: 'acc-1', displayName: 'Nick Cũ', status: 'disconnected', ownerUserId: 'user-1',
      owner: { id: 'user-1', fullName: 'Sale A' },
      disconnectReason: 'manual', archivedAt: null, zaloUid: 'uid-x',
    });
    const app = buildApp();
    const res = await app.inject({
      method: 'POST', url: '/api/v1/zalo-accounts/check-phone', payload: { phone: '0901234567' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.duplicate.disconnectReason).toBe('manual');
    expect(body.duplicate.ownedByMe).toBe(true);
  });
});
