import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { HisweetiePublicApiClient } from '../../src/modules/integrations/hisweetie-public-api-client.js';
beforeEach(() => {
  vi.stubEnv('CRM_POS_WRITE_ENABLED', 'true');
  vi.stubEnv('CRM_POS_DRAFT_CONTRACT_VERIFIED', 'true');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('preserves POST/body/idempotency after a 401 token refresh', async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  let attempts = 0;
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    requests.push({ url: String(url), init });
    if (String(url).endsWith('/oauth/token')) return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), { status: 201 });
    if (++attempts === 1) return new Response('{}', { status: 401 });
    return new Response(JSON.stringify({ id: 1, status: 1, statusValue: 'Phiếu tạm' }), { status: 201 });
  }));
  const client = new HisweetiePublicApiClient('https://pos.invalid', 'test', 'test', 0);
  const body = { branchId: 1, customerId: 2, items: [{ productId: 3, quantity: 1, unitPrice: 5 }] };
  await client.createOrder(body, 'fixed-key');
  const writes = requests.filter(r => r.url.endsWith('/orders'));
  expect(writes).toHaveLength(2);
  for (const write of writes) {
    expect(write.init.method).toBe('POST');
    expect(JSON.parse(String(write.init.body))).toEqual(body);
    expect((write.init.headers as Record<string,string>)['Idempotency-Key']).toBe('fixed-key');
  }
});
it('blocks forbidden POS mutations before network access', () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const client = new HisweetiePublicApiClient('https://pos.invalid', 'test', 'test', 0);
  expect(() => client.updateCustomer(1, { name: 'test', contactNumber: '0900000000' }, 'key')).toThrow();
  expect(() => client.deactivateCustomer(1)).toThrow();
  expect(() => client.cancelOrder(1, 'key')).toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
