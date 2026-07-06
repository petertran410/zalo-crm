// Fix triệt để (2026-06-18) — self-heal bước sequence kẹt. Test logic reconcileStuckSequenceSteps:
// kẹt→enqueue, còn-job→bỏ, xong→bỏ, đang-chat→bỏ, marker→1 lần/ngày. vi.mock cô lập.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// care-session-service import enqueueSequenceStart từ worker (top-level) → mock cho nhẹ.
vi.mock('../src/modules/automation/queues/sequence-step-worker.js', () => ({
  enqueueSequenceStart: vi.fn(async () => undefined),
}));

// ── queue giả (dynamic import trong hàm) ─────────────────────────────────────
const queueAdd = vi.fn(async () => ({ id: 'j' }));
const retryFn = vi.fn(async () => undefined);
let pendingJobs: Array<{ data: { triggerId: string; contactId: string } }> = [];
// existingJob = null (chưa có job) | {state, failedReason} (job cùng jobId)
let existingJob: { state: string; failedReason?: string } | null = null;
vi.mock('../src/modules/automation/queues/queue-registry.js', () => ({
  getSequenceStepQueue: () => ({
    getJobs: async () => pendingJobs,
    getJob: async () =>
      existingJob
        ? { getState: async () => existingJob!.state, failedReason: existingJob!.failedReason, retry: retryFn }
        : null,
    add: queueAdd,
  }),
  buildSequenceStepJobId: (t: string, s: string, c: string, i: number, e: number) => `${t}-${s}-${c}-e${e}-${i}`,
}));

// ── redis giả (SET NX) ───────────────────────────────────────────────────────
let markerStore: Set<string>;
vi.mock('../src/modules/automation/queues/redis-connection.js', () => ({
  getBullMQRedis: () => ({
    async set(key: string, _v: string, ..._a: unknown[]) {
      if (markerStore.has(key)) return null; // NX: đã có
      markerStore.add(key);
      return 'OK';
    },
  }),
}));

// ── prisma giả ───────────────────────────────────────────────────────────────
let candidates: any[] = [];
let lastSent: any = null;
vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: {
    careSession: { findMany: async () => candidates },
    automationEventLog: { findFirst: async () => lastSent },
    sequenceStep: { count: async () => 5 },
    automationSequence: { findUnique: async () => ({ steps: [1, 2, 3, 4, 5] }) },
  },
}));

import { reconcileStuckSequenceSteps } from '../src/modules/automation/care-session/care-session-service.js';

const old = new Date(Date.now() - 3 * 3600_000); // 3h trước (đủ cũ)
function candidate(over: Record<string, unknown> = {}) {
  return {
    id: 's1', orgId: 'o1', contactId: 'c1', nickId: 'n1',
    sourceTriggerId: 't1', sourceSequenceId: 'seq1', enrollEpoch: 1,
    lastCustomerActivityAt: null,
    ...over,
  };
}

beforeEach(() => {
  queueAdd.mockClear();
  retryFn.mockClear();
  pendingJobs = [];
  existingJob = null;
  markerStore = new Set();
  candidates = [];
  lastSent = { detail: 'step 2/5', createdAt: old }; // đã gửi bước 2/5, cũ
});

describe('reconcileStuckSequenceSteps — self-heal bước kẹt', () => {
  it('khách kẹt (gửi 2/5, không job pending) → enqueue lại bước 3', async () => {
    candidates = [candidate()];
    const r = await reconcileStuckSequenceSteps();
    expect(r.recovered).toBe(1);
    expect(queueAdd).toHaveBeenCalledTimes(1);
    const jobData = queueAdd.mock.calls[0][1] as { stepIdx: number };
    expect(jobData.stepIdx).toBe(3); // bước kế sau 2
  });

  it('còn job pending → KHÔNG enqueue', async () => {
    candidates = [candidate()];
    pendingJobs = [{ data: { triggerId: 't1', contactId: 'c1' } }];
    const r = await reconcileStuckSequenceSteps();
    expect(r.recovered).toBe(0);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('đã xong (gửi bước cuối 4/5 → kế là 5 = hết) → KHÔNG enqueue', async () => {
    candidates = [candidate()];
    lastSent = { detail: 'step 4/5', createdAt: old }; // bước kế = 5 >= total 5
    const r = await reconcileStuckSequenceSteps();
    expect(r.recovered).toBe(0);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('khách đang chat gần đây → KHÔNG đè', async () => {
    candidates = [candidate({ lastCustomerActivityAt: new Date() })]; // vừa chat
    const r = await reconcileStuckSequenceSteps();
    expect(r.recovered).toBe(0);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('vừa gửi < 1h (chưa kẹt) → KHÔNG enqueue', async () => {
    candidates = [candidate()];
    lastSent = { detail: 'step 2/5', createdAt: new Date() }; // gửi 2 vừa nãy
    const r = await reconcileStuckSequenceSteps();
    expect(r.recovered).toBe(0);
  });

  it('job cùng jobId ở trạng thái FAILED (bước chết RATE_LIMITED) → RETRY (bug e7ade24c)', async () => {
    candidates = [candidate()];
    existingJob = { state: 'failed', failedReason: 'Đã đạt giới hạn 200 message/ngày' };
    const r = await reconcileStuckSequenceSteps();
    expect(r.recovered).toBe(1);
    expect(retryFn).toHaveBeenCalledTimes(1); // retry job chết, KHÔNG add mới
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('job FAILED nhưng Permanent (NO_FRIEND_ROW) → BỎ, không retry', async () => {
    candidates = [candidate()];
    existingJob = { state: 'failed', failedReason: 'Permanent: NO_FRIEND_ROW' };
    const r = await reconcileStuckSequenceSteps();
    expect(r.recovered).toBe(0);
    expect(retryFn).not.toHaveBeenCalled();
    expect(markerStore.size).toBe(0); // không đốt marker oan
  });

  it('job cùng jobId đang delayed/active (pending thật) → BỎ', async () => {
    candidates = [candidate()];
    existingJob = { state: 'delayed' };
    const r = await reconcileStuckSequenceSteps();
    expect(r.recovered).toBe(0);
    expect(retryFn).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('marker đã tồn tại (đã heal hôm nay) → bỏ (chống loop)', async () => {
    candidates = [candidate()];
    markerStore.add('seqheal:t1:c1:3'); // đã heal bước 3 hôm nay
    const r = await reconcileStuckSequenceSteps();
    expect(r.recovered).toBe(0);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('chạy 2 lần liên tiếp → lần 2 bị marker chặn (1 lần/ngày)', async () => {
    candidates = [candidate()];
    const r1 = await reconcileStuckSequenceSteps();
    expect(r1.recovered).toBe(1);
    queueAdd.mockClear();
    const r2 = await reconcileStuckSequenceSteps(); // pending vẫn rỗng (test) nhưng marker đã set
    expect(r2.recovered).toBe(0);
    expect(queueAdd).not.toHaveBeenCalled();
  });
});
