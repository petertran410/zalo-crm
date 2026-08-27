// Parser groups của POS — verify trên dữ liệu thật 2026-08-24:
// Public API trả groups là MỘT CHUỖI "A|B|C", trộn nhãn nhóm khách hàng và mã
// sale (username ascii thường). SDK MCP cũ trả mảng [{name}] — phải hỗ trợ cả hai.
import { describe, expect, it } from 'vitest';
import {
  looksLikePosSaleCode,
  parseCustomerGroups,
} from '../src/modules/integrations/hisweetie-customer-mapper.js';

describe('parseCustomerGroups', () => {
  it('tách chuỗi "Khách buôn|phuongnt" → nhóm + mã sale', () => {
    const r = parseCustomerGroups('Khách buôn|phuongnt');
    expect(r.segment).toBe('Khách buôn');
    expect(r.saleCode).toBe('phuongnt');
    expect(r.tags).toEqual(['Khách buôn', 'phuongnt']);
  });

  it('nhiều token: "Khách lẻ|phuongnt|Hiển Setup" giữ đủ tags, sale code đầu tiên', () => {
    const r = parseCustomerGroups('Khách lẻ|phuongnt|Hiển Setup');
    expect(r.segment).toBe('Khách lẻ');
    expect(r.saleCode).toBe('phuongnt');
    expect(r.labels).toEqual(['Khách lẻ', 'Hiển Setup']);
    expect(r.tags).toHaveLength(3);
  });

  // Hồi quy bug sync: code cũ đọc groups như mảng [{name}] → customer_type
  // rỗng 100% trên 2.983 khách thật.
  it('hỗ trợ định dạng mảng [{name}] của SDK MCP cũ', () => {
    const r = parseCustomerGroups([{ name: 'Khách buôn' }, { name: 'anhmtv' }]);
    expect(r.segment).toBe('Khách buôn');
    expect(r.saleCode).toBe('anhmtv');
  });

  it('ưu tiên nhãn giá trị cao khi một khách thuộc nhiều nhóm', () => {
    // Khách VIP Cty > Khách lẻ theo SEGMENT_PRIORITY.
    const r = parseCustomerGroups('Khách lẻ|thanhptp|Khách VIP Cty');
    expect(r.segment).toBe('Khách VIP Cty');
  });

  it('null/rỗng → không đoán bừa', () => {
    for (const raw of [null, undefined, '', '|']) {
      const r = parseCustomerGroups(raw);
      expect(r.segment).toBeNull();
      expect(r.saleCode).toBeNull();
    }
  });

  it('token username ascii thường là mã sale; nhãn tiếng Việt luôn là nhãn', () => {
    expect(looksLikePosSaleCode('phuongnt')).toBe(true);
    expect(looksLikePosSaleCode('tranglt')).toBe(true);
    expect(looksLikePosSaleCode('test')).toBe(true);
    // Nhãn thật luôn chứa hoa/khoảng trắng/dấu — không bao giờ trông giống username.
    expect(looksLikePosSaleCode('Khách buôn')).toBe(false);
    expect(looksLikePosSaleCode('Hiển Setup')).toBe(false);
    expect(looksLikePosSaleCode('Đại lý Lermao')).toBe(false);
  });

  it('nhãn lạ không có trong danh sách ưu tiên vẫn được nhận diện (danh sách mở)', () => {
    const r = parseCustomerGroups('Khách hàng chiến lược LerMao|tranglt');
    expect(r.segment).toBe('Khách hàng chiến lược LerMao');
    expect(r.saleCode).toBe('tranglt');
  });
});
