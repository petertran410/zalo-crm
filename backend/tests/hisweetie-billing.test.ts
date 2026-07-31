// Unit test (thuần) — dựng payload hoá đơn từ chat (goal 4, 2026-07-16).
// Rủi ro: đây là đường GHI sinh ra chứng từ tài chính bên POS → validate phải chặt,
// KHÔNG bao giờ dựng payload cho KH chưa link POS / dòng hàng vô lý.
import { describe, it, expect } from 'vitest';
import { buildOrderPayload, buildDispatchPayload } from '../src/modules/integrations/hisweetie-billing.js';

const line = (over = {}) => ({ productId: 10, quantity: 2, unitPrice: 50000, ...over });

describe('buildOrderPayload — validate + dựng OrderInput', () => {
  it('đơn hợp lệ → ok, payload đúng, tổng tiền đúng', () => {
    const r = buildOrderPayload({ posCustomerId: 65550, branchId: 1, items: [line(), line({ productId: 11, quantity: 1, unitPrice: 30000 })] });
    expect(r.ok).toBe(true);
    expect(r.totalAmount).toBe(2 * 50000 + 30000);
    expect(r.payload).toMatchObject({ customerId: 65550, branchId: 1 });
    expect(r.payload!.items).toHaveLength(2);
  });

  it('KH chưa link POS (posCustomerId null) → chặn, không dựng payload', () => {
    const r = buildOrderPayload({ posCustomerId: null, branchId: 1, items: [line()] });
    expect(r.ok).toBe(false);
    expect(r.payload).toBeNull();
    expect(r.errors.join(' ')).toContain('chưa liên kết POS');
  });

  it('thiếu chi nhánh → chặn', () => {
    const r = buildOrderPayload({ posCustomerId: 1, branchId: null, items: [line()] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('chi nhánh');
  });

  it('không có dòng hàng → chặn', () => {
    const r = buildOrderPayload({ posCustomerId: 1, branchId: 1, items: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('ít nhất 1 sản phẩm');
  });

  it('số lượng ≤ 0 / đơn giá âm / productId sai → chặn từng dòng', () => {
    expect(buildOrderPayload({ posCustomerId: 1, branchId: 1, items: [line({ quantity: 0 })] }).ok).toBe(false);
    expect(buildOrderPayload({ posCustomerId: 1, branchId: 1, items: [line({ unitPrice: -1 })] }).ok).toBe(false);
    expect(buildOrderPayload({ posCustomerId: 1, branchId: 1, items: [line({ productId: 0 })] }).ok).toBe(false);
  });

  it('giảm giá vượt thành tiền → chặn', () => {
    const r = buildOrderPayload({ posCustomerId: 1, branchId: 1, items: [line({ quantity: 1, unitPrice: 1000, discount: 2000 })] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('giảm giá vượt');
  });

  it('đã trả > tổng hoá đơn → chặn (không cho âm tiền)', () => {
    const r = buildOrderPayload({ posCustomerId: 1, branchId: 1, items: [line({ quantity: 1, unitPrice: 1000 })], paidAmount: 5000 });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('vượt quá tổng');
  });

  it('discount + note optional chỉ xuất hiện khi có', () => {
    const r = buildOrderPayload({ posCustomerId: 1, branchId: 1, items: [line({ discount: 5000, note: 'quà' })] });
    expect(r.payload!.items[0]).toEqual({ productId: 10, quantity: 2, unitPrice: 50000, discount: 5000, note: 'quà' });
    const r2 = buildOrderPayload({ posCustomerId: 1, branchId: 1, items: [line()] });
    expect(r2.payload!.items[0]).toEqual({ productId: 10, quantity: 2, unitPrice: 50000 });
  });

  it('tổng tiền TRỪ discount đúng', () => {
    const r = buildOrderPayload({ posCustomerId: 1, branchId: 1, items: [line({ quantity: 3, unitPrice: 10000, discount: 5000 })] });
    expect(r.totalAmount).toBe(3 * 10000 - 5000);
  });

  it('snapshot productName/unit được giữ, key rác bị whitelist loại (2026-07-18)', () => {
    const r = buildOrderPayload({
      posCustomerId: 1, branchId: 1,
      items: [line({ productName: 'Trà đào', unit: 'hộp', _junk: 'xxx', hack: 1 } as never)],
    });
    expect(r.payload!.items[0]).toMatchObject({ productName: 'Trà đào', unit: 'hộp' });
    expect(r.payload!.items[0]).not.toHaveProperty('_junk');
    expect(r.payload!.items[0]).not.toHaveProperty('hack');
  });
});

describe('buildDispatchPayload — payload gửi POS sandbox (2026-07-18)', () => {
  const base = {
    draftId: 'd-1', posCustomerId: 65550, posCustomerName: 'Chị Hoa', branchId: 2,
    items: [line({ productName: 'Trà đào', unit: 'hộp' })],
  };

  it('description mang [CRM draft id] + tên KH + POS id + mô tả người dùng', () => {
    const p = buildDispatchPayload({ ...base, description: 'Giao chiều' });
    expect(p.description).toContain('[CRM draft d-1]');
    expect(p.description).toContain('Chị Hoa');
    expect(p.description).toContain('65550');
    expect(p.description).toContain('Giao chiều');
  });

  it('không có tên KH → vẫn ghi KH POS #id', () => {
    const p = buildDispatchPayload({ ...base, posCustomerName: null });
    expect(p.description).toContain('KH POS #65550');
  });

  it('note dòng hàng = tên SP; có note người dùng thì nối "tên — note"', () => {
    const p1 = buildDispatchPayload(base);
    expect(p1.items[0].note).toBe('Trà đào');
    const p2 = buildDispatchPayload({ ...base, items: [line({ productName: 'Trà đào', note: 'ít đá' })] });
    expect(p2.items[0].note).toBe('Trà đào — ít đá');
  });

  it('items CHỈ chứa field POS chuẩn — không lộ productName/unit thành key riêng', () => {
    const p = buildDispatchPayload(base);
    expect(Object.keys(p.items[0]).sort()).toEqual(['note', 'productId', 'quantity', 'unitPrice']);
  });

  it('paidAmount chỉ xuất hiện khi != null', () => {
    expect(buildDispatchPayload(base)).not.toHaveProperty('paidAmount');
    expect(buildDispatchPayload({ ...base, paidAmount: 50000 }).paidAmount).toBe(50000);
  });
});
