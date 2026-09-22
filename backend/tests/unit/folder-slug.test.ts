/** Quy ước đặt tên thư mục thật trên đĩa: bỏ dấu, khoảng trắng thành gạch dưới. */
import { describe, it, expect } from 'vitest';
import { slugifyFolderName, safeFolderSlug, slugifyFileName } from '../../src/shared/folder-slug.js';
import { joinFolderSlug } from '../../src/shared/storage/folder-mirror.js';
import { pickFreeFolderSlug, isSameFolderName } from '../../src/modules/media/media-folder-service.js';

describe('slugifyFolderName: bỏ dấu + gạch dưới', () => {
  it('"việt nam" thành "viet_nam"', () => {
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

  it('tên toàn dấu và emoji slug ra rỗng, safeFolderSlug phải bù id', () => {
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

describe('slugifyFileName: giữ phần đuôi', () => {
  it('"Báo giá Q4.pdf" thành "bao_gia_q4.pdf"', () => {
    expect(slugifyFileName('Báo giá Q4.pdf')).toBe('bao_gia_q4.pdf');
  });

  it('đuôi viết hoa chuyển thành viết thường', () => {
    expect(slugifyFileName('ẢNH.JPG')).toBe('anh.jpg');
  });

  it('không có đuôi vẫn chạy', () => {
    expect(slugifyFileName('Hồ sơ')).toBe('ho_so');
  });

  it('thân rỗng thì fallback "tep" nhưng không mất đuôi', () => {
    expect(slugifyFileName('🎉.pdf')).toBe('tep.pdf');
  });
});

describe('joinFolderSlug: cây thư mục lồng nhau', () => {
  it('không có cha thì chính nó là gốc', () => {
    expect(joinFolderSlug(null, 'viet_nam')).toBe('viet_nam');
    expect(joinFolderSlug('', 'viet_nam')).toBe('viet_nam');
  });

  it('nối cha + con bằng dấu /', () => {
    expect(joinFolderSlug('viet_nam', 'bao_gia')).toBe('viet_nam/bao_gia');
    expect(joinFolderSlug('viet_nam/bao_gia', '2026')).toBe('viet_nam/bao_gia/2026');
  });
});

/**
 * Hồi quy: trước khi vá, mọi thư mục cùng slug dùng chung một thư mục đĩa nên tệp nằm lẫn
 * nhau, và xoá một thư mục sẽ cuốn luôn liên kết của thư mục kia.
 */
describe('pickFreeFolderSlug: né đụng slug sau khi bỏ dấu', () => {
  /** Giả lập DB: tập slug đã bị thư mục khác chiếm. */
  const taken = (...slugs: string[]) => async (s: string) => slugs.includes(s);

  it('chưa ai chiếm thì lấy đúng slug gốc', async () => {
    expect(await pickFreeFolderSlug('Việt Nam', 'id1', null, taken())).toBe('viet_nam');
  });

  it('slug đã bị chiếm thì thêm hậu tố _2', async () => {
    expect(await pickFreeFolderSlug('việt nam', 'id2', null, taken('viet_nam'))).toBe('viet_nam_2');
  });

  it('bị chiếm liên tiếp thì đếm tiếp _3, _4', async () => {
    expect(await pickFreeFolderSlug('VIỆT  NAM', 'id3', null, taken('viet_nam', 'viet_nam_2'))).toBe('viet_nam_3');
    expect(await pickFreeFolderSlug('viet-nam', 'id4', null, taken('viet_nam', 'viet_nam_2', 'viet_nam_3'))).toBe('viet_nam_4');
  });

  it('né đụng theo TỪNG CẤP, không phải toàn cục', async () => {
    // Gốc trống nhưng cùng tên ở trong cha thì đã bận, mỗi cấp xét riêng.
    expect(await pickFreeFolderSlug('Việt Nam', 'id5', 'cha', taken('cha/viet_nam'))).toBe('cha/viet_nam_2');
    expect(await pickFreeFolderSlug('Việt Nam', 'id6', null, taken('cha/viet_nam'))).toBe('viet_nam');
  });

  it('6 cách viết cùng một tên cho ra 6 thư mục đĩa khác nhau', async () => {
    const used = new Set<string>();
    const out: string[] = [];
    for (const n of ['việt nam', 'Việt Nam', 'VIỆT  NAM', 'viet-nam', 'viet_nam', 'Viêt Nam!!!']) {
      const slug = await pickFreeFolderSlug(n, `id-${out.length}`, null, async (s) => used.has(s));
      used.add(slug);
      out.push(slug);
    }
    expect(new Set(out).size).toBe(6); // trước khi vá: 1
    expect(out).toEqual(['viet_nam', 'viet_nam_2', 'viet_nam_3', 'viet_nam_4', 'viet_nam_5', 'viet_nam_6']);
  });

  it('vẫn là lưới an toàn cho DỮ LIỆU CŨ đã trùng từ trước khi chặn', async () => {
    // Chặn trùng tên chỉ áp cho thư mục tạo mới, hàng cũ đã đụng nhau vẫn phải tách được.
    expect(await pickFreeFolderSlug('Việt Nam', 'legacy', null, taken('viet_nam'))).toBe('viet_nam_2');
  });

  it('cạn 50 hậu tố thì rơi về id, không bao giờ trả slug đã bị chiếm', async () => {
    const all = new Set(['viet_nam', ...Array.from({ length: 60 }, (_, i) => `viet_nam_${i + 2}`)]);
    const slug = await pickFreeFolderSlug('Việt Nam', 'abc123def456', null, async (s) => all.has(s));
    expect(all.has(slug)).toBe(false);
    expect(slug).toBe('viet_nam_abc123de');
  });
});

/** Báo lỗi ngay lúc tạo để tên trên đĩa luôn khớp tên trong kho. */
describe('isSameFolderName: hai tên có là MỘT dưới mắt người dùng', () => {
  it('khác dấu, hoa thường, dấu câu vẫn là cùng một tên', () => {
    for (const other of ['việt nam', 'VIỆT  NAM', 'viet-nam', 'viet_nam', 'Viêt Nam!!!', '  Việt Nam  ']) {
      expect(isSameFolderName('Việt Nam', other)).toBe(true);
    }
  });

  it('tên thật sự khác nhau thì không chặn', () => {
    expect(isSameFolderName('Việt Nam', 'Hà Nội')).toBe(false);
    expect(isSameFolderName('Báo giá', 'Báo giá 2026')).toBe(false);
    expect(isSameFolderName('hop_dong', 'hop_dong_2')).toBe(false);
  });

  it('tên slug ra rỗng thì coi như khác nhau, không chặn oan', () => {
    expect(isSameFolderName('🎉', '🚀')).toBe(false);
    expect(isSameFolderName('———', '🎉')).toBe(false);
  });
});
