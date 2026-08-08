/**
 * svg-sanitizer.test.ts — Kho lưu trữ 2026-08-08.
 *
 * SVG được LƯU NGUYÊN DẠNG VECTOR (không raster hoá) nên bộ lọc là thứ DUY NHẤT đứng giữa
 * tệp người dùng tải lên và /files — nơi phục vụ byte thật mà KHÔNG cần đăng nhập.
 * Mỗi ca dưới đây là một đường tấn công thật; hỏng ca nào là XSS lưu trữ ca đó.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeSvg, SvgRejectedError, SVG_MAX_BYTES } from '../../src/shared/svg-sanitizer.js';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const svg = (inner: string, attrs = '') => Buffer.from(`<svg ${NS} width="100" height="100" ${attrs}>${inner}</svg>`);
const out = (b: Buffer) => sanitizeSvg(b).toString('utf8');

describe('sanitizeSvg — giữ được SVG lành', () => {
  it('hình cơ bản đi qua nguyên vẹn', () => {
    const s = out(svg('<rect width="100" height="100" fill="blue"/>'));
    expect(s).toContain('<svg');
    expect(s).toContain('rect');
    expect(s).toContain('blue');
  });

  it('giữ path, group, style nội tuyến — thứ logo thật hay dùng', () => {
    const s = out(svg('<g><path d="M0 0 L10 10" stroke="#f00" stroke-width="2"/></g>'));
    expect(s).toContain('path');
    expect(s).toContain('M0 0 L10 10');
  });

  it('giữ VECTOR (không biến thành ảnh raster)', () => {
    const s = out(svg('<circle cx="50" cy="50" r="40"/>'));
    expect(s).toContain('<svg');
    expect(s).toContain('circle');   // vẫn sửa/phóng to được — lý do chọn làm sạch thay vì raster hoá
  });
});

describe('sanitizeSvg — chặn mã thực thi', () => {
  const strip = (inner: string, attrs = '') => out(svg(inner, attrs)).toLowerCase();

  it('bỏ <script>', () => {
    const s = strip('<sc' + 'ript>alert(1)</sc' + 'ript><rect width="10" height="10"/>');
    expect(s).not.toContain('script');
    expect(s).not.toContain('alert');
  });

  it('bỏ thuộc tính on* (onload/onerror/onclick)', () => {
    expect(strip('<rect width="10" height="10"/>', 'onload="alert(1)"')).not.toContain('onload');
    expect(strip('<rect width="10" height="10" onclick="alert(1)"/>')).not.toContain('onclick');
    expect(strip('<image onerror="alert(1)" width="10" height="10"/>')).not.toContain('onerror');
  });

  it('bỏ <foreignObject> — cửa nhét HTML tuỳ ý', () => {
    const s = strip('<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror=alert(1)></body></foreignObject>');
    expect(s).not.toContain('foreignobject');
    expect(s).not.toContain('onerror');
  });

  it('bỏ liên kết javascript: và <a>', () => {
    const s = strip('<a href="javascript:alert(1)"><rect width="10" height="10"/></a>');
    expect(s).not.toContain('javascript:');
  });

  it('bỏ tài nguyên NGOÀI (chống SSRF + lộ dấu vết khi mở)', () => {
    const s = strip('<image href="http://ke-tan-cong.example/x.png" width="10" height="10"/>');
    expect(s).not.toContain('ke-tan-cong');
  });

  it('bỏ <animate> đổi thuộc tính lúc chạy', () => {
    const s = strip('<rect width="10" height="10"><animate attributeName="href" to="javascript:alert(1)"/></rect>');
    expect(s).not.toContain('javascript:');
    expect(s).not.toContain('<animate');
  });

  it('bỏ <use> trỏ ra ngoài', () => {
    const s = strip('<use href="http://ke-tan-cong.example/x.svg#a"/>');
    expect(s).not.toContain('ke-tan-cong');
  });
});

describe('sanitizeSvg — FAIL-CLOSED (từ chối hẳn, không lưu bản gốc)', () => {
  it('DOCTYPE/ENTITY → ném lỗi, KHÔNG cố lọc (chặn XXE)', () => {
    const xxe = Buffer.from(
      `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg ${NS}><text>&x;</text></svg>`,
    );
    expect(() => sanitizeSvg(xxe)).toThrow(SvgRejectedError);
    expect(() => sanitizeSvg(xxe)).toThrow(/XXE/i);
  });

  it('bom entity (billion laughs) → ném lỗi ngay ở bước DOCTYPE', () => {
    const bomb = Buffer.from(
      `<?xml version="1.0"?><!DOCTYPE s [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]><svg ${NS}><text>&b;</text></svg>`,
    );
    expect(() => sanitizeSvg(bomb)).toThrow(SvgRejectedError);
  });

  it('tệp rỗng → ném lỗi', () => {
    expect(() => sanitizeSvg(Buffer.alloc(0))).toThrow(SvgRejectedError);
  });

  it('vượt trần kích thước → ném lỗi', () => {
    const huge = Buffer.concat([svg('<rect/>'), Buffer.alloc(SVG_MAX_BYTES + 1, 0x20)]);
    expect(() => sanitizeSvg(huge)).toThrow(/quá lớn/i);
  });

  it('không phải SVG → ném lỗi (không lặng lẽ cho qua)', () => {
    expect(() => sanitizeSvg(Buffer.from('<html><body>xin chào</body></html>'))).toThrow(SvgRejectedError);
    expect(() => sanitizeSvg(Buffer.from('chỉ là chữ thường'))).toThrow(SvgRejectedError);
  });

  it('lỗi mang code SVG_REJECTED để route trả 422', () => {
    try {
      sanitizeSvg(Buffer.alloc(0));
      expect.unreachable('đáng lẽ phải ném');
    } catch (e: any) {
      expect(e.code).toBe('SVG_REJECTED');
    }
  });
});
