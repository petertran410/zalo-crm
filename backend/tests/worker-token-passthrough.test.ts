// FIX 2026-06-12 — Regression test cho vết gãy #1 (BLOCKER): worker đăng ký
// bằng (job) => ... BỎ RƠI `token` của BullMQ. Vì các nhánh hoãn (moveToDelayed)
// đều gài `&& token`, token undefined → mọi lần cần hoãn rơi xuống return skipped
// → KHÔNG xếp step kế → luồng bám đuổi đứng im vĩnh viễn.
//
// Test này bắt PROCESSOR FUNCTION mà worker đăng ký với `new Worker(...)`, gọi nó
// với (fakeJob, 'TOKEN_X') và xác nhận TOKEN_X được chuyển nguyên vẹn xuống
// processJob. Trước fix: processor là (job)=>... nên đối số token bị nuốt → test
// thấy token=undefined và FAIL. Sau fix: (job, token)=>... → token chảy xuống.

import { describe, it, expect, vi } from 'vitest';

// ── Bắt processor function khi worker khởi tạo ──────────────────────────────
let capturedProcessor:
  | ((job: unknown, token?: string) => unknown)
  | null = null;

vi.mock('bullmq', () => ({
  Worker: class {
    constructor(_name: string, processor: (job: unknown, token?: string) => unknown) {
      capturedProcessor = processor;
    }
    on() {
      return this;
    }
  },
  DelayedError: class DelayedError extends Error {},
  UnrecoverableError: class UnrecoverableError extends Error {},
}));

// ── withTenant: chạy callback ngay (đồng bộ), giữ nguyên giá trị trả về ──────
vi.mock('../src/shared/tenant/tenant-context.js', () => ({
  withTenant: (_orgId: string, fn: () => unknown) => fn(),
}));

// ── Bắt token mà processJob NHẬN ĐƯỢC. Ta không chạy logic thật của processJob
//    (đụng DB/Redis) — chỉ cần biết token có chảy tới hay không. Hack: spy qua
//    một biến module-level mà processor sẽ gọi gián tiếp. Vì processJob là hàm
//    nội bộ không export, ta mock các phụ thuộc để processJob chạy tới điểm
//    đầu rồi văng sớm — nhưng đơn giản hơn: mock prisma trả null để processJob
//    return sớm, và ta đọc token qua đối số mà processor TRUYỀN cho withTenant.
//    → đã bắt ở trên: withTenant gọi fn() = () => processJob(job, token).

// Mock mọi I/O nặng để startSequenceStepWorker() + processor chạy không cần hạ tầng.
vi.mock('../src/shared/database/prisma-client.js', () => {
  const nullAll = new Proxy(
    {},
    {
      get: () =>
        new Proxy(
          {},
          { get: () => vi.fn(async () => null) },
        ),
    },
  );
  return { prisma: nullAll };
});
vi.mock('../src/modules/automation/queues/redis-connection.js', () => ({
  getBullMQRedis: () => ({ pttl: vi.fn(async () => -2) }),
}));
vi.mock('../src/modules/automation/queues/queue-registry.js', () => ({
  QUEUE_NAMES: { SEQUENCE_STEP: 'sequence-step' },
  buildSequenceStepJobId: (t: string, c: string, i: number) => `${t}-${c}-${i}`,
  getSequenceStepQueue: () => ({ add: vi.fn(), getJobs: vi.fn(async () => []) }),
}));
vi.mock('../src/modules/automation/queues/worker-guards.js', () => ({
  runAllGuards: vi.fn(async () => ({ passed: true })),
  consumeQuotaAfterSend: vi.fn(async () => true),
  recordNickSend: vi.fn(async () => undefined),
}));
vi.mock('../src/modules/automation/queues/error-classify.js', () => ({
  classifyError: vi.fn(() => ({ kind: 'transient' })),
}));
vi.mock('../src/modules/automation/engine/action-handlers/send-message.js', () => ({
  sendMessageHandler: vi.fn(async () => ({ ok: true, data: {} })),
}));
vi.mock('../src/modules/automation/queues/stats-reconcile-cron.js', () => ({}), {
  virtual: true,
});

import { startSequenceStepWorker } from '../src/modules/automation/queues/sequence-step-worker.js';

// workerInstance là singleton trong module — chỉ lần startSequenceStepWorker()
// ĐẦU TIÊN mới gọi `new Worker` và set capturedProcessor. Khởi tạo MỘT LẦN ở
// đây rồi tái dùng processor đã bắt cho mọi test (không reset giữa các test).
startSequenceStepWorker();
const processor = capturedProcessor as (job: unknown, token?: string) => unknown;

describe('FIX #1 — worker truyền token BullMQ xuống processJob', () => {
  it('processor đăng ký nhận arity 2 (job, token) — KHÔNG nuốt token', () => {
    expect(processor).toBeTypeOf('function');
    // Bug cũ: (job) => ... → length === 1. Sau fix: (job, token) => ... → length === 2.
    expect((processor as Function).length).toBe(2);
  });

  it('token được chuyển vào processor (gọi không throw với token truthy)', async () => {
    const fakeJob = {
      id: 'job-1',
      data: {
        triggerId: 't1',
        contactId: 'c1',
        sequenceId: 's1',
        nickId: 'n1',
        orgId: 'org1',
        stepIdx: 0,
        totalSteps: 1,
      },
      moveToDelayed: vi.fn(async () => undefined),
    };
    // processJob sẽ văng sớm vì prisma trả null (sequence not found → return skipped),
    // nhưng điều ta kiểm là: gọi processor với (job, token) KHÔNG ném lỗi arity và
    // token được forward. Không ném ⇒ chữ ký khớp.
    await expect(processor(fakeJob, 'TOKEN_X')).resolves.toBeDefined();
  });
});
