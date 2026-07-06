// FIX 2026-06-12 — Regression test cho vết gãy #3: quota gửi-tin vs kết-bạn
// trước đây hard-code kind='friend' cho cả hai → chung 1 ô đếm Redis → bóp
// nghẹt nhầm hạn mức của nhau. Test này khoá hành vi: kind phải xuyên qua
// runAllGuards → checkDailyQuotaPeek, và qua consumeQuotaAfterSend, đúng giá trị.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock lớp quota-lua để bắt CHÍNH XÁC kind được truyền xuống (không cần Redis thật).
const peekQuota = vi.fn(async (_nick: string, _kind: string, _cap: number) => ({
  used: 0,
  remaining: 999,
  capped: false,
}));
const incrQuotaAtomic = vi.fn(async (_nick: string, _kind: string, _cap: number) => true);

vi.mock('../src/modules/automation/queues/quota-lua.js', () => ({
  peekQuota: (...a: unknown[]) => (peekQuota as any)(...a),
  incrQuotaAtomic: (...a: unknown[]) => (incrQuotaAtomic as any)(...a),
}));

// Các guard khác trong runAllGuards đụng prisma/redis — mock cho pass hết để
// pipeline chạy tới quota_peek mà không cần DB. checkHourWindow là pure (không
// mock); nick_gap/recency/multi_nick đụng I/O nên ta mock redis + prisma rỗng.
vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: {
    friendshipAttempt: { findMany: vi.fn(async () => []) },
    friend: { count: vi.fn(async () => 0), findMany: vi.fn(async () => []) },
    contactAccess: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock('../src/modules/automation/queues/redis-connection.js', () => ({
  getBullMQRedis: () => ({ get: vi.fn(async () => null), set: vi.fn(async () => 'OK') }),
}));

import {
  runAllGuards,
  consumeQuotaAfterSend,
  type TriggerGuardConfig,
} from '../src/modules/automation/queues/worker-guards.js';

// Hour window rộng (0→24) để guard hour luôn pass, không phụ thuộc giờ chạy test.
const triggerCfg: TriggerGuardConfig = {
  triggerId: 't1',
  sendHourStart: 0,
  sendHourEnd: 24,
  recencySkipDays: 0,
  multiNickThreshold: 0,
  minFriendReqGapMs: 0,
  triggerOwnerUserId: 'u1',
  orgId: 'org1',
} as TriggerGuardConfig;

beforeEach(() => {
  peekQuota.mockClear();
  incrQuotaAtomic.mockClear();
});

describe('FIX #3 — quota kind tách gửi-tin vs kết-bạn', () => {
  it('sequence-step (gửi tin) đếm vào kind="message"', async () => {
    await runAllGuards({
      contactId: 'c1',
      nickId: 'n1',
      triggerCfg,
      nickCap: 300,
      quotaKind: 'message',
    });
    expect(peekQuota).toHaveBeenCalled();
    // tham số thứ 2 của peekQuota là kind
    const kindArg = peekQuota.mock.calls.at(-1)?.[1];
    expect(kindArg).toBe('message');
  });

  it('friend-invite (kết bạn) đếm vào kind="friend"', async () => {
    await runAllGuards({
      contactId: 'c1',
      nickId: 'n1',
      triggerCfg,
      nickCap: 30,
      quotaKind: 'friend',
    });
    const kindArg = peekQuota.mock.calls.at(-1)?.[1];
    expect(kindArg).toBe('friend');
  });

  it('mặc định (không truyền quotaKind) giữ hành vi cũ "friend"', async () => {
    await runAllGuards({ contactId: 'c1', nickId: 'n1', triggerCfg, nickCap: 30 });
    const kindArg = peekQuota.mock.calls.at(-1)?.[1];
    expect(kindArg).toBe('friend');
  });

  it('consumeQuotaAfterSend chuyển kind đúng (message vs friend)', async () => {
    await consumeQuotaAfterSend('n1', 300, 'message');
    expect(incrQuotaAtomic.mock.calls.at(-1)?.[1]).toBe('message');

    await consumeQuotaAfterSend('n1', 30, 'friend');
    expect(incrQuotaAtomic.mock.calls.at(-1)?.[1]).toBe('friend');

    // mặc định = friend (backward compat)
    await consumeQuotaAfterSend('n1', 30);
    expect(incrQuotaAtomic.mock.calls.at(-1)?.[1]).toBe('friend');
  });
});
