// Unit test (thuần) — Nhắc hoàn thành lịch hẹn 3 lần + digest trưởng phòng (2026-06-18).
// Phủ logic rủi ro nhất: mốc due cộng dồn, parse offsets, resolve trưởng phòng (D3).
// E2E (3 lần nhắc / reschedule / digest gửi) → QA trên app thật (cần cron + DB).
import { describe, it, expect } from 'vitest';
import { parseOffsetsHours, reminderDueMs } from '../src/modules/contacts/appointment-reminder.js';
import { makeManagerResolver } from '../src/modules/contacts/appointment-digest.js';

const H = 3600_000;

describe('reminderDueMs — mốc nhắc lần (n+1) = giờ hẹn + tổng offsets cộng dồn', () => {
  it('offsets [1,3,6]: lần 1 ở +1h, lần 2 ở +4h, lần 3 ở +10h', () => {
    expect(reminderDueMs(0, [1, 3, 6], 0)).toBe(1 * H);
    expect(reminderDueMs(0, [1, 3, 6], 1)).toBe(4 * H);
    expect(reminderDueMs(0, [1, 3, 6], 2)).toBe(10 * H);
  });
  it('đã gửi hết số lần → null', () => {
    expect(reminderDueMs(0, [1, 3, 6], 3)).toBeNull();
    expect(reminderDueMs(0, [2], 1)).toBeNull();
  });
  it('cộng dồn theo startMs thật (không phải từ 0)', () => {
    const start = 1_000_000_000_000;
    expect(reminderDueMs(start, [2, 2, 2], 1)).toBe(start + 4 * H);
  });
});

describe('parseOffsetsHours — JSON org → mảng giờ, sai/rỗng → mặc định [1,3,6]', () => {
  it('mảng hợp lệ giữ nguyên', () => {
    expect(parseOffsetsHours([1, 3, 6])).toEqual([1, 3, 6]);
    expect(parseOffsetsHours([2, 4, 8])).toEqual([2, 4, 8]);
  });
  it('chuỗi số → coerce sang number', () => {
    expect(parseOffsetsHours(['1', '3', '6'])).toEqual([1, 3, 6]);
  });
  it('lọc giá trị không dương + cắt tối đa 3', () => {
    expect(parseOffsetsHours([0, -1, 2])).toEqual([2]);
    expect(parseOffsetsHours([1, 2, 3, 4, 5])).toEqual([1, 2, 3]);
  });
  it('không phải mảng / rỗng / null → mặc định', () => {
    expect(parseOffsetsHours([])).toEqual([1, 3, 6]);
    expect(parseOffsetsHours('x')).toEqual([1, 3, 6]);
    expect(parseOffsetsHours(null)).toEqual([1, 3, 6]);
    expect(parseOffsetsHours(undefined)).toEqual([1, 3, 6]);
  });
});

describe('makeManagerResolver — D3 resolve trưởng phòng (khớp getManagerOfUser)', () => {
  // root(r) ← child(c). leaderR=leader r; leaderC=leader c; saleA=member c; deputyC=deputy c.
  const depts = [
    { id: 'r', parentId: null },
    { id: 'c', parentId: 'r' },
    { id: 'd', parentId: 'r' }, // dept không có leader
  ];
  const members = [
    { userId: 'leaderR', departmentId: 'r', deptRole: 'leader' },
    { userId: 'leaderC', departmentId: 'c', deptRole: 'leader' },
    { userId: 'saleA', departmentId: 'c', deptRole: 'member' },
    { userId: 'deputyC', departmentId: 'c', deptRole: 'deputy' },
    { userId: 'saleX', departmentId: 'd', deptRole: 'member' }, // dept d không leader
  ];
  const resolve = makeManagerResolver(depts, members);

  it('member/deputy → leader của chính dept', () => {
    expect(resolve('saleA')).toBe('leaderC');
    expect(resolve('deputyC')).toBe('leaderC');
  });
  it('leader → leader của dept CHA', () => {
    expect(resolve('leaderC')).toBe('leaderR');
  });
  it('leader gốc (không cha) → null', () => {
    expect(resolve('leaderR')).toBeNull();
  });
  it('dept không leader → leo lên cha', () => {
    expect(resolve('saleX')).toBe('leaderR');
  });
  it('user không thuộc phòng nào → null', () => {
    expect(resolve('nguoiLa')).toBeNull();
  });
});
