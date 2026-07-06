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
  it('nén ảnh PNG lớn → ra webp, cạnh dài ≤ 2000', async () => {
    // tạo ảnh 3000x100 đặc (vượt MAX_EDGE 2000)
    const big = await sharp({
      create: { width: 3000, height: 100, channels: 3, background: { r: 200, g: 60, b: 10 } },
    }).png().toBuffer();

    const out = await compressImage(big, 'image/png');
    expect(out.compressed).toBe(true);
    expect(out.mimeType).toBe('image/webp');
    expect(out.width).toBeLessThanOrEqual(2000);
    // bytes thật lưu phải nhỏ hơn ảnh gốc to (nén có tác dụng)
    expect(out.buffer.length).toBeLessThan(big.length);
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
