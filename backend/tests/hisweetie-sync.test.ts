// Unit test (thuần) — Hisweetie POS sync (2026-07-15): lọc KH có tương tác + map field.
// Rủi ro chính: POS trả 50.446 KH nhưng chỉ ~6.125 có tương tác thật; lọc sai =
// bơm 44k record rác vào tab Khách Hàng. Số tiền POS trả dạng STRING ("127050")
// nên so sánh > 0 phải parse, không dựa vào truthiness.
import { describe, it, expect } from 'vitest';
import { isEngagedCustomer, extractCustomer } from '../src/modules/integrations/hisweetie-customer-mapper.js';

describe('isEngagedCustomer — tín hiệu tương tác thương mại', () => {
  it('KH chưa tương tác gì (mọi total = "0") → false', () => {
    expect(isEngagedCustomer({
      totalPurchased: '0', totalDebt: '0', rewardPoint: 0, totalPoint: '0',
    })).toBe(false);
  });

  it('có TIỀN trực tiếp (purchased hoặc debt) → engaged ngay, không cần gì thêm', () => {
    expect(isEngagedCustomer({ totalPurchased: '150000', totalDebt: '0', rewardPoint: 0, totalPoint: '0' })).toBe(true);
    expect(isEngagedCustomer({ totalPurchased: '0', totalDebt: '127050', rewardPoint: 0, totalPoint: '0' })).toBe(true);
  });

  // Anh chốt 2026-07-15: 294 KH "điểm suông" (revenue/invoiced/purchased/debt đều 0)
  // KHÔNG chứng minh được giao dịch thật → loại. Ca thật: id 2136 (8.370 điểm, ₫0).
  it('ĐIỂM SUÔNG (không dấu vết tài chính nào) → KHÔNG engaged', () => {
    expect(isEngagedCustomer({
      totalPurchased: '0', totalDebt: '0', totalRevenue: '0', totalInvoiced: '0',
      rewardPoint: 8370, totalPoint: '8',
    })).toBe(false);
    expect(isEngagedCustomer({
      totalPurchased: '0', totalDebt: '0', totalRevenue: '0', totalInvoiced: '0',
      rewardPoint: 0, totalPoint: '12',
    })).toBe(false);
  });

  // Ca thật id 42743: reward=4, point=2, revenue=6.020.500, purchased=0, debt=0.
  it('ĐIỂM + có revenue/invoiced → engaged (682 KH nhóm này)', () => {
    expect(isEngagedCustomer({
      totalPurchased: '0', totalDebt: '0', totalRevenue: '6020500', totalInvoiced: '0',
      rewardPoint: 4, totalPoint: '2',
    })).toBe(true);
    expect(isEngagedCustomer({
      totalPurchased: '0', totalDebt: '0', totalRevenue: '0', totalInvoiced: '217350',
      rewardPoint: 3, totalPoint: '3',
    })).toBe(true);
  });

  // Ca THẬT từ sandbox (id 69237): đã xuất hoá đơn nhưng CHƯA trả → totalPurchased=0,
  // tiền nằm ở totalDebt. Lọc bằng mình totalPurchased sẽ RỚT nhóm này (22.865 KH).
  it('KH đã xuất hoá đơn chưa trả (purchased=0, debt>0) → vẫn engaged', () => {
    expect(isEngagedCustomer({
      totalPurchased: '0', totalRevenue: '127050', totalInvoiced: '127050', totalDebt: '127050',
      rewardPoint: 0, totalPoint: '0',
    })).toBe(true);
  });

  // revenue/invoiced KHÔNG phải tín hiệu ĐỘC LẬP (26.5k KH — quá rộng); chúng chỉ
  // dùng để xác nhận nhóm CÓ ĐIỂM. Không điểm + không tiền → loại dù revenue lớn.
  it('chỉ có revenue/invoiced, không điểm không tiền → KHÔNG engaged', () => {
    expect(isEngagedCustomer({
      totalPurchased: '0', totalRevenue: '500000', totalInvoiced: '500000', totalDebt: '0',
      rewardPoint: 0, totalPoint: '0',
    })).toBe(false);
  });

  // isActive vô dụng: sandbox 100% record = true → không được dùng làm bộ lọc.
  it('isActive=true KHÔNG tự động thành engaged', () => {
    expect(isEngagedCustomer({
      isActive: true, totalPurchased: '0', totalDebt: '0', rewardPoint: 0, totalPoint: '0',
    })).toBe(false);
  });

  it('debt ÂM (POS trả tiền thừa/ghi có) vẫn tính là có tương tác', () => {
    expect(isEngagedCustomer({ totalPurchased: '0', totalDebt: '-50000', rewardPoint: 0, totalPoint: '0' })).toBe(true);
  });

  it('field thiếu / null / rác → coi như 0, không throw', () => {
    expect(isEngagedCustomer({})).toBe(false);
    expect(isEngagedCustomer({ totalPurchased: null, totalDebt: undefined, rewardPoint: 'abc' })).toBe(false);
  });
});

describe('extractCustomer — map payload POS → field CRM', () => {
  // Shape verify từ record sandbox thật (id 69248).
  const posRow = {
    id: 69248,
    code: 'KH050609',
    name: 'Trầm Minh Khang',
    contactNumber: '84795453491',
    phone: '84795453491',
    email: 'khoai50km@gmail.com',
    branchId: 1,
    addresses: [
      { id: 1, address: '123 Phụ', isDefault: false },
      { id: 2, address: '262/1/1D Phan Anh', isDefault: true },
    ],
  };

  it('lấy đúng id/code/name/phone/email từ payload thật', () => {
    const c = extractCustomer(posRow);
    expect(c.posCustomerId).toBe(69248);
    expect(c.posCustomerCode).toBe('KH050609');
    expect(c.name).toBe('Trầm Minh Khang');
    expect(c.phone).toBe('84795453491');
    expect(c.email).toBe('khoai50km@gmail.com');
  });

  it('ưu tiên address isDefault, không phải phần tử đầu', () => {
    expect(extractCustomer(posRow).address).toBe('262/1/1D Phan Anh');
  });

  it('không có isDefault → lấy address đầu tiên', () => {
    expect(extractCustomer({ ...posRow, addresses: [{ address: 'A' }, { address: 'B' }] }).address).toBe('A');
  });

  it('addresses rỗng/thiếu → address = null, không throw', () => {
    expect(extractCustomer({ ...posRow, addresses: [] }).address).toBeNull();
    expect(extractCustomer({ id: 1 }).address).toBeNull();
  });

  it('id dạng string số → parse về number (khoá match posCustomerId)', () => {
    expect(extractCustomer({ id: '69248' }).posCustomerId).toBe(69248);
  });

  it('không có id → null để caller skip (không tạo Contact mồ côi)', () => {
    expect(extractCustomer({ name: 'X' }).posCustomerId).toBeNull();
  });

  it('chuỗi rỗng/space → null chứ không phải "" (tránh ghi rác vào CRM)', () => {
    const c = extractCustomer({ id: 1, name: '  ', email: '', contactNumber: '   ' });
    expect(c.name).toBeNull();
    expect(c.email).toBeNull();
    expect(c.phone).toBeNull();
  });
});
