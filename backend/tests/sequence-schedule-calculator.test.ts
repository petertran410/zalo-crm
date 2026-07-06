// Unit test — schedule-calculator (Luật 1 giờ + Luật 2 giãn cách). PURE, không DB.
// Sequence recode Đợt 1 (eng-review TEST#1=A).

import { describe, it, expect } from 'vitest';
import {
  sendGapToMs,
  stepDelayMs,
  nextAllowedTime,
  addBusinessTime,
  etaCompleteAt,
  resolveWindowMinutes,
} from '../src/_ee/automation/engine/schedule-calculator.js';
import type { SequenceStep } from '../src/_ee/automation/sequences/types.js';

describe('sendGapToMs — luật 2 quy đơn vị ra ms', () => {
  it('giây → ms', () => expect(sendGapToMs({ value: 30, unit: 'second' })).toBe(30_000));
  it('phút → ms', () => expect(sendGapToMs({ value: 2, unit: 'minute' })).toBe(120_000));
  it('giờ → ms', () => expect(sendGapToMs({ value: 1, unit: 'hour' })).toBe(3_600_000));
  it('ngày → ms', () => expect(sendGapToMs({ value: 1, unit: 'day' })).toBe(86_400_000));
  it('value 0 hoặc undefined → 0', () => {
    expect(sendGapToMs({ value: 0, unit: 'day' })).toBe(0);
    expect(sendGapToMs(undefined)).toBe(0);
  });
});

describe('sendGapToMs — RANDOM [min,max] (anh chốt 2026-06-15)', () => {
  it('rand=0 → min', () => expect(sendGapToMs({ min: 15, max: 30, unit: 'minute' }, () => 0)).toBe(15 * 60_000));
  it('rand=1 (cận trên) → ~max', () => {
    // rand()=1 hiếm (Math.random < 1) nhưng test biên: 15 + 1*(30-15) = 30 phút.
    expect(sendGapToMs({ min: 15, max: 30, unit: 'minute' }, () => 1)).toBe(30 * 60_000);
  });
  it('rand=0.5 → điểm giữa (22.5 phút)', () => {
    expect(sendGapToMs({ min: 15, max: 30, unit: 'minute' }, () => 0.5)).toBe(Math.round(22.5 * 60_000));
  });
  it('min=max → cố định (không random)', () => {
    expect(sendGapToMs({ min: 5, max: 5, unit: 'minute' }, () => 0.7)).toBe(5 * 60_000);
  });
  it('giá trị nằm TRONG [min,max] với rand bất kỳ', () => {
    const ms = sendGapToMs({ min: 15, max: 30, unit: 'minute' }, () => 0.33);
    expect(ms).toBeGreaterThanOrEqual(15 * 60_000);
    expect(ms).toBeLessThanOrEqual(30 * 60_000);
  });
});

describe('stepDelayMs — delayMinutes CỐ ĐỊNH ± jitter (2026-06-19, gộp Luật 2 vào step)', () => {
  it('không jitter → đúng delayMinutes', () => {
    expect(stepDelayMs(5)).toBe(300_000);
    expect(stepDelayMs(1, 0)).toBe(60_000);
    expect(stepDelayMs(0)).toBe(0);
  });
  it('jitter ± random quanh delay (rand inject)', () => {
    // rand=0.5 → delta 0 → đúng delay (điểm giữa, dùng cho preview/ETA).
    expect(stepDelayMs(10, 5, () => 0.5)).toBe(600_000);
    // rand=1 → +jitter: 10 + 5 = 15 phút.
    expect(stepDelayMs(10, 5, () => 1)).toBe(900_000);
    // rand=0 → -jitter: 10 - 5 = 5 phút.
    expect(stepDelayMs(10, 5, () => 0)).toBe(300_000);
  });
  it('jitter kéo âm → clamp 0 (không gửi trước thời điểm)', () => {
    expect(stepDelayMs(2, 5, () => 0)).toBe(0); // 2 - 5 < 0 → 0
  });
});

describe('resolveWindowMinutes — nguồn sự thật khung giờ (phút, nửa-mở)', () => {
  it('không rules → null', () => expect(resolveWindowMinutes(undefined)).toBeNull());
  it('allowedHourRange [6,22] → [360,1320)', () =>
    expect(resolveWindowMinutes({ allowedHourRange: [6, 22] })).toEqual({ startMin: 360, endMin: 1320 }));
  it('allowedTimeRange "HH:mm" tới phút', () =>
    expect(resolveWindowMinutes({ allowedTimeRange: ['06:30', '22:30'] })).toEqual({ startMin: 390, endMin: 1350 }));
  it('allowedTimeRange ƯU TIÊN hơn allowedHourRange', () =>
    expect(resolveWindowMinutes({ allowedHourRange: [6, 22], allowedTimeRange: ['08:00', '20:15'] }))
      .toEqual({ startMin: 480, endMin: 1215 }));
  it('end "24:00" = hết ngày (1440)', () =>
    expect(resolveWindowMinutes({ allowedTimeRange: ['06:00', '24:00'] })).toEqual({ startMin: 360, endMin: 1440 }));
  it('timeRange sai/đảo → fallback allowedHourRange', () =>
    expect(resolveWindowMinutes({ allowedHourRange: [6, 22], allowedTimeRange: ['22:00', '06:00'] }))
      .toEqual({ startMin: 360, endMin: 1320 }));
});

describe('nextAllowedTime — luật 1 né ngoài giờ (VN UTC+7), nửa-mở [start,end) tới phút', () => {
  it('không rules → giữ nguyên', () => {
    const at = new Date('2026-06-13T10:00:00Z');
    expect(nextAllowedTime(at, undefined).getTime()).toBe(at.getTime());
    expect(nextAllowedTime(at, {}).getTime()).toBe(at.getTime());
  });
  it('trong khung [6,22] VN → giữ nguyên', () => {
    const at = new Date('2026-06-13T03:00:00Z'); // 10:00 VN
    expect(nextAllowedTime(at, { allowedHourRange: [6, 22] }).getTime()).toBe(at.getTime());
  });
  it('ngoài khung (đêm 01:00 VN) → dời tới 06:00 VN, canh đúng phút', () => {
    const at = new Date('2026-06-13T18:00:00Z'); // 01:00 VN ngày 14
    const r = nextAllowedTime(at, { allowedHourRange: [6, 22] });
    expect(r.getTime()).toBeGreaterThan(at.getTime());
    expect((r.getUTCHours() + 7) % 24).toBe(6);
    expect(r.getUTCMinutes()).toBe(0);
  });

  // ── BIÊN END (anh hỏi 2026-06-16): end EXCLUSIVE — 22:00 = DỪNG, KHÔNG phải 22:59 ──
  it('21:59 VN trong [6,22] → giữ (vẫn gửi)', () => {
    const at = new Date('2026-06-13T14:59:00Z'); // 21:59 VN
    expect(nextAllowedTime(at, { allowedHourRange: [6, 22] }).getTime()).toBe(at.getTime());
  });
  it('22:00:00 VN với [6,22] → NGOÀI khung (dời 06:00 mai) — không chạy tới 22:59', () => {
    const at = new Date('2026-06-13T15:00:00Z'); // 22:00:00 VN
    const r = nextAllowedTime(at, { allowedHourRange: [6, 22] });
    expect(r.getTime()).toBeGreaterThan(at.getTime());
    expect((r.getUTCHours() + 7) % 24).toBe(6);
  });

  // ── allowedTimeRange tới PHÚT ──
  it('timeRange ["06:00","22:30"]: 22:15 VN → giữ', () => {
    const at = new Date('2026-06-13T15:15:00Z'); // 22:15 VN
    expect(nextAllowedTime(at, { allowedTimeRange: ['06:00', '22:30'] }).getTime()).toBe(at.getTime());
  });
  it('timeRange ["06:00","22:30"]: 22:30 VN → NGOÀI (nửa-mở)', () => {
    const at = new Date('2026-06-13T15:30:00Z'); // 22:30:00 VN
    const r = nextAllowedTime(at, { allowedTimeRange: ['06:00', '22:30'] });
    expect(r.getTime()).toBeGreaterThan(at.getTime());
    expect((r.getUTCHours() + 7) % 24).toBe(6);
  });
  it('end "24:00" → chạy hết ngày (23:30 VN vẫn giữ)', () => {
    const at = new Date('2026-06-13T16:30:00Z'); // 23:30 VN
    expect(nextAllowedTime(at, { allowedTimeRange: ['06:00', '24:00'] }).getTime()).toBe(at.getTime());
  });
});

describe('addBusinessTime — business-time CARRY qua đêm (2026-06-22, hết herd 08:00)', () => {
  const W = { allowedTimeRange: ['08:00', '22:00'] as [string, string] };
  it('delay=0 → SNAP (= nextAllowedTime): ngoài khung dời đầu khung kế', () => {
    const at = new Date('2026-06-13T18:00:00Z'); // 01:00 VN ngày 14, ngoài [8,22)
    const r = addBusinessTime(at, 0, W);
    expect((r.getUTCHours() + 7) % 24).toBe(8);
    expect(r.getUTCMinutes()).toBe(0);
  });
  it('21:00 VN + 6h → 13:00 MAI (1h tới 22:00 + nghỉ + 5h từ 08:00) — KHÔNG dồn 08:00', () => {
    const at = new Date('2026-06-13T14:00:00Z'); // 21:00 VN
    const r = addBusinessTime(at, 6 * 3_600_000, W);
    expect((r.getUTCHours() + 7) % 24).toBe(13);
    expect(r.getUTCMinutes()).toBe(0);
    expect(r.getTime()).toBeGreaterThan(at.getTime() + 6 * 3_600_000); // qua đêm
  });
  it('01:00 VN + 30m → 08:30 (snap đầu khung rồi tiêu 30m bên trong)', () => {
    const at = new Date('2026-06-13T18:00:00Z'); // 01:00 VN ngày 14
    const r = addBusinessTime(at, 30 * 60_000, W);
    expect((r.getUTCHours() + 7) % 24).toBe(8);
    expect(r.getUTCMinutes()).toBe(30);
  });
  it('trong khung, delay ngắn không chạm biên → cộng thẳng', () => {
    const at = new Date('2026-06-13T03:00:00Z'); // 10:00 VN
    const r = addBusinessTime(at, 60 * 60_000, W);
    expect(r.getTime()).toBe(at.getTime() + 60 * 60_000); // 11:00 VN
  });
  it('hai bước cùng delay nhưng giờ KHÁC → rơi giờ khác (rải đều, hết herd)', () => {
    const r1 = addBusinessTime(new Date('2026-06-13T14:00:00Z'), 6 * 3_600_000, W); // 21:00→13:00
    const r2 = addBusinessTime(new Date('2026-06-13T14:30:00Z'), 6 * 3_600_000, W); // 21:30→13:30
    expect((r2.getTime() - r1.getTime()) / 60_000).toBe(30);
  });
  it('không khung → cộng thẳng wall-clock (fallback)', () => {
    const at = new Date('2026-06-13T18:00:00Z');
    expect(addBusinessTime(at, 3_600_000, undefined).getTime()).toBe(at.getTime() + 3_600_000);
    expect(addBusinessTime(at, 3_600_000, {}).getTime()).toBe(at.getTime() + 3_600_000);
  });
});

describe('etaCompleteAt — cộng dồn delay bước còn lại', () => {
  const steps: SequenceStep[] = [
    { stepId: '1', blockId: 'b1', delayMinutes: 0 },
    { stepId: '2', blockId: 'b2', delayMinutes: 1 },
    { stepId: '3', blockId: 'b3', delayMinutes: 1 },
  ];
  it('đã ở bước cuối → null', () => {
    expect(etaCompleteAt(steps, 2, new Date('2026-06-13T03:00:00Z'), {})).toBeNull();
  });
  it('từ bước 0, sendGap 1 phút, 2 bước còn lại → +2 phút (trong giờ)', () => {
    const from = new Date('2026-06-13T03:00:00Z'); // 10:00 VN, trong khung
    const eta = etaCompleteAt(steps, 0, from, { sendGap: { value: 1, unit: 'minute' }, allowedHourRange: [6, 22] });
    expect(eta).not.toBeNull();
    expect(eta!.getTime()).toBe(from.getTime() + 2 * 60_000);
  });
});
