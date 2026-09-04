// Unit tests for pure POS customer mapping helpers.
import { describe, it, expect } from 'vitest';
import { extractCustomer, isPosCustomerActive } from '../src/modules/integrations/hisweetie-customer-mapper.js';

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

// Anh chốt: chỉ đồng bộ KH CÒN HOẠT ĐỘNG. Bộ lọc chính là không gửi
// `includeInactive` khi gọi POS; hàm này là lớp phòng thủ phía CRM cho record
// inactive lọt qua đường khác (webhook, caller cũ).
describe('isPosCustomerActive — chỉ nhận khách còn hoạt động', () => {
  it('isActive=false → loại', () => {
    expect(isPosCustomerActive({ id: 1, isActive: false })).toBe(false);
  });

  it('isActive=true → giữ', () => {
    expect(isPosCustomerActive({ id: 1, isActive: true })).toBe(true);
  });

  // Payload POS không phải lúc nào cũng kèm isActive. Mặc định "loại" ở đây sẽ
  // chặn sạch dữ liệu — đúng kiểu lỗi im lặng khó truy nhất.
  it('thiếu field / null / undefined → coi là còn hoạt động, KHÔNG chặn nhầm', () => {
    expect(isPosCustomerActive({ id: 1 })).toBe(true);
    expect(isPosCustomerActive({ id: 1, isActive: null })).toBe(true);
    expect(isPosCustomerActive({ id: 1, isActive: undefined })).toBe(true);
  });

  // POS trả JSON thật thì isActive là boolean; chuỗi "false" (nếu có) KHÔNG được
  // suy diễn thành false — chỉ loại khi tường minh boolean false.
  it('chuỗi "false" không bị suy diễn thành ngừng hoạt động', () => {
    expect(isPosCustomerActive({ id: 1, isActive: 'false' })).toBe(true);
  });
});
