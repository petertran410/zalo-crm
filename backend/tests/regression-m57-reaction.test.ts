/**
 * regression-m57-reaction.test.ts — M16 smoke regression.
 *
 * Bảo vệ luồng M57 (customer_reaction sentiment routing):
 *   Part A — classifyReactionEmoji pure:
 *     positive: ❤️ 👍 🌹 😆 + Zalo codes /-heart /-strong :> /-rose
 *     negative: 😡 👎 💔 + :-(( :-h
 *     neutral: mọi emoji khác (vd 😮 😭)
 *   Part B — onCustomerReaction integration:
 *     negative → setContactPauseFlag(48h) + leadScore decrement + cancel jobs
 *     positive → leadScore increment + KHÔNG pause + KHÔNG cancel
 *     neutral  → no-op (chỉ ghi event log)
 *
 * Memory: anh chốt 2026-06-01 — positive không dừng (Zalo protocol thân thiện),
 * negative pause 48h (lâu hơn reply 24h vì negative tín hiệu mạnh).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────
const prismaMock = {
  automationEventLog: { create: vi.fn() },
  contact: { update: vi.fn().mockResolvedValue({}) },
};
const redisMock = {
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  pttl: vi.fn().mockResolvedValue(0),
};
const queueMock = { getJobs: vi.fn().mockResolvedValue([]) };

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../src/modules/automation/queues/redis-connection.js', () => ({
  getBullMQRedis: () => redisMock,
}));
vi.mock('../src/modules/automation/queues/queue-registry.js', () => ({
  getSequenceStepQueue: () => queueMock,
  buildSequenceStepJobId: (t: string, c: string, i: number) => `${t}-${c}-${i}`,
}));
vi.mock('../src/modules/automation/queues/internal-notify-worker.js', () => ({
  notifyFriendAccept: vi.fn(),
  notifyFriendReject: vi.fn(),
  notifyCustomerReply: vi.fn(),
}));
vi.mock('../src/modules/automation/queues/sequence-step-worker.js', () => ({
  enqueueSequenceStart: vi.fn(),
}));

const { classifyReactionEmoji, onCustomerReaction } = await import(
  '../src/modules/automation/queues/event-hooks.js'
);

beforeEach(() => {
  vi.clearAllMocks();
  redisMock.set.mockResolvedValue('OK');
  queueMock.getJobs.mockResolvedValue([]);
  prismaMock.contact.update.mockResolvedValue({});
});

// ════════════════════════════════════════════════════════════════════════
// Part A — Pure classifier
// ════════════════════════════════════════════════════════════════════════
describe('classifyReactionEmoji (pure)', () => {
  it('positive: ❤️ 👍 🌹 😆', () => {
    expect(classifyReactionEmoji('❤️')).toBe('positive');
    expect(classifyReactionEmoji('👍')).toBe('positive');
    expect(classifyReactionEmoji('🌹')).toBe('positive');
    expect(classifyReactionEmoji('😆')).toBe('positive');
  });

  it('positive: Zalo SDK codes', () => {
    expect(classifyReactionEmoji('/-heart')).toBe('positive');
    expect(classifyReactionEmoji('/-strong')).toBe('positive');
    expect(classifyReactionEmoji(':>')).toBe('positive');
    expect(classifyReactionEmoji('/-rose')).toBe('positive');
  });

  it('negative: 😡 👎 💔 + Zalo codes', () => {
    expect(classifyReactionEmoji('😡')).toBe('negative');
    expect(classifyReactionEmoji('👎')).toBe('negative');
    expect(classifyReactionEmoji('💔')).toBe('negative');
    expect(classifyReactionEmoji(':-((')).toBe('negative');
    expect(classifyReactionEmoji(':-h')).toBe('negative');
  });

  it('neutral: 😮 😭 unknown', () => {
    expect(classifyReactionEmoji('😮')).toBe('neutral');
    expect(classifyReactionEmoji('😭')).toBe('neutral');
    expect(classifyReactionEmoji('🤔')).toBe('neutral');
    expect(classifyReactionEmoji('xyz')).toBe('neutral');
  });
});

// ════════════════════════════════════════════════════════════════════════
// Part B — onCustomerReaction integration
// ════════════════════════════════════════════════════════════════════════
describe('onCustomerReaction — sentiment routing', () => {
  it('positive (❤️) → score++ + KHÔNG pause', async () => {
    await onCustomerReaction({
      orgId: 'org1', triggerId: 't1', contactId: 'c1',
      nickId: 'n1', emoji: '❤️',
    });

    expect(prismaMock.contact.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { leadScore: { increment: 5 } },
    });
    expect(redisMock.set).not.toHaveBeenCalled(); // KHÔNG pause
    expect(prismaMock.automationEventLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'customer_reaction_positive',
          detail: '❤️',
        }),
      }),
    );
  });

  it('negative (😡) → pause 48h + score-- + cancel jobs', async () => {
    await onCustomerReaction({
      orgId: 'org1', triggerId: 't1', contactId: 'c1',
      nickId: 'n1', emoji: '😡',
    });

    expect(redisMock.set).toHaveBeenCalledWith(
      'contact:paused:t1:c1', '1', 'PX', 48 * 3600 * 1000,
    );
    expect(prismaMock.contact.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { leadScore: { decrement: 5 } },
    });
    expect(prismaMock.automationEventLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'customer_reaction_negative',
        }),
      }),
    );
    // Queue cancel attempted
    expect(queueMock.getJobs).toHaveBeenCalled();
  });

  it('neutral (😮) → chỉ log event, không pause, không score change', async () => {
    await onCustomerReaction({
      orgId: 'org1', triggerId: 't1', contactId: 'c1',
      nickId: 'n1', emoji: '😮',
    });

    expect(redisMock.set).not.toHaveBeenCalled();
    expect(prismaMock.contact.update).not.toHaveBeenCalled();
    expect(prismaMock.automationEventLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'customer_reaction_neutral',
        }),
      }),
    );
  });

  it('positive 👍 cũng tăng điểm như ❤️', async () => {
    await onCustomerReaction({
      orgId: 'org1', triggerId: 't1', contactId: 'c2',
      nickId: 'n1', emoji: '👍',
    });
    expect(prismaMock.contact.update).toHaveBeenCalledWith({
      where: { id: 'c2' },
      data: { leadScore: { increment: 5 } },
    });
  });
});
