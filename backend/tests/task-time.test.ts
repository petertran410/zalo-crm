// Unit test (thuần) — Công việc V1 (2026-07-07): mốc 00:00 hôm nay theo múi giờ ORG.
// Rủi ro chính: server UTC nhưng "hôm nay/quá hạn" phải theo wall-clock org (+07:00 VN).
import { describe, it, expect } from 'vitest';
import { parseOffsetMinutes, startOfTodayOrgUtc } from '../src/modules/tasks/task-time.js';

describe('parseOffsetMinutes — chuỗi tz offset → phút', () => {
  it('+07:00 → 420, -05:00 → -300, +05:30 → 330', () => {
    expect(parseOffsetMinutes('+07:00')).toBe(420);
    expect(parseOffsetMinutes('-05:00')).toBe(-300);
    expect(parseOffsetMinutes('+05:30')).toBe(330);
  });
  it('sai định dạng / rỗng → mặc định 420 (+07:00 VN)', () => {
    expect(parseOffsetMinutes('')).toBe(420);
    expect(parseOffsetMinutes('Asia/Ho_Chi_Minh')).toBe(420);
    expect(parseOffsetMinutes('+7:00')).toBe(420);
  });
});

describe('startOfTodayOrgUtc — 00:00 hôm nay theo org tz, trả UTC instant', () => {
  // 2026-07-06 20:00 UTC = 2026-07-07 03:00 VN (+07:00) → "hôm nay" VN là 7/7,
  // mốc 00:00 VN 7/7 = 2026-07-06 17:00 UTC.
  const nowMs = Date.UTC(2026, 6, 6, 20, 0, 0);

  it('+07:00: qua nửa đêm VN nhưng chưa qua nửa đêm UTC', () => {
    expect(startOfTodayOrgUtc('+07:00', nowMs).toISOString()).toBe('2026-07-06T17:00:00.000Z');
  });
  it('-05:00: 20:00 UTC = 15:00 local 6/7 → mốc 00:00 local 6/7 = 05:00 UTC', () => {
    expect(startOfTodayOrgUtc('-05:00', nowMs).toISOString()).toBe('2026-07-06T05:00:00.000Z');
  });
  it('tz sai định dạng → fallback +07:00', () => {
    expect(startOfTodayOrgUtc('bogus', nowMs).toISOString()).toBe('2026-07-06T17:00:00.000Z');
  });
  it('đúng nửa đêm org: 17:00 UTC = 00:00 VN 7/7 → mốc chính nó', () => {
    const midnightVn = Date.UTC(2026, 6, 6, 17, 0, 0);
    expect(startOfTodayOrgUtc('+07:00', midnightVn).toISOString()).toBe('2026-07-06T17:00:00.000Z');
  });
});
