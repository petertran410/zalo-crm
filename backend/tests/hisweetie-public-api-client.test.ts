// Unit test (thuần) — client REST cho POS Public API.
//
// Dựng client bằng constructor thay vì singleton `getHisweetiePublicApiClient()`:
// singleton đọc config từ process.env, mà vitest chỉ nạp DATABASE_URL → máy không
// có HISWEETIE_PUBLIC_API_* sẽ ném "chưa cấu hình" trước cả khi chạm fetch giả.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HisweetiePublicApiClient,
  PublicApiRateLimitError,
} from '../src/modules/integrations/hisweetie-public-api-client.js';

const BASE_URL = 'https://pos.test';

/** minInterval=0: test không phải chờ thật 800ms giữa các request. */
function makeClient(): HisweetiePublicApiClient {
  return new HisweetiePublicApiClient(BASE_URL, 'client-id', 'client-secret', 0);
}

describe('HisweetiePublicApiClient', () => {
  afterEach(() => {
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

    const client = makeClient();
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

    const client = makeClient();
    await expect(client.listCustomers({ pageSize: 1 })).rejects.toBeInstanceOf(PublicApiRateLimitError);
  });

  /**
   * POS mặc định `includeInactive=false` = chỉ trả bản ghi CÒN HOẠT ĐỘNG
   * (PUBLIC-API.md mục 3). Gửi thừa `includeInactive=true` là kéo về cả khách đã
   * ngừng hoạt động rồi lưu vào CRM — đúng lỗi đã xảy ra trước đây.
   */
  it('mặc định KHÔNG gửi includeInactive → POS chỉ trả khách còn hoạt động', async () => {
    const urls = stubFetchCapturingUrls();
    const client = makeClient();

    await client.listCustomers({ currentItem: 0, pageSize: 100 });

    const customerUrl = urls.find((u) => u.includes('/customers'));
    expect(customerUrl).toBeDefined();
    expect(customerUrl).not.toContain('includeInactive');
  });

  it('chỉ gửi includeInactive khi caller yêu cầu tường minh', async () => {
    const urls = stubFetchCapturingUrls();
    const client = makeClient();

    await client.listCustomers({ pageSize: 100, includeInactive: true });

    expect(urls.find((u) => u.includes('/customers'))).toContain('includeInactive=true');
  });

  it('map lastModifiedFrom vào query cho đồng bộ tăng dần', async () => {
    const urls = stubFetchCapturingUrls();
    const client = makeClient();

    await client.listCustomers({ pageSize: 100, lastModifiedFrom: '2026-08-14T10:00:00.000Z' });

    expect(urls.find((u) => u.includes('/customers')))
      .toContain(`lastModifiedFrom=${encodeURIComponent('2026-08-14T10:00:00.000Z')}`);
  });

  it('đọc được `timestamp` của máy chủ POS từ response', async () => {
    stubFetchCapturingUrls({ timestamp: '2026-08-14T10:00:00.000Z' });
    const client = makeClient();

    const res = await client.listCustomers({ pageSize: 1 });

    expect(res.timestamp).toBe('2026-08-14T10:00:00.000Z');
  });

  // Hồi quy: /oauth/token nằm DƯỚI /api/public/v1 giống mọi endpoint khác.
  // Gọi thẳng {baseUrl}/oauth/token sẽ nhận 404 từ POS thật.
  it('gọi /oauth/token dưới tiền tố /api/public/v1', async () => {
    const urls = stubFetchCapturingUrls();
    await makeClient().listCustomers({ pageSize: 1 });

    expect(urls[0]).toBe(`${BASE_URL}/api/public/v1/oauth/token`);
    expect(urls[1]).toContain(`${BASE_URL}/api/public/v1/customers`);
  });

  // Base URL cấu hình sẵn kèm tiền tố vẫn phải ra đúng một tiền tố, không nhân đôi.
  it('chuẩn hoá base URL đã kèm sẵn /api/public/v1', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(String(url));
      if (String(url).includes('/oauth/token')) {
        return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 201 });
      }
      return new Response(JSON.stringify({ total: 0, data: [] }), { status: 200 });
    }));

    const client = new HisweetiePublicApiClient(`${BASE_URL}/api/public/v1`, 'client-id', 'client-secret', 0);
    await client.listCustomers({ pageSize: 1 });

    expect(urls[0]).toBe(`${BASE_URL}/api/public/v1/oauth/token`);
    for (const url of urls) expect(url).not.toContain('/api/public/v1/api/public/v1');
  });
});

/** Bắt lại mọi URL đã gọi; trả body list rỗng kèm phần `extra` nếu có. */
function stubFetchCapturingUrls(extra: Record<string, unknown> = {}): string[] {
  const urls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(String(url));
    if (String(url).includes('/oauth/token')) {
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 201 });
    }
    return new Response(JSON.stringify({ total: 0, data: [], ...extra }), { status: 200 });
  }));
  return urls;
}
