// Phase 7 — Sequence types & validator unit tests.
//
// Covers validateSteps (shape, duplicates, delay bounds) and validateRuntimeRules
// (hour range, delay min/max, type checks). DB-reaching helper checkBlockReferences
// is integration-tested at the route level, not here.

import { describe, it, expect } from 'vitest';
import {
  validateSteps,
  validateRuntimeRules,
  DEFAULT_RUNTIME_RULES,
} from '../src/modules/automation/sequences/types.js';

describe('validateSteps', () => {
  it('accepts a valid 3-step sequence', () => {
    const r = validateSteps([
      { stepId: 's1', blockId: 'b-greet', delayMinutes: 0 },
      { stepId: 's2', blockId: 'b-info',  delayMinutes: 30 },
      { stepId: 's3', blockId: 'b-close', delayMinutes: 120 },
    ]);
    expect(r.ok).toBe(true);
  });

  it('rejects empty steps', () => {
    const r = validateSteps([]);
    expect(r.ok).toBe(false);
  });

  it('rejects non-array', () => {
    const r = validateSteps('nope');
    expect(r.ok).toBe(false);
  });

  it('rejects duplicate stepId', () => {
    const r = validateSteps([
      { stepId: 's1', blockId: 'b1', delayMinutes: 0 },
      { stepId: 's1', blockId: 'b2', delayMinutes: 10 },
    ]);
    expect(r.ok).toBe(false);
  });

  it('rejects step missing blockId', () => {
    const r = validateSteps([{ stepId: 's1', delayMinutes: 0 }]);
    expect(r.ok).toBe(false);
  });

  it('rejects negative delay', () => {
    const r = validateSteps([{ stepId: 's1', blockId: 'b1', delayMinutes: -5 }]);
    expect(r.ok).toBe(false);
  });

  it('rejects delay > 60 days (defensive against unit mixups)', () => {
    const r = validateSteps([{ stepId: 's1', blockId: 'b1', delayMinutes: 100000 }]);
    expect(r.ok).toBe(false);
  });

  it('accepts same blockId reused across steps (resend block in sequence)', () => {
    const r = validateSteps([
      { stepId: 's1', blockId: 'b-greet', delayMinutes: 0 },
      { stepId: 's2', blockId: 'b-greet', delayMinutes: 1440 }, // resend same greeting next day
    ]);
    expect(r.ok).toBe(true);
  });
});

describe('validateRuntimeRules', () => {
  it('accepts empty / undefined', () => {
    expect(validateRuntimeRules(undefined).ok).toBe(true);
    expect(validateRuntimeRules(null).ok).toBe(true);
    expect(validateRuntimeRules({}).ok).toBe(true);
  });

  it('accepts a valid full rules object', () => {
    const r = validateRuntimeRules({
      allowedHourRange: [6, 22],
      randomDelayPerSend: { min: 15, max: 45 },
      perNickThrottle: true,
      crossNickRecencyDays: 30,
      stopOnAccept: true,
    });
    expect(r.ok).toBe(true);
  });

  it('rejects allowedHourRange not length 2', () => {
    expect(validateRuntimeRules({ allowedHourRange: [6] }).ok).toBe(false);
    expect(validateRuntimeRules({ allowedHourRange: [6, 8, 10] }).ok).toBe(false);
  });

  it('rejects allowedHourRange with start > end', () => {
    expect(validateRuntimeRules({ allowedHourRange: [22, 6] }).ok).toBe(false);
  });

  it('rejects out-of-range hour values', () => {
    expect(validateRuntimeRules({ allowedHourRange: [-1, 22] }).ok).toBe(false);
    expect(validateRuntimeRules({ allowedHourRange: [6, 24] }).ok).toBe(false);
  });

  it('rejects randomDelayPerSend with min > max', () => {
    const r = validateRuntimeRules({ randomDelayPerSend: { min: 60, max: 15 } });
    expect(r.ok).toBe(false);
  });

  it('rejects negative delay min', () => {
    const r = validateRuntimeRules({ randomDelayPerSend: { min: -1, max: 10 } });
    expect(r.ok).toBe(false);
  });

  it('rejects non-boolean perNickThrottle', () => {
    const r = validateRuntimeRules({ perNickThrottle: 'yes' });
    expect(r.ok).toBe(false);
  });

  it('rejects negative crossNickRecencyDays', () => {
    const r = validateRuntimeRules({ crossNickRecencyDays: -5 });
    expect(r.ok).toBe(false);
  });
});

describe('DEFAULT_RUNTIME_RULES', () => {
  it('matches the memory-locked rules (6-22 hour, 15-45 min delay, throttle on, 30 day recency)', () => {
    expect(DEFAULT_RUNTIME_RULES.allowedHourRange).toEqual([6, 22]);
    expect(DEFAULT_RUNTIME_RULES.randomDelayPerSend).toEqual({ min: 15, max: 45 });
    expect(DEFAULT_RUNTIME_RULES.perNickThrottle).toBe(true);
    expect(DEFAULT_RUNTIME_RULES.crossNickRecencyDays).toBe(30);
    expect(DEFAULT_RUNTIME_RULES.stopOnAccept).toBe(true);
  });
});
