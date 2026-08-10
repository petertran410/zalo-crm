/**
 * Cầu nối giữa DB và thư mục thật trên đĩa (shared/storage/folder-mirror.ts).
 * Mọi hàm ở đây fire-and-forget được: nguồn sự thật là DB, thư mục đĩa hỏng thì kho vẫn chạy.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { keyFromPublicUrl } from '../../shared/storage/minio-client.js';
import {
  ensureFolderDirExact,
  linkIntoFolder,
  unlinkFromFolder,
  renameFolderDir,
  removeFolderDir,
  isFolderMirrorEnabled,
  joinFolderSlug,
} from '../../shared/storage/folder-mirror.js';
import { safeFolderSlug, slugifyFolderName } from '../../shared/folder-slug.js';
import { logger } from '../../shared/utils/logger.js';

/**
 * So bằng chuỗi đã bỏ dấu, đúng bằng lớp tương đương gây đụng thư mục đĩa: "Việt Nam",
 * "việt nam", "viet-nam" đều ra "viet_nam" nên với người dùng chúng là một tên.
 */
export function isSameFolderName(a: string, b: string): boolean {
  const sa = slugifyFolderName(a);
  const sb = slugifyFolderName(b);
  // Tên toàn emoji slug ra rỗng, coi như khác nhau để không chặn oan mọi tên lạ.
  if (!sa || !sb) return false;
  return sa === sb;
}

/** `excludeId` để lúc đổi tên không tự so với chính mình. */
export async function findSiblingWithSameName(
  orgId: string,
  parentId: string | null,
  name: string,
  excludeId?: string,
): Promise<{ id: string; name: string } | null> {
  const siblings = await prisma.mediaAlbum.findMany({
    where: {
      orgId,
      parentId: parentId ?? null,
      kind: 'folder',
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, name: true },
  });
  return siblings.find((s) => isSameFolderName(s.name, name)) ?? null;
}

/** Vừa chặn dựng cây vô hạn, vừa là lưới an toàn nếu dữ liệu cũ lỡ có vòng lặp cha con. */
export const MAX_FOLDER_DEPTH = 10;

/**
 * Lưới an toàn cho dữ liệu cũ đã trùng slug từ trước khi có luật chặn trùng tên: hai thư
 * mục dùng chung một thư mục đĩa thì xoá cái này sẽ cuốn luôn liên kết của cái kia.
 */
async function uniqueFolderSlug(
  orgId: string,
  folderId: string,
  name: string,
  parentSlug: string | null,
): Promise<string> {
  return pickFreeFolderSlug(name, folderId, parentSlug, async (slug) => {
    const taken = await prisma.mediaAlbum.findFirst({
      where: { orgId, diskSlug: slug, NOT: { id: folderId } },
      select: { id: true },
    });
    return !!taken;
  });
}

/**
 * Phần thuần của uniqueFolderSlug, tách ra để thử được mà không cần DB.
 * `isTaken` trả true nếu đường dẫn slug đó đã có thư mục khác chiếm.
 */
export async function pickFreeFolderSlug(
  name: string,
  folderId: string,
  parentSlug: string | null,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = safeFolderSlug(name, folderId);
  for (let i = 1; i <= 50; i++) {
    const candidate = joinFolderSlug(parentSlug, i === 1 ? base : `${base}_${i}`);
    if (!(await isTaken(candidate))) return candidate;
  }
  // 50 thư mục cùng tên một cấp là cực hiếm, rơi về id cho chắc chắn không đụng.
  return joinFolderSlug(parentSlug, `${base}_${folderId.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase()}`);
}

/** Thư mục tạo trước khi có tính năng mirror thì chưa có slug, tạo bù để cây con khỏi treo ở gốc. */
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

/** slug là đường dẫn tương đối nhiều cấp ("viet_nam/bao_gia"), dựng bằng cách nối slug của cha. */
export async function createFolderOnDisk(
  folderId: string,
  name: string,
  parentId?: string | null,
): Promise<string | null> {
  if (!isFolderMirrorEnabled()) return null;
  try {
    const folder = await prisma.mediaAlbum.findUnique({ where: { id: folderId }, select: { orgId: true } });
    if (!folder) return null;
    const unique = await uniqueFolderSlug(folder.orgId, folderId, name, await parentSlugOf(parentId));
    const slug = await ensureFolderDirExact(unique, folderId);
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
 * Chỉ gỡ tên, byte trong kho phẳng giữ nguyên nên tệp không hề mất.
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
 * Rename trên đĩa kéo theo cả cây con trong một lệnh, nhưng diskSlug của con cháu trong DB
 * là chuỗi đường dẫn nên trỏ sai và phải viết lại tiền tố, nếu không lần tải tệp kế tiếp
 * vào thư mục con sẽ mkdir lại cây cũ ở chỗ cũ.
 */
export async function renameFolderOnDisk(orgId: string, folderId: string, newName: string): Promise<void> {
  if (!isFolderMirrorEnabled()) return;
  try {
    const folder = await prisma.mediaAlbum.findFirst({
      where: { id: folderId, orgId }, select: { id: true, diskSlug: true, parentId: true },
    });
    if (!folder) return;
    const oldSlug = folder.diskSlug;
    const target = await uniqueFolderSlug(orgId, folder.id, newName, await parentSlugOf(folder.parentId));
    const slug = await renameFolderDir(folder.id, oldSlug, target);
    if (!slug || slug === oldSlug) return;

    await prisma.mediaAlbum.update({ where: { id: folder.id }, data: { diskSlug: slug } });

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

/** Mọi id thư mục con cháu của `rootId`, không gồm chính nó. */
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

/** Số tầng từ gốc tới thư mục này, gốc = 0. */
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
 * Byte trong kho phẳng vẫn giữ nguyên.
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
