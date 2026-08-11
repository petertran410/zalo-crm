/**
 * Làm sạch SVG trước khi lưu vào kho.
 *
 * SVG chạy được script, mà /files phục vụ byte thật KHÔNG cần đăng nhập, nên một SVG độc
 * lưu được vào kho là XSS nhắm vào mọi người mở nó. Giữ vector thay vì raster hoá vì logo
 * tải về vẫn phải phóng to và sửa được.
 */
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

export const SVG_MAX_BYTES = 2 * 1024 * 1024;

/** Route bắt lớp này để trả 422 kèm lý do thay vì 500 "upload failed". */
export class SvgRejectedError extends Error {
  readonly code = 'SVG_REJECTED';
  constructor(reason: string) {
    super(reason);
    this.name = 'SvgRejectedError';
  }
}

const FORBID_TAGS = [
  'script',
  'foreignObject', // nhúng được HTML tuỳ ý, kể cả <img onerror>
  'iframe', 'embed', 'object', 'audio', 'video',
  'a', // href="javascript:..." khi mở SVG ở tab riêng
  'set', 'animate', 'animateTransform', // đổi được href lúc chạy
  'handler', 'listener',
];

const FORBID_ATTR = [
  'onload', 'onerror', 'onclick', 'onmouseover', 'onbegin', 'onend', 'onrepeat',
  'href', 'xlink:href', // chặn tài nguyên ngoài và javascript:
  'formaction', 'action', 'from', 'to', 'values', 'attributename',
];

/**
 * Trả buffer SVG đã sạch. Ném SvgRejectedError nếu không cứu được: mọi lỗi ở đây phải chặn
 * hẳn lần tải lên, vì với SVG thì "lỗi thì lưu bản gốc" chính là lưu thứ đang cố chặn.
 */
export function sanitizeSvg(input: Buffer): Buffer {
  if (!input?.length) throw new SvgRejectedError('SVG rỗng');
  if (input.length > SVG_MAX_BYTES) {
    throw new SvgRejectedError(`SVG quá lớn (tối đa ${SVG_MAX_BYTES / 1024 / 1024}MB)`);
  }

  const raw = input.toString('utf8');

  // Không SVG dùng thật nào cần DOCTYPE, nên từ chối thẳng rẻ hơn đi lọc entity XXE.
  if (/<!DOCTYPE/i.test(raw) || /<!ENTITY/i.test(raw)) {
    throw new SvgRejectedError('SVG chứa DOCTYPE/ENTITY, từ chối vì nguy cơ XXE');
  }

  const window = new JSDOM('').window;
  const purify = createDOMPurify(window as any);

  const clean = purify.sanitize(raw, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS,
    FORBID_ATTR,
    ALLOWED_NAMESPACES: ['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink'],
    // data: URI nhúng được cả HTML lẫn JS, mà logo/icon không cần tới.
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
  // Còn sót dấu vết thực thi thì thà từ chối, không đoán xem có chạy được hay không.
  if (/<script|javascript:|\son\w+\s*=/i.test(out)) {
    throw new SvgRejectedError('SVG vẫn còn mã thực thi sau khi làm sạch');
  }
  return Buffer.from(out, 'utf8');
}
