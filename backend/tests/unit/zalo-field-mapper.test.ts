// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * zalo-field-mapper.test.ts — Unit test map field Zalo Form (E3).
 * Phủ: applyFieldMap (theo questionId), suggestFieldMap (heuristic title).
 */
import { describe, it, expect } from 'vitest';
import { applyFieldMap, suggestFieldMap } from '../../src/_ee/zalo-ads/lead-field-mapper.js';

describe('applyFieldMap', () => {
  const answers = [
    { questionId: '111', responses: ['Trần Thu Giang'] },
    { questionId: '222', responses: ['0908123456'] },
    { questionId: '333', responses: ['giang@example.com'] },
    { questionId: '444', responses: ['2 phòng ngủ'] },
    { questionId: '555', responses: ['bỏ'] },
  ];
  const fieldMap = { '111': 'name', '222': 'phone', '333': 'email', '555': 'skip' };
  const titles = { '111': 'Họ và tên', '222': 'SĐT', '444': 'Quan tâm căn nào?' };

  it('map name/phone/email lên top-level theo questionId', () => {
    const r = applyFieldMap(answers, fieldMap, titles);
    expect(r.name).toBe('Trần Thu Giang');
    expect(r.phone).toBe('0908123456');
    expect(r.email).toBe('giang@example.com');
  });

  it('câu hỏi chưa map → customFields theo title', () => {
    const r = applyFieldMap(answers, fieldMap, titles);
    expect(r.customFields['Quan tâm căn nào?']).toBe('2 phòng ngủ');
  });

  it("target 'skip' bị bỏ qua, không vào customFields", () => {
    const r = applyFieldMap(answers, fieldMap, titles);
    expect(Object.values(r.customFields)).not.toContain('bỏ');
  });

  it('customFields fallback dùng questionId khi không có title', () => {
    const r = applyFieldMap([{ questionId: '999', responses: ['x'] }], {}, {});
    expect(r.customFields['999']).toBe('x');
  });

  it('lấy responses[0] và bỏ qua giá trị rỗng', () => {
    const r = applyFieldMap(
      [{ questionId: '111', responses: ['', 'second'] }],
      { '111': 'name' },
      {},
    );
    expect(r.name).toBeUndefined();
  });
});

describe('suggestFieldMap (heuristic)', () => {
  it('nhận diện họ tên / SĐT / email tiếng Việt', () => {
    const { fieldMap, questionTitles } = suggestFieldMap([
      { questionId: 1, title: 'Họ và tên' },
      { questionId: 2, title: 'Số điện thoại' },
      { questionId: 3, title: 'Email' },
      { questionId: 4, title: 'Bạn quan tâm gì?' },
    ]);
    expect(fieldMap['1']).toBe('name');
    expect(fieldMap['2']).toBe('phone');
    expect(fieldMap['3']).toBe('email');
    expect(fieldMap['4']).toBeUndefined(); // để admin tự gán
    expect(questionTitles['4']).toBe('Bạn quan tâm gì?');
  });
});
