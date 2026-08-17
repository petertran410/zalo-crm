import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getHisweetiePublicApiClient,
  resetHisweetiePublicApiClient,
  PublicApiRateLimitError,
} from '../src/modules/integrations/hisweetie-public-api-client.js';

describe('HisweetiePublicApiClient', () => {
  afterEach(() => {
    resetHisweetiePublicApiClient();
    vi.unstubAllGlobals();
  });

  it('xếp hàng request tuần tự và không gọi song song', async () => {
    const calls: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      calls.push(String(url));
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      if (String(url).includes('/oauth/token')) {
        return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 201 });
      }
      return new Response(JSON.stringify({ total: 1, data: [{ id: 1 }] }), { status: 200 });
    }));

    const client = getHisweetiePublicApiClient();
    await Promise.all([
      client.listCustomers({ pageSize: 1 }),
      client.listProducts({ pageSize: 1 }),
    ]);

    expect(maxInFlight).toBe(1);
    expect(calls.some((url) => url.includes('/customers'))).toBe(true);
    expect(calls.some((url) => url.includes('/products'))).toBe(true);
  });

  it('ném PublicApiRateLimitError khi POS trả 429', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/oauth/token')) {
        return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 201 });
      }
      return new Response(JSON.stringify({ error: 'rate_limit_exceeded' }), {
        status: 429,
        headers: { 'retry-after': '2' },
      });
    }));

    const client = getHisweetiePublicApiClient();
    await expect(client.listCustomers({ pageSize: 1 })).rejects.toBeInstanceOf(PublicApiRateLimitError);
  });
});
