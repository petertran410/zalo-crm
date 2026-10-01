import Fastify from 'fastify';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  disperse: vi.fn(), find: vi.fn(), update: vi.fn(), access: vi.fn(),
}));
vi.mock('../../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (request: any) => { request.user = { id: 'admin', orgId: 'org', role: 'admin' }; },
}));
vi.mock('../../src/shared/zalo-operations.js', () => ({ zaloOps: { disperseGroup: mocks.disperse } }));
vi.mock('../../src/modules/zalo/zalo-route-helpers.js', () => ({
  resolveAccount: vi.fn(async () => ({})), checkAccess: mocks.access,
  handleError: (reply: any) => reply.code(502).send({ error: 'Zalo failed' }),
}));
vi.mock('../../src/shared/database/prisma-client.js', () => ({
  prisma: { conversation: { findFirst: mocks.find, updateMany: mocks.update } },
}));
vi.mock('../../src/modules/contacts/customer-workspace-service.js', () => ({
  linkedPosIds: vi.fn(), requireCustomer: vi.fn(), summarizeDebt: vi.fn(), authoritativeBalances: vi.fn(),
}));
import { groupModerationRoutes } from '../../src/modules/zalo/group-moderation-routes.js';
import { verifiedDissolutionGroup } from '../../src/modules/zalo/group-lifecycle-service.js';
beforeEach(() => {
  vi.resetAllMocks(); mocks.access.mockResolvedValue(true);
  mocks.find.mockResolvedValue({ id: 'conv', dissolvedAt: null }); mocks.disperse.mockResolvedValue({ success: true });
});
async function request(payload: unknown) {
  const app = Fastify(); await app.register(groupModerationRoutes);
  try { return await app.inject({ method: 'POST', url: '/api/v1/zalo-accounts/account/groups/group/disperse', payload }); }
  finally { await app.close(); }
}
it('requires explicit confirmation before touching Zalo', async () => {
  expect((await request({})).statusCode).toBe(400); expect(mocks.disperse).not.toHaveBeenCalled();
});
it('records dissolution only after confirmed Zalo success, preserving history', async () => {
  expect((await request({ confirmed: true })).statusCode).toBe(200);
  expect(mocks.update).toHaveBeenCalledWith({
    where: { orgId: 'org', zaloAccountId: 'account', externalThreadId: 'group', threadType: 'group' },
    data: { dissolvedAt: expect.any(Date), dissolvedSource: 'crm' },
  });
});
it('does not mark dissolution when Zalo fails or is offline', async () => {
  mocks.disperse.mockRejectedValue(new Error('offline'));
  expect((await request({ confirmed: true })).statusCode).toBe(502); expect(mocks.update).not.toHaveBeenCalled();
});
it('does not repeat a known successful dissolution', async () => {
  mocks.find.mockResolvedValue({ dissolvedAt: new Date() });
  expect((await request({ confirmed: true })).statusCode).toBe(200); expect(mocks.disperse).not.toHaveBeenCalled();
});
it('does not infer an external dissolution from leave, missing group, or unknown actions', () => {
  expect(verifiedDissolutionGroup({ act: 'leave', threadId: 'group' }, 'leave')).toBeNull();
  expect(verifiedDissolutionGroup({ act: 'unknown', threadId: 'group' }, 'unknown')).toBeNull();
  expect(verifiedDissolutionGroup({ act: 'test_verified_disperse', threadId: 'group' }, '')).toBeNull();
  expect(verifiedDissolutionGroup({ act: 'test_verified_disperse', threadId: 'group' }, 'test_verified_disperse')).toBe('group');
});
