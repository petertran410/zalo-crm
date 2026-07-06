// Đợt 1.5 — integration test worker: enqueueSequenceStart ghi block khi kịch bản TẮT/không-tìm-thấy
// lúc KHỞI ĐỘNG (ca 1c76de9b) + KHÔNG enqueue. Dùng vi.mock cô lập (không cần BullMQ/Redis thật).
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Bắt logBlockOnce ──────────────────────────────────────────────────────────
const logBlockOnce = vi.fn(async () => true);
const clearBlockMarker = vi.fn(async () => undefined);
vi.mock('../src/modules/automation/shared/block-logger.js', () => ({
  logBlockOnce: (...a: unknown[]) => (logBlockOnce as any)(...a),
  clearBlockMarker: (...a: unknown[]) => (clearBlockMarker as any)(...a),
}));

// ── Bắt queue.add (enqueue hay không) ────────────────────────────────────────
const queueAdd = vi.fn(async () => ({ id: 'job1' }));
const queueGetJob = vi.fn(async () => null);
vi.mock('../src/modules/automation/queues/queue-registry.js', () => ({
  QUEUE_NAMES: { sequenceStep: 'sequence-step' },
  buildSequenceStepJobId: (t: string, s: string, c: string, i: number, e: number) => `${t}-${s}-${c}-e${e}-${i}`,
  sequenceStepJobPrefix: (t: string) => `${t}-`,
  getSequenceStepQueue: () => ({ add: queueAdd, getJob: queueGetJob }),
}));

// ── prisma: điều khiển sequence (enabled/disabled/null) + steps ──────────────
const dbState = {
  sequence: null as null | { steps: unknown[]; enabled: boolean; runtimeRules: unknown },
  sequenceSteps: [] as unknown[],
};
vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: {
    automationSequence: { findUnique: vi.fn(async () => dbState.sequence) },
    sequenceStep: { findMany: vi.fn(async () => dbState.sequenceSteps) },
  },
}));

// ── Mock các import nặng/không liên quan để import module sạch ────────────────
vi.mock('../src/modules/automation/queues/redis-connection.js', () => ({ getBullMQRedis: () => ({}) }));
vi.mock('../src/modules/automation/queues/worker-guards.js', () => ({
  runAllGuards: vi.fn(), consumeQuotaAfterSend: vi.fn(), recordNickSend: vi.fn(),
}));
vi.mock('../src/modules/automation/queues/error-classify.js', () => ({ classifyError: vi.fn() }));
vi.mock('../src/modules/automation/engine/action-handlers/send-message.js', () => ({ sendMessageHandler: vi.fn() }));
vi.mock('../src/modules/automation/engine/schedule-calculator.js', () => ({
  stepDelayMs: () => 0,
  nextAllowedTime: (d: Date) => d, // gửi ngay (test không quan tâm giờ)
}));
vi.mock('../src/shared/tenant/tenant-context.js', () => ({ withTenant: (_o: string, fn: () => unknown) => fn() }));

import { enqueueSequenceStart } from '../src/modules/automation/queues/sequence-step-worker.js';

const input = { triggerId: 't1', contactId: 'c1', sequenceId: 's1', nickId: 'n1', orgId: 'o1' };

beforeEach(() => {
  logBlockOnce.mockClear();
  queueAdd.mockClear();
  dbState.sequence = null;
  dbState.sequenceSteps = [];
});

describe('enqueueSequenceStart — ghi lý do khi không khởi động được (Đợt 1)', () => {
  it('kịch bản đang TẮT (ca 1c76de9b) → logBlockOnce sequence_disabled + KHÔNG enqueue', async () => {
    dbState.sequence = { steps: [], enabled: false, runtimeRules: {} };
    await enqueueSequenceStart(input);
    expect(logBlockOnce).toHaveBeenCalledTimes(1);
    const arg = logBlockOnce.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.reason).toBe('sequence_disabled');
    expect(arg.triggerId).toBe('t1');
    expect(arg.contactId).toBe('c1');
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('kịch bản KHÔNG tìm thấy → logBlockOnce sequence_not_found + KHÔNG enqueue', async () => {
    dbState.sequence = null;
    await enqueueSequenceStart(input);
    expect(logBlockOnce).toHaveBeenCalledTimes(1);
    expect((logBlockOnce.mock.calls[0][0] as Record<string, unknown>).reason).toBe('sequence_not_found');
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('kịch bản 0 bước → logBlockOnce step_out_of_range + KHÔNG enqueue', async () => {
    dbState.sequence = { steps: [], enabled: true, runtimeRules: {} };
    dbState.sequenceSteps = [];
    await enqueueSequenceStart(input);
    expect(logBlockOnce).toHaveBeenCalledTimes(1);
    expect((logBlockOnce.mock.calls[0][0] as Record<string, unknown>).reason).toBe('step_out_of_range');
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('kịch bản BẬT + có bước → enqueue bước 0, KHÔNG ghi block', async () => {
    dbState.sequence = { steps: [], enabled: true, runtimeRules: {} };
    dbState.sequenceSteps = [{ id: 'st1', blockId: 'b1', delayMinutes: 5, exitCondition: null }];
    await enqueueSequenceStart(input);
    expect(queueAdd).toHaveBeenCalledTimes(1);
    expect(logBlockOnce).not.toHaveBeenCalled();
  });
});
