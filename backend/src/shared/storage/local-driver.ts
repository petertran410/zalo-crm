/**
 * local-driver.ts — lưu file lên ổ đĩa VPS (config.uploadDir).
 *
 * File nằm tại {uploadDir}/{key}, ví dụ {uploadDir}/media/{hash}.jpg.
 * Serve công khai qua route tĩnh /files (đăng ký trong app.ts) →
 * publicUrl = {localPublicUrl}/{key}.
 *
 * Dedup giống tầng cũ: key theo sha256 BYTES THẬT; nếu file đã tồn tại thì
 * SKIP ghi và trả URL bản cũ (deduped=true).
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { config } from '../../config/index.js';
import { isSafeObjectKey, mimeToExt, type StorageDriver, type UploadResult } from './types.js';

const ROOT = resolve(config.uploadDir);

/** Đường dẫn tuyệt đối an toàn cho key (chống thoát ra ngoài ROOT). */
function pathForKey(key: string): string | null {
  if (!isSafeObjectKey(key)) return null;
  const p = resolve(ROOT, key);
  // resolve() đã chuẩn hóa `..`; chặn cứng nếu kết quả lọt ra ngoài ROOT.
  if (p !== ROOT && !p.startsWith(ROOT + sep)) return null;
  return p;
}

export const localDriver: StorageDriver = {
  publicUrl(key: string): string {
    return `${config.localPublicUrl}/${key}`;
  },

  async uploadBuffer(buffer: Buffer, mimeType: string, originalName?: string): Promise<UploadResult> {
    if (!buffer || buffer.length === 0) throw new Error('uploadBuffer: empty buffer (refusing 0-byte object)');
    // Đuôi lấy theo NỘI DUNG THẬT (mimeType) trước, tên tệp chỉ là phương án dự phòng
    // cho loại mà mimeToExt chưa biết (pdf/docx/xlsx/zip…) — 2026-08-08.
    //
    // Trước đây lấy theo tên tệp: ảnh nén xong thành WebP mà key vẫn là `{hash}.png`, nên
    // /files phục vụ ruột WebP kèm Content-Type: image/png. Trình duyệt tự đoán nên không
    // ai để ý, nhưng đó là nói dối — và nguy hiểm hơn kể từ khi /files bật `nosniff`.
    const ext = mimeToExt(mimeType) || (originalName ? extname(originalName) : '');
    const contentHash = createHash('sha256').update(buffer).digest('hex');
    const key = `media/${contentHash}${ext}`;
    const url = this.publicUrl(key);
    const abs = pathForKey(key)!; // key tự sinh, luôn an toàn

    // Dedup: file đã tồn tại (đúng kích thước) → skip ghi, trả bản cũ.
    const exists = await stat(abs).then((s) => s.isFile()).catch(() => false);
    if (exists) {
      return { key, url, size: buffer.length, mimeType, contentHash, deduped: true };
    }

    await mkdir(dirname(abs), { recursive: true });
    // Ghi ra file tạm cùng thư mục rồi rename = atomic, tránh file nửa vời nếu crash.
    const tmp = `${abs}.tmp-${process.pid}-${contentHash.slice(0, 8)}`;
    await writeFile(tmp, buffer);
    const { rename } = await import('node:fs/promises');
    await rename(tmp, abs);
    return { key, url, size: buffer.length, mimeType, contentHash, deduped: false };
  },

  async getObjectStream(key: string): Promise<NodeJS.ReadableStream | null> {
    const abs = pathForKey(key);
    if (!abs) return null;
    const ok = await stat(abs).then((s) => s.isFile()).catch(() => false);
    if (!ok) return null;
    return createReadStream(abs);
  },

  async getObjectBuffer(key: string): Promise<Buffer | null> {
    const abs = pathForKey(key);
    if (!abs) return null;
    try {
      return await readFile(abs);
    } catch {
      return null;
    }
  },

  async ensureBucket(): Promise<void> {
    await mkdir(join(ROOT, 'media'), { recursive: true });
  },
};
