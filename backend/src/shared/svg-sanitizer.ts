/**
 * svg-sanitizer.ts — Kho lưu trữ 2026-08-08 (anh chốt: nhận SVG nhưng phải LÀM SẠCH).
 *
 * VÌ SAO CẦN: SVG là XML, chạy được <script>, thuộc tính on*, và <foreignObject> nhúng
 * HTML. Byte thật lại được phục vụ ở /files/{key} KHÔNG cần đăng nhập (xem media-access.ts),
 * nên một SVG độc lưu trong kho = XSS lưu trữ nhắm vào mọi người đang đăng nhập mở nó.
 *
 * VÌ SAO KHÔNG RASTER HOÁ: đo 2026-08-08 — raster hoá diệt sạch script thật, nhưng phá luôn
 * vector (logo tải về hết phóng to được, mở lại bằng Illustrator là ảnh chết). Anh chốt giữ
 * vector, đổi lại phải làm sạch tử tế.
 *
 * VÌ SAO DÙNG DOMPurify CHỨ KHÔNG TỰ VIẾT: lọc SVG bằng regex/chuỗi là bài toán thua sẵn —
 * né được bằng entity XML, namespace lạ, CDATA, chữ hoa thường, URL mã hoá… DOMPurify dựng
 * cây DOM thật rồi bỏ theo DANH SÁCH CHO PHÉP, và có người vá khi lộ cách né mới.
 *
 * ⚠️ FAIL-CLOSED: mọi lỗi ở đây đều NÉM RA NGOÀI để chặn hẳn lần tải lên. TUYỆT ĐỐI không
 *    bắt chước fallback "lỗi thì lưu bản gốc" của compressImage — với SVG, lưu bản gốc
 *    CHÍNH LÀ lưu đúng thứ mình đang cố chặn.
 */
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

/** Trần kích thước SVG nhận vào — XML phình ra rất nhanh khi dựng cây DOM. */
export const SVG_MAX_BYTES = 2 * 1024 * 1024;

/**
 * SVG bị từ chối — lỗi NGƯỜI DÙNG (tệp không nhận được), không phải lỗi hệ thống.
 * Route bắt lớp này để trả 422 kèm lý do, thay vì 500 "upload failed" khó hiểu.
 */
export class SvgRejectedError extends Error {
  readonly code = 'SVG_REJECTED';
  constructor(reason: string) {
    super(reason);
    this.name = 'SvgRejectedError';
  }
}

/** Thẻ nguy hiểm: bỏ THẲNG cả nội dung bên trong, không chỉ bỏ thẻ. */
const FORBID_TAGS = [
  'script',       // chạy JS trực tiếp
  'foreignObject', // nhúng HTML tuỳ ý (kể cả <iframe>, <img onerror>)
  'iframe', 'embed', 'object', 'audio', 'video',
  'a',            // <a href="javascript:…"> khi mở SVG ở tab riêng
  'set', 'animate', 'animateTransform', // animate attributeName="href" đổi được link lúc chạy
  'handler', 'listener',
];

/** Thuộc tính nguy hiểm — mọi on* đã bị DOMPurify bỏ sẵn, đây là lớp thứ hai. */
const FORBID_ATTR = [
  'onload', 'onerror', 'onclick', 'onmouseover', 'onbegin', 'onend', 'onrepeat',
  'href', 'xlink:href',  // chặn nhúng tài nguyên ngoài + javascript: (xem chú thích dưới)
  'formaction', 'action', 'from', 'to', 'values', 'attributename',
];

/**
 * Làm sạch 1 SVG. Trả buffer SVG đã sạch.
 * @throws nếu rỗng / quá lớn / không phải SVG / sạch xong không còn gì dùng được.
 */
export function sanitizeSvg(input: Buffer): Buffer {
  if (!input?.length) throw new SvgRejectedError('SVG rỗng');
  if (input.length > SVG_MAX_BYTES) {
    throw new SvgRejectedError(`SVG quá lớn (tối đa ${SVG_MAX_BYTES / 1024 / 1024}MB)`);
  }

  const raw = input.toString('utf8');

  // Chặn TRƯỚC khi dựng DOM: DOCTYPE là cửa vào của XXE và "billion laughs". Không có
  // SVG dùng thật nào cần DOCTYPE, nên từ chối thẳng rẻ hơn nhiều so với đi lọc entity.
  if (/<!DOCTYPE/i.test(raw) || /<!ENTITY/i.test(raw)) {
    throw new SvgRejectedError('SVG chứa DOCTYPE/ENTITY — từ chối (nguy cơ XXE)');
  }

  // jsdom KHÔNG tải tài nguyên ngoài và KHÔNG chạy script với cấu hình mặc định;
  // ở đây cũng chỉ dùng nó làm cây DOM cho DOMPurify, không hề render.
  const window = new JSDOM('').window;
  const purify = createDOMPurify(window as any);

  const clean = purify.sanitize(raw, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS,
    FORBID_ATTR,
    // Giữ nguyên nội dung SVG, KHÔNG cho phép nhét HTML lẫn vào.
    ALLOWED_NAMESPACES: ['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink'],
    // data: URI nhúng được cả HTML/JS → cấm mọi URI, ảnh ngoài không cần cho logo/icon.
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    WHOLE_DOCUMENT: false,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });

  const out = String(clean).trim();
  if (!out || !/<svg[\s>]/i.test(out)) {
    throw new SvgRejectedError('SVG không hợp lệ hoặc rỗng sau khi làm sạch');
  }
  // Lớp chốt: nếu vì bất cứ lý do gì vẫn còn dấu vết thực thi thì THÀ TỪ CHỐI.
  if (/<script|javascript:|\son\w+\s*=/i.test(out)) {
    throw new SvgRejectedError('SVG vẫn còn mã thực thi sau khi làm sạch — từ chối');
  }
  return Buffer.from(out, 'utf8');
}
