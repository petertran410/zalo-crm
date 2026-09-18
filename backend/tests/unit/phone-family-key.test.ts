/**
 * Unit tests cho phoneFamilyKey / stripPhoneSuffix — logic nhóm "nick khác".
 *
 * Lý do cần test riêng: convention hậu tố ".1" chỉ tồn tại trong DATA, và
 * normalizePhone() KHÔNG group được (nuốt dấu chấm thành digit). Nếu key này sai
 * thì dropdown "nick khác" hiện rỗng — bug im lặng, không ai thấy.
 */
import { describe, it, expect } from 'vitest';
import {
  phoneFamilyKey,
  stripPhoneSuffix,
  normalizePhone,
} from '../../src/shared/utils/phone.js';

describe('stripPhoneSuffix', () => {
  it('bỏ hậu tố .1 (convention thực tế trong DB)', () => {
    expect(stripPhoneSuffix('0335862112.1')).toBe('0335862112');
  });

  it('bỏ hậu tố .01 / .2 / .12 (dạng khác nếu sale dùng sau này)', () => {
    expect(stripPhoneSuffix('0335862112.01')).toBe('0335862112');
    expect(stripPhoneSuffix('0335862112.2')).toBe('0335862112');
    expect(stripPhoneSuffix('0335862112.12')).toBe('0335862112');
  });

  it('giữ nguyên SĐT không có hậu tố', () => {
    expect(stripPhoneSuffix('0335862112')).toBe('0335862112');
  });

  it('trim khoảng trắng quanh', () => {
    expect(stripPhoneSuffix('  0335862112.1  ')).toBe('0335862112');
  });

  it('null/undefined/rỗng → null', () => {
    expect(stripPhoneSuffix(null)).toBeNull();
    expect(stripPhoneSuffix(undefined)).toBeNull();
    expect(stripPhoneSuffix('')).toBeNull();
    expect(stripPhoneSuffix('   ')).toBeNull();
  });

  it('KHÔNG ăn số điện thoại có dấu chấm không phải hậu tố (vd ghi chú)', () => {
    // "0376449977 (Anh Hưng ).1" — base giữ nguyên phần ghi chú.
    expect(stripPhoneSuffix('0376449977 (Anh Hưng ).1')).toBe('0376449977 (Anh Hưng )');
  });

  // ── Hai dạng typo khác thấy trong DB (base đã verify là bản A1) ──
  it('bỏ hậu tố dấu phẩy ",1" (lỗi gõ thay cho ".1")', () => {
    expect(stripPhoneSuffix('0398881102,1')).toBe('0398881102');
  });

  it('rớt 1 số cuối thừa của mobile 11 số (mobile VN đúng = 10 số)', () => {
    expect(stripPhoneSuffix('03841187881')).toBe('0384118788');
    expect(stripPhoneSuffix('09622746061')).toBe('0962274606');
  });

  it('KHÔNG rớt số cuối của mobile 10 số hợp lệ', () => {
    expect(stripPhoneSuffix('0384118788')).toBe('0384118788');
  });

  it('KHÔNG đụng số legacy 11 số bắt đầu 01 (Viettel/Mobi/Vina cũ)', () => {
    // Legacy 01xx không khớp 0[35789] nên phải giữ nguyên 11 số.
    expect(stripPhoneSuffix('01681234567')).toBe('01681234567');
    expect(stripPhoneSuffix('01234567890')).toBe('01234567890');
  });

  it('KHÔNG đụng số bàn 11 số (02x = mã vùng, không phải mobile typo)', () => {
    expect(stripPhoneSuffix('02835350029')).toBe('02835350029');
  });
});

describe('phoneFamilyKey', () => {
  it('base và .1 ra CÙNG một key — case chính của tính năng', () => {
    expect(phoneFamilyKey('0335862112')).toBe(phoneFamilyKey('0335862112.1'));
    expect(phoneFamilyKey('0335862112')).toBe('84335862112');
  });

  it('chứng minh normalizePhone() KHÔNG làm được việc này (lý do tồn tại hàm)', () => {
    expect(normalizePhone('0335862112')).toBe('84335862112');
    expect(normalizePhone('0335862112.1')).toBe('843358621121');
    expect(normalizePhone('0335862112')).not.toBe(normalizePhone('0335862112.1'));
  });

  it('gom cả 3 format 0xxx / 84xxx / +84xxx kèm hậu tố', () => {
    const keys = [
      phoneFamilyKey('0335862112'),
      phoneFamilyKey('0335862112.1'),
      phoneFamilyKey('84335862112'),
      phoneFamilyKey('84335862112.1'),
      phoneFamilyKey('+84335862112'),
      phoneFamilyKey('+84335862112.1'),
    ];
    expect(new Set(keys).size).toBe(1);
  });

  it('SĐT KHÁC nhau ra key khác nhau (không gom nhầm)', () => {
    expect(phoneFamilyKey('0335862112')).not.toBe(phoneFamilyKey('0336267608'));
    expect(phoneFamilyKey('0335862112.1')).not.toBe(phoneFamilyKey('0336267608.1'));
  });

  it('số ngắn bất thường → null (không sinh key rác)', () => {
    expect(phoneFamilyKey('123')).toBeNull();
    expect(phoneFamilyKey('123.1')).toBeNull();
  });

  it('base có ghi chú trong ngoặc vẫn group với bản .1 của nó', () => {
    expect(phoneFamilyKey('0376449977 (Anh Hưng )')).toBe(
      phoneFamilyKey('0376449977 (Anh Hưng ).1'),
    );
    expect(phoneFamilyKey('0376449977 (Anh Hưng )')).toBe('84376449977');
  });

  // ── Hai dạng typo mới: base và biến thể phải group với nhau ──
  it('comma-suffix group với base', () => {
    expect(phoneFamilyKey('0398881102')).toBe(phoneFamilyKey('0398881102,1'));
    expect(phoneFamilyKey('0398881102')).toBe('84398881102');
  });

  it('mobile 11 số group với base 10 số của nó', () => {
    expect(phoneFamilyKey('0384118788')).toBe(phoneFamilyKey('03841187881'));
    expect(phoneFamilyKey('0384118788')).toBe('84384118788');
  });

  it('số legacy 01x và số bàn KHÔNG bị group nhầm vào mobile 10 số', () => {
    // 01681234567 (legacy) khác 0168123456 — không được rớt số cuối.
    expect(phoneFamilyKey('01681234567')).not.toBe(phoneFamilyKey('0168123456'));
    // số bàn 02x giữ nguyên 11 số.
    expect(phoneFamilyKey('02835350029')).not.toBe(phoneFamilyKey('0283535002'));
  });
});
