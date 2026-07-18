/**
 * visibility.ts — kiểm tra user có được attach MediaAsset vào work item không.
 * Rule: public OR owner OR media.view_all grant. Fail-closed.
 */
import { prisma } from '../database/prisma-client.js';

export async function assertCanAttachMedia(args: {
  orgId: string;
  userId: string;
  mediaAssetId: string;
  canViewAll?: boolean;
}): Promise<{ id: string; kind: string; name: string; thumbnailUrl: string | null } | null> {
  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: args.mediaAssetId,
      orgId: args.orgId,
      archivedAt: null,
      ...(args.canViewAll
        ? {}
        : { OR: [{ ownerUserId: args.userId }, { visibility: 'public' }] }),
    },
    select: { id: true, kind: true, name: true, thumbnailUrl: true },
  });
  return asset;
}

export async function assertCanUseVariantBlob(args: {
  orgId: string;
  mediaAssetId: string;
  variantBlobId: string;
}): Promise<boolean> {
  const blob = await prisma.mediaBlob.findFirst({
    where: {
      id: args.variantBlobId,
      orgId: args.orgId,
      assetId: args.mediaAssetId,
      variantType: { in: ['annotated', 'watermarked', 'original'] },
    },
    select: { id: true },
  });
  return !!blob;
}
