// Unit test cho slug tên thư mục/tệp trên đĩa (hàm thuần, không DB).
// Quy ước anh chốt 2026-07-22: bỏ dấu, khoảng trắng → gạch dưới ("việt nam" → "viet_nam").
import { describe, it, expect } from 'vitest';
import { slugifyFolderName, safeFolderSlug, slugifyFileName } from '../src/shared/folder-slug.js';

describe('slugifyFolderName', () => {
  it('ví dụ anh đưa: "việt nam" → "viet_nam"', () => {
    expect(slugifyFolderName('việt nam')).toBe('viet_nam');
  });

  it('bỏ dấu tiếng Việt đầy đủ, kể cả đ và nguyên âm có mũ/móc', () => {
    expect(slugifyFolderName('Đường Hoàng Diệu')).toBe('duong_hoang_dieu');
    expect(slugifyFolderName('Tủ Lạnh Ưu Đãi')).toBe('tu_lanh_uu_dai');
  });

  it('gộp khoảng trắng thừa, cắt gạch dưới đầu/cuối', () => {
    expect(slugifyFolderName('  Bảng Giá   2026  ')).toBe('bang_gia_2026');
  });

  it('ký tự đặc biệt và dấu gạch chéo đều thành gạch dưới', () => {
    expect(slugifyFolderName('Hồ sơ/KH (VIP)')).toBe('ho_so_kh_vip');
  });

  it('emoji bị loại, không để lại gạch dưới thừa', () => {
    expect(slugifyFolderName('📁 Tài liệu')).toBe('tai_lieu');
  });

  it('tên rỗng / toàn ký tự bỏ đi → chuỗi rỗng (caller phải fallback)', () => {
    expect(slugifyFolderName('')).toBe('');
    expect(slugifyFolderName('🎉')).toBe('');
    expect(slugifyFolderName('———')).toBe('');
  });

  it('né tên cấm của Windows bằng hậu tố gạch dưới', () => {
    expect(slugifyFolderName('con')).toBe('con_');
    expect(slugifyFolderName('COM1')).toBe('com1_');
  });

  it('cắt tên quá dài, không để lại gạch dưới ở cuối', () => {
    const slug = slugifyFolderName('a'.repeat(200));
    expect(slug.length).toBe(120);
    expect(slug.endsWith('_')).toBe(false);
  });

  it('chỉ sinh ký tự an toàn cho đường dẫn', () => {
    expect(slugifyFolderName('Khách VIP – Q4/2026 #1')).toMatch(/^[a-z0-9_]+$/);
  });
});

describe('safeFolderSlug', () => {
  it('tên slug được thì dùng luôn', () => {
    expect(safeFolderSlug('Việt Nam', 'abc-123')).toBe('viet_nam');
  });

  it('tên slug ra rỗng → fallback kèm id rút gọn (vẫn mkdir được)', () => {
    const slug = safeFolderSlug('🎉', 'ab12cd34-ffff-0000-1111-222233334444');
    expect(slug).toMatch(/^thu_muc_[a-z0-9]{1,8}$/);
  });

  it('2 thư mục tên-rỗng khác id → slug khác nhau (không đụng thư mục nhau)', () => {
    const a = safeFolderSlug('🎉', 'aaaaaaaa-1111');
    const b = safeFolderSlug('🎉', 'bbbbbbbb-2222');
    expect(a).not.toBe(b);
  });
});

describe('slugifyFileName', () => {
  it('giữ nguyên đuôi, slug phần thân', () => {
    expect(slugifyFileName('Báo giá Q4.pdf')).toBe('bao_gia_q4.pdf');
  });

  it('đuôi viết hoa → thường', () => {
    expect(slugifyFileName('Ảnh Mặt Bằng.JPG')).toBe('anh_mat_bang.jpg');
  });

  it('không có đuôi → chỉ slug phần thân', () => {
    expect(slugifyFileName('Tài liệu nội bộ')).toBe('tai_lieu_noi_bo');
  });

  it('thân rỗng → "tep" nhưng vẫn giữ đuôi', () => {
    expect(slugifyFileName('🎉.png')).toBe('tep.png');
  });

  it('bỏ dấu gạch chéo (chống thoát thư mục)', () => {
    expect(slugifyFileName('../../etc/passwd')).not.toContain('/');
    expect(slugifyFileName('../../etc/passwd')).toMatch(/^[a-z0-9_.]+$/);
  });
});
