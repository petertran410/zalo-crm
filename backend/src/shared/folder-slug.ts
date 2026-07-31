// folder-slug.ts — Phase Kho Lưu Trữ (Storage) 2026-07-22.
// Slugify tên thư mục người dùng đặt → tên thư mục THẬT trên đĩa.
// Quy ước anh chốt: giữ nguyên chữ cái, BỎ DẤU, khoảng trắng → gạch dưới.
//   "việt nam" → "viet_nam"
//
// KHÁC slugifyTag (shared/tag-slug.ts): tag dùng '-' cho URL slug, thư mục dùng '_'
// cho tên đường dẫn. Bảng bỏ dấu tách riêng ở đây để 2 quy ước không kéo nhau khi sửa.

const VIETNAMESE_MAP: Record<string, string> = {
  à: 'a', á: 'a', ạ: 'a', ả: 'a', ã: 'a',
  â: 'a', ầ: 'a', ấ: 'a', ậ: 'a', ẩ: 'a', ẫ: 'a',
  ă: 'a', ằ: 'a', ắ: 'a', ặ: 'a', ẳ: 'a', ẵ: 'a',
  è: 'e', é: 'e', ẹ: 'e', ẻ: 'e', ẽ: 'e',
  ê: 'e', ề: 'e', ế: 'e', ệ: 'e', ể: 'e', ễ: 'e',
  ì: 'i', í: 'i', ị: 'i', ỉ: 'i', ĩ: 'i',
  ò: 'o', ó: 'o', ọ: 'o', ỏ: 'o', õ: 'o',
  ô: 'o', ồ: 'o', ố: 'o', ộ: 'o', ổ: 'o', ỗ: 'o',
  ơ: 'o', ờ: 'o', ớ: 'o', ợ: 'o', ở: 'o', ỡ: 'o',
  ù: 'u', ú: 'u', ụ: 'u', ủ: 'u', ũ: 'u',
  ư: 'u', ừ: 'u', ứ: 'u', ự: 'u', ử: 'u', ữ: 'u',
  ỳ: 'y', ý: 'y', ỵ: 'y', ỷ: 'y', ỹ: 'y',
  đ: 'd',
};

const EMOJI_REGEX = /\p{Extended_Pictographic}/gu;

// Tên thư mục cấm trên Windows (dev box của anh chạy Win, VPS chạy Linux — phải né cả 2).
// Trùng 1 trong các tên này → thêm hậu tố '_' để mkdir không nổ trên Windows.
const WINDOWS_RESERVED = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

// Giới hạn 1 thành phần đường dẫn: 255 byte trên ext4/NTFS. Cắt 120 cho an toàn
// (còn chỗ cho hậu tố chống trùng + tên file bên trong).
const MAX_SLUG_LEN = 120;

/**
 * Chuẩn hoá tên thư mục → tên an toàn trên đĩa.
 * Ví dụ:
 *   "việt nam"        → "viet_nam"
 *   "Bảng Giá  2026"  → "bang_gia_2026"
 *   "📁 Hồ sơ/KH"     → "ho_so_kh"
 *   ""                → "" (caller phải fallback, xem safeFolderSlug)
 */
export function slugifyFolderName(input: string): string {
  if (!input) return '';

  let s = input.normalize('NFC');
  s = s.replace(EMOJI_REGEX, '').trim();
  s = s.toLowerCase();
  s = s
    .split('')
    .map((ch) => VIETNAMESE_MAP[ch] ?? ch)
    .join('');

  // Mọi ký tự không phải chữ/số → '_' (gồm cả khoảng trắng, '/', '\', dấu câu).
  s = s.replace(/[^a-z0-9]+/g, '_');
  s = s.replace(/_+/g, '_').replace(/^_|_$/g, '');
  s = s.slice(0, MAX_SLUG_LEN).replace(/_$/, '');

  if (WINDOWS_RESERVED.has(s)) s = `${s}_`;
  return s;
}

/**
 * Như slugifyFolderName nhưng ĐẢM BẢO trả chuỗi khác rỗng — tên toàn emoji/dấu
 * ("🎉", "———") slug ra rỗng, không mkdir được. Fallback 'thu_muc' + id rút gọn để
 * vẫn phân biệt được thư mục trên đĩa.
 */
export function safeFolderSlug(name: string, folderId: string): string {
  const slug = slugifyFolderName(name);
  if (slug) return slug;
  return `thu_muc_${folderId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase()}`;
}

/**
 * Slug cho TÊN TỆP bên trong thư mục — giữ phần đuôi (.pdf/.webp) nguyên vẹn,
 * chỉ slugify phần thân. "Báo giá Q4.pdf" → "bao_gia_q4.pdf".
 * Không có đuôi → trả nguyên thân đã slug.
 */
export function slugifyFileName(input: string): string {
  const raw = (input || '').replace(/[\\/]+/g, '_').trim();
  const m = raw.match(/^(.*?)(\.[A-Za-z0-9]{1,8})$/);
  const stem = m ? m[1] : raw;
  const ext = m ? m[2].toLowerCase() : '';
  const slug = slugifyFolderName(stem);
  return (slug || 'tep') + ext;
}
