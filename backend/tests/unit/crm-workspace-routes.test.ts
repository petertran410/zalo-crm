import Fastify from 'fastify';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  add: vi.fn(), require: vi.fn(), linked: vi.fn(), ledger: vi.fn(), allowed: true,
  previous: vi.fn(), upsert: vi.fn(), audit: vi.fn(), grantCalls: [] as string[],
}));
vi.mock('../../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (request: any) => { request.user = { id: 'sale', orgId: 'org', role: 'member' }; },
}));
vi.mock('../../src/modules/rbac/rbac-middleware.js', () => ({
  requireGrant: (_resource: string, action: string) => async (_request: any, reply: any) => {
    mocks.grantCalls.push(action);
    if (!mocks.allowed) return reply.code(403).send({ error: 'denied' });
  },
}));
vi.mock('../../src/modules/contacts/customer-workspace-service.js', () => ({
  addPosLinks: mocks.add, requireCustomer: mocks.require, ensureLinkedPosCustomer: mocks.linked,
  workspaceError: (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode }),
}));
vi.mock('../../src/shared/database/prisma-client.js', () => {
  const db = {
    $executeRaw: vi.fn(),
    customerConversationLink: { findFirst: mocks.previous, upsert: mocks.upsert },
    activityLog: { create: mocks.audit },
  };
  return { prisma: db, tenantTransaction: (callback: (tx: typeof db) => unknown) => callback(db) };
});
vi.mock('../../src/modules/chat/conversation-access.js', () => ({
  assertConversationReadAccess: vi.fn(async () => ({ id: 'group' })),
}));
vi.mock('../../src/modules/pos/pos-write-policy.js', () => ({ assertPosOrganization: vi.fn() }));
vi.mock('../../src/modules/integrations/hisweetie-public-api-client.js', () => ({
  getHisweetiePublicApiClient: () => ({ getCustomerLedger: mocks.ledger }),
}));
import { customerWorkspaceRoutes } from '../../src/modules/contacts/customer-workspace-routes.js';
beforeEach(() => {
  vi.clearAllMocks(); mocks.allowed = true; mocks.grantCalls = [];
  mocks.require.mockResolvedValue({ id: 'customer' });
  mocks.add.mockResolvedValue([{ posCustomerId: 1 }, { posCustomerId: 2 }]);
  mocks.previous.mockResolvedValue(null); mocks.linked.mockResolvedValue(undefined);
});
async function inject(method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, payload?: Record<string, unknown>) {
  const app = Fastify(); await app.register(customerWorkspaceRoutes);
  try { return await app.inject({ method, url, payload }); } finally { await app.close(); }
}
it('registers the CRM routes and enforces edit permission on link writes', async () => {
  const response = await inject('POST', '/api/v1/crm/customers/customer/pos-links', { posCustomerIds: [1, 2] });
  expect(response.statusCode).toBe(200);
  expect(mocks.grantCalls).toEqual(['access', 'edit']);
  expect(mocks.add).toHaveBeenCalledWith({ id: 'sale', orgId: 'org', role: 'member' }, 'customer', [1, 2]);
});
it('rejects bad POS IDs at the request boundary', async () => {
  expect((await inject('POST', '/api/v1/crm/customers/customer/pos-links', { posCustomerIds: [0] })).statusCode).toBe(400);
  expect(mocks.add).not.toHaveBeenCalled();
});
it('rejects unknown segment values without writing a profile', async () => {
  expect((await inject('PATCH', '/api/v1/crm/customers/customer', { segment: 'anything' })).statusCode).toBe(400);
});
it('denies users without a contact grant before entering the link service', async () => {
  mocks.allowed = false;
  expect((await inject('POST', '/api/v1/crm/customers/customer/pos-links', { posCustomerIds: [1] })).statusCode).toBe(403);
  expect(mocks.add).not.toHaveBeenCalled();
});
it('cannot reassign a group already attached to another customer', async () => {
  mocks.previous.mockResolvedValue({ contactId: 'other' });
  expect((await inject('PUT', '/api/v1/crm/conversations/group/customer', { contactId: 'customer' })).statusCode).toBe(409);
  expect(mocks.upsert).not.toHaveBeenCalled();
});
it('does not call the POS ledger for a shop not linked to the visible customer', async () => {
  mocks.linked.mockRejectedValue(Object.assign(new Error('not linked'), { statusCode: 409 }));
  expect((await inject('GET', '/api/v1/crm/customers/customer/ledger/9')).statusCode).toBe(409);
  expect(mocks.ledger).not.toHaveBeenCalled();
});
it('denies inaccessible customer detail before commerce reads', async () => {
  mocks.require.mockRejectedValue(Object.assign(new Error('not found'), { statusCode: 404 }));
  expect((await inject('GET', '/api/v1/crm/customers/foreign')).statusCode).toBe(404);
});
