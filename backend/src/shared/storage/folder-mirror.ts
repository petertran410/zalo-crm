/**
 * folder-mirror.ts — Phase Kho Lưu Trữ (Storage) 2026-07-22.
 *
 * Người dùng tạo thư mục trong tab Kho → hệ thống tạo LUÔN thư mục THẬT trên đĩa
 * với tên đã bỏ dấu ("việt nam" → "viet_nam"), và đặt LIÊN KẾT CỨNG (hardlink) của
 * từng tệp vào trong đó với tên đọc được:
 *
 *   {uploadDir}/media/3b80dc4f….webp          ← kho phẳng, tên = vân tay nội dung (dedup)
 *   {uploadDir}/folders/viet_nam/bao_gia.pdf  ← hardlink, CÙNG byte, KHÔNG tốn thêm đĩa
 *
 * Vì sao hardlink chứ không phải shortcut (symlink): hardlink KHÔNG phải con trỏ —
 * nó là TÊN THỨ HAI của cùng khối byte. Xoá "bản gốc" thì tên trong thư mục vẫn mở
 * được bình thường. (Thực tế trong app này chưa có đường nào xoá byte: "Xoá khỏi kho"
 * chỉ set archivedAt, còn media-trash-gc-cron có invariant KHÔNG đụng byte vì phần lớn
 * blob dùng chung với lịch sử chat.)
 *
 * ⚠️ CHỈ chạy với STORAGE_DRIVER=local. Với R2 không có đĩa thật → skip + log debug.
 * ⚠️ MỌI hàm ở đây KHÔNG BAO GIỜ throw ra ngoài — hỏng thư mục đĩa không được làm
 *    hỏng request upload. Lỗi → logger.warn rồi trả false.
 */
import { link, copyFile, mkdir, rename, rm, stat, unlink, readdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { config } from '../../config/index.js';
import { logger } from '../utils/logger.js';
import { safeFolderSlug, slugifyFileName } from '../folder-slug.js';

const ROOT = resolve(config.uploadDir);
const FOLDERS_ROOT = join(ROOT, 'folders');

/** Driver 'local' mới có đĩa thật để soi thư mục. R2 → no-op. */
export function isFolderMirrorEnabled(): boolean {
  return config.storageDriver === 'local';
}

/**
 * Chặn cứng slug thoát khỏi FOLDERS_ROOT. slug là đường dẫn tương đối nhiều cấp, mỗi đoạn
 * chỉ [a-z0-9_] nên '..' không lọt qua được regex.
 */
function folderPath(slug: string): string | null {
  if (!slug || !/^[a-z0-9_]+(\/[a-z0-9_]+)*$/.test(slug)) return null;
  const p = resolve(FOLDERS_ROOT, slug);
  if (!p.startsWith(FOLDERS_ROOT + sep)) return null;
  return p;
}

/** Cha rỗng nghĩa là thư mục gốc. */
export function joinFolderSlug(parentSlug: string | null | undefined, segment: string): string {
  return parentSlug ? `${parentSlug}/${segment}` : segment;
}

/** Đường dẫn tuyệt đối của object trong kho phẳng ('media/{hash}.ext'). */
function objectPath(key: string): string | null {
  if (!key || key.startsWith('/') || key.includes('..') || key.includes('\0')) return null;
  const p = resolve(ROOT, key);
  if (!p.startsWith(ROOT + sep)) return null;
  return p;
}

/**
 * Tạo thư mục thật trên đĩa cho 1 thư mục kho. Idempotent (mkdir recursive).
 * Trả slug đã dùng (để caller lưu vào DB) hoặc null nếu skip/lỗi.
 */
export async function ensureFolderDir(
  folderId: string,
  name: string,
  parentSlug?: string | null,
): Promise<string | null> {
  return ensureFolderDirExact(joinFolderSlug(parentSlug, safeFolderSlug(name, folderId)), folderId);
}

/** Nhận thẳng slug đã tính sẵn, dùng khi caller đã tự giải quyết việc đụng tên. */
export async function ensureFolderDirExact(slug: string, folderId = '?'): Promise<string | null> {
  if (!isFolderMirrorEnabled()) return null;
  const dir = folderPath(slug);
  if (!dir) {
    logger.warn(`[folder-mirror] slug không hợp lệ, bỏ qua mkdir: folderId=${folderId} slug="${slug}"`);
    return null;
  }
  try {
    await mkdir(dir, { recursive: true });
    return slug;
  } catch (err) {
    logger.warn(`[folder-mirror] mkdir lỗi (${slug}):`, (err as Error)?.message ?? err);
    return null;
  }
}

/** 2 đường dẫn có trỏ cùng 1 khối byte không (cùng inode) → đã link rồi, khỏi làm lại. */
async function isSameFile(a: string, b: string): Promise<boolean> {
  try {
    const [sa, sb] = await Promise.all([stat(a), stat(b)]);
    // ino=0 trên vài filesystem Windows → so thêm size như lớp phòng hờ.
    if (sa.ino !== 0 && sa.ino === sb.ino && sa.dev === sb.dev) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Tìm tên chưa dùng trong thư mục. "bao_gia.pdf" bận (khác byte) → "bao_gia_2.pdf".
 * Nếu tên đang bận LẠI CHÍNH LÀ tệp này (cùng inode) → trả tên đó (idempotent).
 */
async function resolveLinkName(dir: string, wanted: string, srcAbs: string): Promise<string | null> {
  const m = wanted.match(/^(.*?)(\.[A-Za-z0-9]{1,8})?$/);
  const stem = m?.[1] || 'tep';
  const ext = m?.[2] || '';
  for (let i = 1; i <= 50; i++) {
    const candidate = i === 1 ? `${stem}${ext}` : `${stem}_${i}${ext}`;
    const abs = join(dir, candidate);
    const exists = await stat(abs).then(() => true).catch(() => false);
    if (!exists) return candidate;
    if (await isSameFile(abs, srcAbs)) return candidate; // đã link sẵn
  }
  return null;
}

/**
 * Đặt hardlink của 1 tệp kho vào thư mục đĩa. Idempotent — gọi lại không tạo bản trùng.
 *
 * @param slug        slug thư mục (đã lưu ở DB)
 * @param objectKey   key kho phẳng, vd 'media/3b80….webp'
 * @param displayName tên hiển thị của asset ("Báo giá Q4.pdf") — sẽ slug thành tên tệp
 * @returns tên tệp đã đặt trong thư mục, hoặc null nếu skip/lỗi
 */
export async function linkIntoFolder(
  slug: string,
  objectKey: string,
  displayName: string,
): Promise<string | null> {
  if (!isFolderMirrorEnabled()) return null;
  const dir = folderPath(slug);
  const src = objectPath(objectKey);
  if (!dir || !src) return null;

  const srcOk = await stat(src).then((s) => s.isFile()).catch(() => false);
  if (!srcOk) {
    logger.warn(`[folder-mirror] không thấy object nguồn, bỏ qua link: ${objectKey}`);
    return null;
  }

  try {
    await mkdir(dir, { recursive: true });
    const wanted = slugifyFileName(displayName);
    const linkName = await resolveLinkName(dir, wanted, src);
    if (!linkName) {
      logger.warn(`[folder-mirror] quá nhiều tên trùng trong ${slug}, bỏ qua: ${wanted}`);
      return null;
    }
    const dest = join(dir, linkName);
    if (await isSameFile(dest, src)) return linkName; // đã có, không làm gì

    try {
      await link(src, dest);
    } catch (err: any) {
      // EXDEV = khác ổ đĩa, EPERM = filesystem không cho hardlink (một số share mạng).
      // Không để thư mục trống → chép thật, nhưng CẢNH BÁO vì lúc này tốn thêm đĩa.
      if (err?.code === 'EXDEV' || err?.code === 'EPERM' || err?.code === 'ENOSYS') {
        await copyFile(src, dest);
        logger.warn(`[folder-mirror] hardlink không được (${err.code}) → đã CHÉP tệp (tốn thêm đĩa): ${slug}/${linkName}`);
      } else if (err?.code === 'EEXIST') {
        return linkName; // race 2 request cùng lúc — coi như xong
      } else {
        throw err;
      }
    }
    return linkName;
  } catch (err) {
    logger.warn(`[folder-mirror] link lỗi (${slug} ← ${objectKey}):`, (err as Error)?.message ?? err);
    return null;
  }
}

/**
 * Gỡ tên tệp khỏi thư mục đĩa (khi bỏ vào thùng rác / chuyển thư mục khác).
 * CHỈ xoá TÊN trong thư mục — byte trong kho phẳng giữ nguyên (đó là điểm của hardlink).
 */
export async function unlinkFromFolder(slug: string, linkName: string): Promise<boolean> {
  if (!isFolderMirrorEnabled()) return false;
  const dir = folderPath(slug);
  if (!dir || !linkName || linkName.includes('/') || linkName.includes('\\') || linkName.includes('..')) return false;
  try {
    await unlink(join(dir, linkName));
    return true;
  } catch (err: any) {
    if (err?.code === 'ENOENT') return true; // đã không còn — coi như xong
    logger.warn(`[folder-mirror] unlink lỗi (${slug}/${linkName}):`, err?.message ?? err);
    return false;
  }
}

/** `newSlug` là đường dẫn đã tính sẵn và đã né đụng độ ở tầng service. */
export async function renameFolderDir(
  folderId: string,
  oldSlug: string | null,
  newSlug: string,
): Promise<string | null> {
  if (!isFolderMirrorEnabled()) return null;
  if (!oldSlug || oldSlug === newSlug) return ensureFolderDirExact(newSlug, folderId);

  const from = folderPath(oldSlug);
  const to = folderPath(newSlug);
  if (!from || !to) return null;
  try {
    const destExists = await stat(to).then(() => true).catch(() => false);
    if (destExists) {
      // Thư mục đĩa không ai nhận, thường do tạo tay ngoài app. Không trộn hai thư mục.
      logger.warn(`[folder-mirror] slug đích đã tồn tại, giữ nguyên thư mục cũ: ${oldSlug} → ${newSlug}`);
      return oldSlug;
    }
    // Thư mục cha phải tồn tại thì rename mới chạy.
    const parentDir = to.slice(0, to.lastIndexOf(sep));
    if (parentDir.startsWith(FOLDERS_ROOT)) await mkdir(parentDir, { recursive: true });
    await rename(from, to);
    return newSlug;
  } catch (err: any) {
    // Thư mục nguồn bị xoá tay ngoài app thì tạo thẳng thư mục đích.
    if (err?.code === 'ENOENT') return ensureFolderDirExact(newSlug, folderId);
    logger.warn(`[folder-mirror] rename lỗi (${oldSlug} → ${newSlug}):`, err?.message ?? err);
    return null;
  }
}

/**
 * Xoá thư mục đĩa khi người dùng xoá thư mục kho.
 * MẶC ĐỊNH chỉ xoá khi thư mục RỖNG — an toàn, tránh gỡ nhầm hàng loạt tên tệp.
 * Truyền force=true để xoá cả các hardlink bên trong (byte kho phẳng VẪN GIỮ).
 */
export async function removeFolderDir(slug: string, force = false): Promise<boolean> {
  if (!isFolderMirrorEnabled()) return false;
  const dir = folderPath(slug);
  if (!dir) return false;
  try {
    if (!force) {
      const entries = await readdir(dir).catch(() => [] as string[]);
      if (entries.length > 0) {
        logger.warn(`[folder-mirror] thư mục đĩa còn ${entries.length} mục, không xoá: ${slug}`);
        return false;
      }
    }
    await rm(dir, { recursive: true, force: true });
    return true;
  } catch (err) {
    logger.warn(`[folder-mirror] xoá thư mục lỗi (${slug}):`, (err as Error)?.message ?? err);
    return false;
  }
}
