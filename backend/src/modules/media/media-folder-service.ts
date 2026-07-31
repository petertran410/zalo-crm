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

/**
 * Tạo thư mục đĩa cho 1 MediaAlbum và ghi lại slug đã dùng vào DB.
 * Gọi ngay sau khi tạo thư mục trong kho.
 */
export async function createFolderOnDisk(folderId: string, name: string): Promise<string | null> {
  if (!isFolderMirrorEnabled()) return null;
  try {
    const slug = await ensureFolderDir(folderId, name);
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
      prisma.mediaAlbum.findFirst({ where: { id: folderId, orgId }, select: { id: true, name: true, diskSlug: true } }),
    ]);
    if (!asset || !folder) return;

    // Thư mục tạo trước khi có tính năng này → chưa có slug, tạo bù bây giờ.
    const slug = folder.diskSlug ?? (await createFolderOnDisk(folder.id, folder.name));
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

/** Đổi tên thư mục kho → đổi tên thư mục đĩa + cập nhật slug trong DB. */
export async function renameFolderOnDisk(orgId: string, folderId: string, newName: string): Promise<void> {
  if (!isFolderMirrorEnabled()) return;
  try {
    const folder = await prisma.mediaAlbum.findFirst({
      where: { id: folderId, orgId }, select: { id: true, diskSlug: true },
    });
    if (!folder) return;
    const slug = await renameFolderDir(folder.id, folder.diskSlug, newName);
    if (slug && slug !== folder.diskSlug) {
      await prisma.mediaAlbum.update({ where: { id: folder.id }, data: { diskSlug: slug } });
    }
  } catch (err) {
    logger.warn(`[media-folder] đổi tên thư mục đĩa lỗi (${folderId}):`, (err as Error)?.message ?? err);
  }
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
