import { describe, expect, it } from 'vitest';
import { withPosSyncLock } from '../src/modules/pos/pos-sync-lock.js';

describe('withPosSyncLock', () => {
  it('không cho hai lần đồng bộ cùng entity chạy chồng nhau', async () => {
    const order: string[] = [];
    const slow = withPosSyncLock('org-1', 'Customer', async () => {
      order.push('start-1');
      await new Promise((resolve) => setTimeout(resolve, 30));
      order.push('end-1');
    });
    const fast = withPosSyncLock('org-1', 'Customer', async () => {
      order.push('start-2');
      order.push('end-2');
    });

    await Promise.all([slow, fast]);

    expect(order).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
  });

  it('entity khác nhau vẫn chạy song song được', async () => {
    const order: string[] = [];
    await Promise.all([
      withPosSyncLock('org-1', 'Customer', async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        order.push('customer');
      }),
      withPosSyncLock('org-1', 'Product', async () => {
        order.push('product');
      }),
    ]);

    expect(order).toEqual(['product', 'customer']);
  });

  it('lỗi ở lần chạy trước không kẹt hàng đợi', async () => {
    await expect(
      withPosSyncLock('org-2', 'Customer', async () => { throw new Error('boom'); }),
    ).rejects.toThrow('boom');

    await expect(
      withPosSyncLock('org-2', 'Customer', async () => 'ok'),
    ).resolves.toBe('ok');
  });
});
