/**
 * media-dedup.test.ts — Phase Media Library 2026-06-11.
 *
 * Kiểm 2 thứ KHÔNG cần DB thật:
 *  1. compressImage (sharp thật): nén ảnh lớn về webp, fallback bản gốc khi ảnh hỏng.
 *  2. Dedup key: cùng bytes → cùng sha256 → cùng minio key (1 object). Khác bytes → khác.
 *
 * (Test privacy save-from-chat cần DB/mock prisma → để integration test riêng;
 *  ở đây test thuần logic dedup + nén để chạy nhanh ở mọi máy/CI.)
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { compressImage, resolveSavedVisibility } from '../src/modules/media/media-service.js';

// Helper: dựng lại cách uploadBuffer tính key (media/{sha256}{ext}) để assert dedup.
function deriveKey(buf: Buffer, ext: string): string {
  const hash = createHash('sha256').update(buf).digest('hex');
  return `media/${hash}${ext}`;
}

describe('media dedup — content-hash key', () => {
  it('cùng bytes → cùng key (1 object, dedup)', () => {
    const a = Buffer.from('bảng giá EGV nội dung ảnh');
    const b = Buffer.from('bảng giá EGV nội dung ảnh');
    expect(deriveKey(a, '.jpg')).toBe(deriveKey(b, '.jpg'));
  });

  it('khác bytes → khác key (không dedup nhầm)', () => {
    const a = Buffer.from('ảnh 1');
    const b = Buffer.from('ảnh 2');
    expect(deriveKey(a, '.jpg')).not.toBe(deriveKey(b, '.jpg'));
  });

  it('key luôn nằm dưới prefix media/', () => {
    const k = deriveKey(Buffer.from('x'), '.png');
    expect(k.startsWith('media/')).toBe(true);
    expect(k.endsWith('.png')).toBe(true);
  });
});

describe('compressImage — nén + fallback (sharp)', () => {
  // Hợp đồng đã đổi: trước ép hết sang WebP và thu về 2000px, nay giữ định dạng và kích thước.
  it('giữ định dạng: png ra png, jpeg ra jpeg, webp ra webp', async () => {
    const mk = (fmt: 'png' | 'jpeg' | 'webp') =>
      sharp({ create: { width: 600, height: 400, channels: 3, background: { r: 200, g: 60, b: 10 } } })[fmt]().toBuffer();

    for (const [fmt, mime] of [['png', 'image/png'], ['jpeg', 'image/jpeg'], ['webp', 'image/webp']] as const) {
      const out = await compressImage(await mk(fmt), mime);
      expect(out.mimeType).toBe(mime);
    }
  });

  it('giữ kích thước: ảnh vượt 2000px không còn bị thu nhỏ', async () => {
    const big = await sharp({
      create: { width: 3000, height: 100, channels: 3, background: { r: 200, g: 60, b: 10 } },
    }).png().toBuffer();

    const out = await compressImage(big, 'image/png');
    expect(out.mimeType).toBe('image/png');
    expect(out.width).toBe(3000); // trước đây bị ép xuống 2000
    expect(out.height).toBe(100);
  });

  it('JPEG vẫn nén thật (mất dữ liệu, quality 80) và nhỏ đi', async () => {
    // Nền một màu thì mã hoá kiểu gì cũng nhỏ, cần gradient để phép nén có chỗ phát huy.
    const w = 800, h = 600;
    const raw = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      raw[i] = (x / w) * 255; raw[i + 1] = (y / h) * 255; raw[i + 2] = ((x + y) % 64) * 4;
    }
    const src = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();

    const out = await compressImage(src, 'image/jpeg');
    expect(out.compressed).toBe(true);
    expect(out.mimeType).toBe('image/jpeg');
    expect(out.width).toBe(w);
    expect(out.buffer.length).toBeLessThan(src.length);
  });

  it('nén xong PHÌNH TO hơn gốc → giữ bản gốc, không lưu bản to hơn', async () => {
    const tiny = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } }).png().toBuffer();
    const out = await compressImage(tiny, 'image/png');
    expect(out.buffer.length).toBeLessThanOrEqual(tiny.length);
    expect(out.mimeType).toBe('image/png');
  });

  it('ảnh hỏng/không decode được → fallback bản gốc, không ném lỗi (D10)', async () => {
    const garbage = Buffer.from('đây không phải ảnh thật, sharp sẽ fail');
    const out = await compressImage(garbage, 'image/jpeg');
    // D10(2): không mất dữ liệu — trả nguyên bản, compressed=false.
    expect(out.compressed).toBe(false);
    expect(out.buffer).toBe(garbage);
    expect(out.mimeType).toBe('image/jpeg');
  });

  it('GIF (ảnh động) KHÔNG nén qua sharp — giữ nguyên animation', async () => {
    const fakeGif = Buffer.from('GIF89a fake animated data');
    const out = await compressImage(fakeGif, 'image/gif');
    expect(out.compressed).toBe(false);
    expect(out.mimeType).toBe('image/gif');
    expect(out.buffer).toBe(fakeGif);
  });
});

describe('resolveSavedVisibility — PRIVACY guard "Lưu từ chat" (khu vực đã từng lộ)', () => {
  it('nick Riêng tư + viewer KHÔNG phải chủ → CHẶN (không lưu PII khách của người khác)', () => {
    const r = resolveSavedVisibility({
      nickPrivacyMode: 'main',
      nickOwnerUserId: 'OWNER',
      viewerUserId: 'SALE_KHAC',
      requested: 'public',
    });
    expect(r.blocked).toBe(true);
  });

  it('nick Riêng tư + viewer LÀ chủ nick → cho lưu nhưng ÉP private (dù xin public)', () => {
    const r = resolveSavedVisibility({
      nickPrivacyMode: 'main',
      nickOwnerUserId: 'OWNER',
      viewerUserId: 'OWNER',
      requested: 'public', // xin public nhưng phải bị ép private
    });
    expect(r.blocked).toBe(false);
    expect(r.visibility).toBe('private');
    expect(r.forcedPrivate).toBe(true);
  });

  it('nick Thường (sub) → theo lựa chọn sale (public nếu xin public)', () => {
    const r = resolveSavedVisibility({
      nickPrivacyMode: 'sub',
      nickOwnerUserId: 'OWNER',
      viewerUserId: 'SALE_KHAC',
      requested: 'public',
    });
    expect(r.blocked).toBe(false);
    expect(r.visibility).toBe('public');
  });

  it('mặc định fail-closed: không xin gì → private', () => {
    const r = resolveSavedVisibility({
      nickPrivacyMode: 'sub',
      nickOwnerUserId: 'OWNER',
      viewerUserId: 'SALE',
    });
    expect(r.visibility).toBe('private');
  });
});
