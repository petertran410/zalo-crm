// Unit test (thuần) — buildAlias dựng tên gợi nhớ Zalo (2026-06-19).
// Phủ: ghép đủ biến, biến rỗng gộp space, cắt khi quá dài, rỗng → ''.
// E2E (trigger chạy → alias hiện trên Zalo) → QA self-verify trên app thật.
import { describe, it, expect } from 'vitest';
import { buildAlias, DEFAULT_ALIAS_MAX } from '../src/modules/automation/blocks/alias-template.js';

describe('buildAlias — ghép + gộp space + cắt', () => {
  it('mẫu đủ biến → giữ nguyên (đã render)', () => {
    expect(buildAlias('Thành VHG 20tr 0987654321')).toBe('Thành VHG 20tr 0987654321');
  });

  it('biến rỗng để lại khoảng trắng thừa → gộp 1 space, không có "  "', () => {
    // mẫu "{zalo_name} {trigger_project} {income} {phone}" với income rỗng
    expect(buildAlias('Thành VHG  0987654321')).toBe('Thành VHG 0987654321');
    expect(buildAlias('  Thành   VHG  ')).toBe('Thành VHG');
  });

  it('raw rỗng / chỉ khoảng trắng → "" (caller skip)', () => {
    expect(buildAlias('')).toBe('');
    expect(buildAlias('   ')).toBe('');
    expect(buildAlias(undefined as unknown as string)).toBe('');
  });

  it('quá maxLen → cắt, không vượt maxLen, không space cuối', () => {
    const long = 'Nguyễn Văn Một Người Có Tên Rất Dài VHG 50tr 0900000000111222';
    const out = buildAlias(long, 30);
    expect(out.length).toBeLessThanOrEqual(30);
    expect(out).toBe(out.trim());
    expect(out.endsWith(' ')).toBe(false);
  });

  it('cắt theo ranh giới từ khi không mất quá nhiều', () => {
    // maxLen 20: "Thành VHG 20tr 0987" (19) — cắt ở space trước số dài
    const out = buildAlias('Thành VHG 20tr 0987654321', 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.startsWith('Thành VHG 20tr')).toBe(true);
  });

  it('default maxLen áp khi không truyền', () => {
    const s = 'x'.repeat(DEFAULT_ALIAS_MAX + 10);
    expect(buildAlias(s).length).toBeLessThanOrEqual(DEFAULT_ALIAS_MAX);
  });
});
