/**
 * folder-slug.test.ts — quy ước đặt tên thư mục THẬT trên đĩa (Kho lưu trữ).
 *
 * Anh chốt: giữ nguyên chữ cái, BỎ DẤU, khoảng trắng → gạch dưới ("việt nam" → "viet_nam").
 * Đây là hàm THUẦN (không đụng DB/đĩa) nên test chạy độc lập được.
 */
import { describe, it, expect } from 'vitest';
import { slugifyFolderName, safeFolderSlug, slugifyFileName } from '../../src/shared/folder-slug.js';
import { joinFolderSlug } from '../../src/shared/storage/folder-mirror.js';

describe('slugifyFolderName — bỏ dấu + gạch dưới', () => {
  it('ví dụ anh chốt: "việt nam" → "viet_nam"', () => {
    expect(slugifyFolderName('việt nam')).toBe('viet_nam');
  });

  it('bỏ dấu đủ 6 nguyên âm tiếng Việt + đ', () => {
    expect(slugifyFolderName('Đường Ăn Ở Ức Ỹ')).toBe('duong_an_o_uc_y');
  });

  it('gộp nhiều khoảng trắng thành MỘT gạch dưới', () => {
    expect(slugifyFolderName('Bảng Giá  2026')).toBe('bang_gia_2026');
  });

  it('bỏ emoji và ký tự đường dẫn nguy hiểm', () => {
    expect(slugifyFolderName('📁 Hồ sơ/KH')).toBe('ho_so_kh');
    expect(slugifyFolderName('../../etc')).toBe('etc');
  });

  it('không để lại gạch dưới thừa ở hai đầu', () => {
    expect(slugifyFolderName('  --Hồ sơ--  ')).toBe('ho_so');
  });

  it('tên toàn dấu/emoji → rỗng, safeFolderSlug phải bù id', () => {
    expect(slugifyFolderName('🎉')).toBe('');
    expect(safeFolderSlug('🎉', 'abc123def456')).toBe('thu_muc_abc123de');
  });

  it('né tên cấm của Windows', () => {
    expect(slugifyFolderName('CON')).toBe('con_');
    expect(slugifyFolderName('lpt1')).toBe('lpt1_');
  });

  it('cắt tên quá dài, không kết thúc bằng gạch dưới', () => {
    const slug = slugifyFolderName('a'.repeat(200));
    expect(slug.length).toBeLessThanOrEqual(120);
    expect(slug.endsWith('_')).toBe(false);
  });
});

describe('slugifyFileName — giữ phần đuôi', () => {
  it('"Báo giá Q4.pdf" → "bao_gia_q4.pdf"', () => {
    expect(slugifyFileName('Báo giá Q4.pdf')).toBe('bao_gia_q4.pdf');
  });

  it('đuôi viết hoa → viết thường', () => {
    expect(slugifyFileName('ẢNH.JPG')).toBe('anh.jpg');
  });

  it('không có đuôi vẫn chạy', () => {
    expect(slugifyFileName('Hồ sơ')).toBe('ho_so');
  });

  it('thân rỗng → fallback "tep", KHÔNG mất đuôi', () => {
    expect(slugifyFileName('🎉.pdf')).toBe('tep.pdf');
  });
});

describe('joinFolderSlug — cây thư mục lồng nhau', () => {
  it('không có cha → chính nó là gốc', () => {
    expect(joinFolderSlug(null, 'viet_nam')).toBe('viet_nam');
    expect(joinFolderSlug('', 'viet_nam')).toBe('viet_nam');
  });

  it('nối cha + con bằng dấu /', () => {
    expect(joinFolderSlug('viet_nam', 'bao_gia')).toBe('viet_nam/bao_gia');
    expect(joinFolderSlug('viet_nam/bao_gia', '2026')).toBe('viet_nam/bao_gia/2026');
  });
});
