// Unit test (thuần) — payload ghi ngược CRM → POS (goal 2, 2026-07-16).
// Rủi ro chính đã xảy ra thật: bản đầu gửi `addresses` → POS crm_update_customer
// từ chối MỌI shape → mọi push của KH có địa chỉ đều fail. Test khoá lại: KHÔNG
// bao giờ có addresses trong payload, và ghi phone kèm contactNumber cho khớp.
import { describe, it, expect } from 'vitest';
import { buildPosCustomerPatch } from '../src/modules/integrations/hisweetie-customer-patch.js';

describe('buildPosCustomerPatch — payload POS chấp nhận được', () => {
  it('TUYỆT ĐỐI không bao giờ có field addresses (POS từ chối)', () => {
    const patch = buildPosCustomerPatch({
      crmName: 'Chị Lan', fullName: 'Lan Nguyen', phone: '84900000001', email: 'a@b.com',
    });
    expect(patch).not.toBeNull();
    expect(patch!).not.toHaveProperty('addresses');
    expect(Object.keys(patch!)).toEqual(expect.arrayContaining(['name', 'phone', 'contactNumber', 'email']));
  });

  it('phone → ghi CẢ phone lẫn contactNumber (giữ 2 field POS khớp)', () => {
    const patch = buildPosCustomerPatch({ crmName: null, fullName: null, phone: '84912345678', email: null });
    expect(patch).toEqual({ phone: '84912345678', contactNumber: '84912345678' });
  });

  it('ưu tiên crmName (tên sale đặt) hơn fullName (tên Zalo)', () => {
    const patch = buildPosCustomerPatch({ crmName: 'Tên Sale', fullName: 'Tên Zalo', phone: null, email: null });
    expect(patch).toEqual({ name: 'Tên Sale' });
  });

  it('không có crmName → fallback fullName', () => {
    const patch = buildPosCustomerPatch({ crmName: null, fullName: 'Tên Zalo', phone: null, email: null });
    expect(patch).toEqual({ name: 'Tên Zalo' });
  });

  it('mọi field trống/null → trả null (không gọi POS thừa)', () => {
    expect(buildPosCustomerPatch({ crmName: null, fullName: null, phone: null, email: null })).toBeNull();
    expect(buildPosCustomerPatch({ crmName: '  ', fullName: '', phone: '   ', email: '' })).toBeNull();
  });

  it('chỉ email → patch chỉ có email, không kèm rác', () => {
    expect(buildPosCustomerPatch({ crmName: null, fullName: null, phone: null, email: 'x@y.com' }))
      .toEqual({ email: 'x@y.com' });
  });

  it('trim khoảng trắng ở mọi field', () => {
    const patch = buildPosCustomerPatch({ crmName: '  Chị Lan  ', fullName: null, phone: ' 84900000001 ', email: ' a@b.com ' });
    expect(patch).toEqual({ name: 'Chị Lan', phone: '84900000001', contactNumber: '84900000001', email: 'a@b.com' });
  });
});
