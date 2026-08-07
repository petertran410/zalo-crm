/**
 * media-folder-service.ts — Phase Kho Lưu Trữ (Storage) 2026-07-22.
 *
 * Cầu nối DB ↔ thư mục THẬT trên đĩa (shared/storage/folder-mirror.ts).
 * Anh chốt: người dùng tạo thư mục trong tab Kho → hệ thống tạo LUÔN thư mục cùng tên
 * đã bỏ dấu trên đĩa ("việt nam" → "viet_nam"), và tệp trong thư mục đó xuất hiện thật
 * bên trong (liên kết cứng, không tốn thêm đĩa).
 *
 * MỌI hàm ở đây fire-and-forget được: không throw, chỉ log. Thư mục đĩa là TIỆN ÍCH
 * soi bằng tay — nó hỏng thì kho vẫn chạy bình thường (nguồn sự thật là DB).
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { keyFromPublicUrl } from '../../shared/storage/minio-client.js';
import {
  ensureFolderDir,
  linkIntoFolder,
  unlinkFromFolder,
  renameFolderDir,
  removeFolderDir,
  isFolderMirrorEnabled,
} from '../../shared/storage/folder-mirror.js';
import { logger } from '../../shared/utils/logger.js';

/** Sâu tối đa của cây thư mục — chặn người dùng dựng cây vô hạn + chặn vòng lặp cha-con. */
export const MAX_FOLDER_DEPTH = 10;

/**
 * Slug đĩa của thư mục CHA (null nếu là thư mục gốc / chưa mirror). Cha chưa có slug —
 * thư mục tạo trước khi có tính năng mirror — thì tạo bù, để cây con không bị treo ở gốc.
 */
async function parentSlugOf(parentId: string | null | undefined): Promise<string | null> {
  if (!parentId) return null;
  const parent = await prisma.mediaAlbum.findUnique({
    where: { id: parentId },
    select: { id: true, name: true, diskSlug: true, parentId: true },
  });
  if (!parent) return null;
  if (parent.diskSlug) return parent.diskSlug;
  return createFolderOnDisk(parent.id, parent.name, parent.parentId);
}

/**
 * Tạo thư mục đĩa cho 1 MediaAlbum và ghi lại slug đã dùng vào DB.
 * Gọi ngay sau khi tạo thư mục trong kho.
 *
 * 2026-08-07: thư mục lồng nhau — slug là đường dẫn tương đối ("viet_nam/bao_gia"), dựng
 * bằng cách nối slug của cha. Cha tạo trước con nên chuỗi này luôn phân giải được.
 */
export async function createFolderOnDisk(
  folderId: string,
  name: string,
  parentId?: string | null,
): Promise<string | null> {
  if (!isFolderMirrorEnabled()) return null;
  try {
    const slug = await ensureFolderDir(folderId, name, await parentSlugOf(parentId));
    if (!slug) return null;
    await prisma.mediaAlbum.update({ where: { id: folderId }, data: { diskSlug: slug } });
    logger.info(`[media-folder] đã tạo thư mục đĩa "${slug}" cho thư mục kho "${name}"`);
    return slug;
  } catch (err) {
    logger.warn(`[media-folder] tạo thư mục đĩa lỗi (${name}):`, (err as Error)?.message ?? err);
    return null;
  }
}

/**
 * Đặt liên kết cứng của 1 asset vào thư mục đĩa của thư mục kho đang chứa nó.
 * Ghi lại tên tệp đã đặt (folderLinkName) để sau còn gỡ đúng cái.
 * Không có thư mục / driver R2 / lỗi → no-op im lặng.
 */
export async function mirrorAssetIntoFolder(
  orgId: string,
  assetId: string,
  folderId: string,
): Promise<void> {
  if (!isFolderMirrorEnabled()) return;
  try {
    const [asset, folder] = await Promise.all([
      prisma.mediaAsset.findFirst({
        where: { id: assetId, orgId },
        select: {
          id: true, name: true, originalFilename: true, folderLinkName: true,
          blobs: { where: { variantType: 'original' }, select: { minioKey: true, publicUrl: true }, take: 1 },
        },
      }),
      prisma.mediaAlbum.findFirst({
        where: { id: folderId, orgId },
        select: { id: true, name: true, diskSlug: true, parentId: true },
      }),
    ]);
    if (!asset || !folder) return;

    // Thư mục tạo trước khi có tính năng này → chưa có slug, tạo bù bây giờ.
    const slug = folder.diskSlug ?? (await createFolderOnDisk(folder.id, folder.name, folder.parentId));
    if (!slug) return;

    const blob = asset.blobs[0];
    const key = blob?.minioKey || (blob?.publicUrl ? keyFromPublicUrl(blob.publicUrl) : null);
    if (!key) return;

    const displayName = asset.originalFilename || asset.name;
    const linkName = await linkIntoFolder(slug, key, displayName);
    if (linkName && linkName !== asset.folderLinkName) {
      await prisma.mediaAsset.update({ where: { id: asset.id }, data: { folderLinkName: linkName } });
    }
  } catch (err) {
    logger.warn(`[media-folder] mirror asset lỗi (${assetId}):`, (err as Error)?.message ?? err);
  }
}

/**
 * Gỡ tên tệp khỏi thư mục đĩa (bỏ vào thùng rác / chuyển sang thư mục khác).
 * CHỈ gỡ TÊN — byte trong kho phẳng giữ nguyên, nên tệp không hề mất.
 */
export async function unmirrorAssetFromFolder(orgId: string, assetId: string): Promise<void> {
  if (!isFolderMirrorEnabled()) return;
  try {
    const asset = await prisma.mediaAsset.findFirst({
      where: { id: assetId, orgId },
      select: { id: true, folderLinkName: true, folder: { select: { diskSlug: true } } },
    });
    if (!asset?.folderLinkName || !asset.folder?.diskSlug) return;
    await unlinkFromFolder(asset.folder.diskSlug, asset.folderLinkName);
    await prisma.mediaAsset.update({ where: { id: asset.id }, data: { folderLinkName: null } });
  } catch (err) {
    logger.warn(`[media-folder] gỡ mirror lỗi (${assetId}):`, (err as Error)?.message ?? err);
  }
}

/**
 * Đổi tên thư mục kho → đổi tên thư mục đĩa + cập nhật slug trong DB.
 *
 * 2026-08-07 (cây lồng nhau): rename trên đĩa kéo theo CẢ cây con (một lệnh rename thư mục),
 * nhưng diskSlug của các thư mục con trong DB là chuỗi đường dẫn nên đã trỏ sai — phải
 * viết lại tiền tố cho toàn bộ con cháu. Không làm bước này thì lần tải tệp kế tiếp vào
 * thư mục con sẽ mkdir lại cây cũ ở chỗ cũ.
 */
export async function renameFolderOnDisk(orgId: string, folderId: string, newName: string): Promise<void> {
  if (!isFolderMirrorEnabled()) return;
  try {
    const folder = await prisma.mediaAlbum.findFirst({
      where: { id: folderId, orgId }, select: { id: true, diskSlug: true, parentId: true },
    });
    if (!folder) return;
    const oldSlug = folder.diskSlug;
    const slug = await renameFolderDir(folder.id, oldSlug, newName, await parentSlugOf(folder.parentId));
    if (!slug || slug === oldSlug) return;

    await prisma.mediaAlbum.update({ where: { id: folder.id }, data: { diskSlug: slug } });

    // Viết lại tiền tố đường dẫn cho con cháu ("cu/con" → "moi/con").
    if (oldSlug) {
      const descendants = await collectDescendantIds(orgId, folder.id);
      if (descendants.length) {
        const rows = await prisma.mediaAlbum.findMany({
          where: { id: { in: descendants }, diskSlug: { startsWith: `${oldSlug}/` } },
          select: { id: true, diskSlug: true },
        });
        for (const r of rows) {
          await prisma.mediaAlbum.update({
            where: { id: r.id },
            data: { diskSlug: `${slug}${r.diskSlug!.slice(oldSlug.length)}` },
          });
        }
      }
    }
  } catch (err) {
    logger.warn(`[media-folder] đổi tên thư mục đĩa lỗi (${folderId}):`, (err as Error)?.message ?? err);
  }
}

/**
 * Mọi id thư mục con cháu của `rootId` (KHÔNG gồm chính nó), duyệt theo tầng.
 * Giới hạn MAX_FOLDER_DEPTH tầng — vừa khớp giới hạn lúc tạo, vừa là lưới an toàn nếu
 * dữ liệu cũ lỡ có vòng lặp cha-con.
 */
export async function collectDescendantIds(orgId: string, rootId: string): Promise<string[]> {
  const out: string[] = [];
  let frontier = [rootId];
  for (let depth = 0; depth < MAX_FOLDER_DEPTH && frontier.length; depth++) {
    const kids = await prisma.mediaAlbum.findMany({
      where: { orgId, parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = kids.map((k) => k.id).filter((id) => !out.includes(id) && id !== rootId);
    out.push(...frontier);
  }
  return out;
}

/** Số tầng từ gốc tới thư mục này (gốc = 0). Trả MAX_FOLDER_DEPTH nếu vượt giới hạn. */
export async function folderDepth(orgId: string, folderId: string | null): Promise<number> {
  let depth = 0;
  let cur = folderId;
  while (cur && depth < MAX_FOLDER_DEPTH) {
    const row = await prisma.mediaAlbum.findFirst({
      where: { id: cur, orgId }, select: { parentId: true },
    });
    if (!row) break;
    cur = row.parentId;
    depth++;
  }
  return depth;
}

/**
 * Xoá thư mục đĩa khi xoá thư mục kho. force=true gỡ cả liên kết bên trong
 * (byte kho phẳng VẪN GIỮ — xem folder-mirror).
 */
export async function deleteFolderOnDisk(orgId: string, folderId: string, force = false): Promise<void> {
  if (!isFolderMirrorEnabled()) return;
  try {
    const folder = await prisma.mediaAlbum.findFirst({
      where: { id: folderId, orgId }, select: { diskSlug: true },
    });
    if (!folder?.diskSlug) return;
    await removeFolderDir(folder.diskSlug, force);
  } catch (err) {
    logger.warn(`[media-folder] xoá thư mục đĩa lỗi (${folderId}):`, (err as Error)?.message ?? err);
  }
}
