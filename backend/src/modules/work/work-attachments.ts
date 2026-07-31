/**
 * work-attachments.ts — shared helpers for Task/Ticket media attachments (V1 2026-07-13).
 *
 * - Auto-attach from sourceMessageIds via save-from-chat (image/video/file only)
 * - Manual attach via mediaAssetIds + optional variantBlobId (annotated)
 * - CRUD: list / reorder / patch variant / delete
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { assertCanAttachMedia, assertCanUseVariantBlob } from '../../shared/media/visibility.js';
import { saveOneMessageToMedia } from '../media/save-from-chat-helper.js';

export type WorkItemType = 'task' | 'ticket';

export const ATTACHMENT_MEDIA_INCLUDE = {
  mediaAsset: {
    select: {
      id: true,
      kind: true,
      name: true,
      thumbnailUrl: true,
      blobs: {
        where: { variantType: 'original' },
        select: { publicUrl: true, sizeBytes: true, width: true, height: true },
        take: 1,
      },
    },
  },
  variantBlob: {
    select: { id: true, publicUrl: true, width: true, height: true, sizeBytes: true },
  },
} as const;

export function mapAttachmentRow(row: {
  id: string;
  mediaAssetId: string;
  sourceMessageId: string | null;
  position: number;
  variantBlobId: string | null;
  createdAt: Date;
  mediaAsset: {
    id: string;
    kind: string;
    name: string;
    thumbnailUrl: string | null;
    blobs: Array<{ publicUrl: string; sizeBytes: number; width: number | null; height: number | null }>;
  };
  variantBlob: { id: string; publicUrl: string; width: number | null; height: number | null; sizeBytes: number } | null;
}) {
  const orig = row.mediaAsset.blobs[0];
  return {
    id: row.id,
    mediaAssetId: row.mediaAssetId,
    sourceMessageId: row.sourceMessageId,
    position: row.position,
    variantBlobId: row.variantBlobId,
    createdAt: row.createdAt.toISOString(),
    mediaAsset: {
      id: row.mediaAsset.id,
      kind: row.mediaAsset.kind as 'image' | 'video' | 'file',
      name: row.mediaAsset.name,
      thumbnailUrl: row.mediaAsset.thumbnailUrl,
      url: orig?.publicUrl ?? null,
      sizeBytes: orig?.sizeBytes ?? null,
    },
    variantBlob: row.variantBlob
      ? {
          id: row.variantBlob.id,
          url: row.variantBlob.publicUrl,
          width: row.variantBlob.width,
          height: row.variantBlob.height,
          sizeBytes: row.variantBlob.sizeBytes,
        }
      : null,
  };
}

/** Prisma include fragment for list endpoints (first 4 attachments). */
export const ATTACHMENTS_LIST_INCLUDE = {
  // Note: WorkItemAttachment is polymorphic — not a Prisma relation on Task/Ticket.
  // List endpoints fetch attachments separately via loadAttachmentsForItems.
} as const;

export async function loadAttachmentsForItems(
  orgId: string,
  workItemType: WorkItemType,
  workItemIds: string[],
  takePerItem = 4,
): Promise<Map<string, ReturnType<typeof mapAttachmentRow>[]>> {
  const map = new Map<string, ReturnType<typeof mapAttachmentRow>[]>();
  if (!workItemIds.length) return map;

  const rows = await prisma.workItemAttachment.findMany({
    where: { orgId, workItemType, workItemId: { in: workItemIds } },
    include: ATTACHMENT_MEDIA_INCLUDE,
    orderBy: [{ workItemId: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
  });

  for (const row of rows) {
    const list = map.get(row.workItemId) ?? [];
    if (list.length < takePerItem) list.push(mapAttachmentRow(row as any));
    map.set(row.workItemId, list);
  }
  return map;
}

export async function listAttachments(orgId: string, workItemType: WorkItemType, workItemId: string) {
  const rows = await prisma.workItemAttachment.findMany({
    where: { orgId, workItemType, workItemId },
    include: ATTACHMENT_MEDIA_INCLUDE,
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map((r) => mapAttachmentRow(r as any));
}

export type AttachmentInput = {
  mediaAssetId: string;
  variantBlobId?: string | null;
  sourceMessageId?: string | null;
};

/**
 * Resolve + attach media for a newly created work item.
 * - sourceMessageIds: auto save-from-chat then attach
 * - mediaAssetIds / attachments: manual pick (+ optional annotated variant)
 */
export async function attachMediaToWorkItem(args: {
  orgId: string;
  userId: string;
  workItemType: WorkItemType;
  workItemId: string;
  sourceMessageIds?: string[] | null;
  mediaAssetIds?: string[] | null;
  attachments?: AttachmentInput[] | null;
  canViewAllMedia?: boolean;
}): Promise<number> {
  const {
    orgId, userId, workItemType, workItemId,
    sourceMessageIds, mediaAssetIds, attachments, canViewAllMedia,
  } = args;

  // mediaAssetId → { variantBlobId?, sourceMessageId? }
  const plan = new Map<string, { variantBlobId: string | null; sourceMessageId: string | null }>();

  // 1) Auto from chat messages
  const msgIds = Array.isArray(sourceMessageIds)
    ? [...new Set(sourceMessageIds.filter(Boolean))].slice(0, 30)
    : [];
  for (const mid of msgIds) {
    try {
      const saved = await saveOneMessageToMedia({
        orgId, userId, messageId: mid, visibility: 'private',
      });
      if (saved.status === 'ok' && saved.asset) {
        if (!plan.has(saved.asset.id)) {
          plan.set(saved.asset.id, { variantBlobId: null, sourceMessageId: mid });
        }
      }
    } catch (err) {
      logger.warn(`[work-attachments] save-from-chat failed msg=${mid}:`, err);
    }
  }

  // 2) Explicit attachments array (preferred)
  if (Array.isArray(attachments)) {
    for (const a of attachments.slice(0, 30)) {
      if (!a?.mediaAssetId) continue;
      const prev = plan.get(a.mediaAssetId);
      plan.set(a.mediaAssetId, {
        variantBlobId: a.variantBlobId ?? prev?.variantBlobId ?? null,
        sourceMessageId: a.sourceMessageId ?? prev?.sourceMessageId ?? null,
      });
    }
  }

  // 3) Flat mediaAssetIds
  if (Array.isArray(mediaAssetIds)) {
    for (const id of mediaAssetIds.slice(0, 30)) {
      if (!id) continue;
      if (!plan.has(id)) plan.set(id, { variantBlobId: null, sourceMessageId: null });
    }
  }

  if (plan.size === 0) return 0;

  // Auth + variant validation
  const allowed: AttachmentInput[] = [];
  for (const [mediaAssetId, meta] of plan) {
    const asset = await assertCanAttachMedia({
      orgId, userId, mediaAssetId, canViewAll: canViewAllMedia,
    });
    if (!asset) {
      logger.warn(`[work-attachments] skip unreadable asset=${mediaAssetId} user=${userId}`);
      continue;
    }
    let variantBlobId = meta.variantBlobId;
    if (variantBlobId) {
      const ok = await assertCanUseVariantBlob({ orgId, mediaAssetId, variantBlobId });
      if (!ok) variantBlobId = null;
    }
    allowed.push({
      mediaAssetId,
      variantBlobId,
      sourceMessageId: meta.sourceMessageId,
    });
  }

  if (!allowed.length) return 0;

  // Existing max position
  const maxPos = await prisma.workItemAttachment.aggregate({
    where: { orgId, workItemType, workItemId },
    _max: { position: true },
  });
  let pos = (maxPos._max.position ?? -1) + 1;

  let created = 0;
  for (const a of allowed) {
    try {
      await prisma.workItemAttachment.create({
        data: {
          orgId,
          workItemType,
          workItemId,
          mediaAssetId: a.mediaAssetId,
          variantBlobId: a.variantBlobId || null,
          sourceMessageId: a.sourceMessageId || null,
          position: pos++,
          addedByUserId: userId,
        },
      });
      created++;
    } catch (err: any) {
      // Unique conflict = already attached — skip
      if (err?.code === 'P2002') continue;
      logger.error('[work-attachments] create error:', err);
    }
  }
  return created;
}

export async function reorderAttachments(args: {
  orgId: string;
  workItemType: WorkItemType;
  workItemId: string;
  attachmentIds: string[];
}): Promise<boolean> {
  const { orgId, workItemType, workItemId, attachmentIds } = args;
  if (!attachmentIds.length) return false;

  const existing = await prisma.workItemAttachment.findMany({
    where: { orgId, workItemType, workItemId },
    select: { id: true },
  });
  const existingSet = new Set(existing.map((e) => e.id));
  if (attachmentIds.some((id) => !existingSet.has(id))) return false;
  if (attachmentIds.length !== existing.length) return false;

  await prisma.$transaction(
    attachmentIds.map((id, i) =>
      prisma.workItemAttachment.update({
        where: { id },
        data: { position: i },
      }),
    ),
  );
  return true;
}

export async function deleteAttachment(args: {
  orgId: string;
  workItemType: WorkItemType;
  workItemId: string;
  attachmentId: string;
}): Promise<boolean> {
  const row = await prisma.workItemAttachment.findFirst({
    where: {
      id: args.attachmentId,
      orgId: args.orgId,
      workItemType: args.workItemType,
      workItemId: args.workItemId,
    },
  });
  if (!row) return false;
  await prisma.workItemAttachment.delete({ where: { id: row.id } });
  return true;
}

export async function patchAttachmentVariant(args: {
  orgId: string;
  workItemType: WorkItemType;
  workItemId: string;
  attachmentId: string;
  variantBlobId: string | null;
}): Promise<ReturnType<typeof mapAttachmentRow> | null> {
  const row = await prisma.workItemAttachment.findFirst({
    where: {
      id: args.attachmentId,
      orgId: args.orgId,
      workItemType: args.workItemType,
      workItemId: args.workItemId,
    },
  });
  if (!row) return null;

  if (args.variantBlobId) {
    const ok = await assertCanUseVariantBlob({
      orgId: args.orgId,
      mediaAssetId: row.mediaAssetId,
      variantBlobId: args.variantBlobId,
    });
    if (!ok) return null;
  }

  const updated = await prisma.workItemAttachment.update({
    where: { id: row.id },
    data: { variantBlobId: args.variantBlobId },
    include: ATTACHMENT_MEDIA_INCLUDE,
  });
  return mapAttachmentRow(updated as any);
}

async function loadWorkItemRow(
  workItemType: WorkItemType,
  orgId: string,
  id: string,
): Promise<{ id: string; assigneeUserId: string; createdByUserId: string | null } | null> {
  if (workItemType === 'ticket') {
    return prisma.ticket.findFirst({
      where: { id, orgId },
      select: { id: true, assigneeUserId: true, createdByUserId: true },
    });
  }
  return prisma.task.findFirst({
    where: { id, orgId },
    select: { id: true, assigneeUserId: true, createdByUserId: true },
  });
}

/** Register attachment routes on Fastify for a work-item type. */
export function registerWorkAttachmentRoutes(
  app: import('fastify').FastifyInstance,
  opts: {
    workItemType: WorkItemType;
    basePath: string; // e.g. '/api/v1/tickets'
    loadItem: (orgId: string, id: string) => Promise<{ id: string } | null>;
    canMutate: (user: { id: string; role: string }, item: any) => boolean;
  },
): void {
  const { workItemType, basePath, loadItem, canMutate } = opts;

  app.get(`${basePath}/:id/attachments`, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const item = await loadItem(user.orgId, request.params.id);
      if (!item) return reply.status(404).send({ error: 'Not found' });
      const attachments = await listAttachments(user.orgId, workItemType, item.id);
      return { attachments };
    } catch (err) {
      logger.error(`[${workItemType}] list attachments error:`, err);
      return reply.status(500).send({ error: 'Failed to list attachments' });
    }
  });

  app.post(`${basePath}/:id/attachments/reorder`, async (request: FastifyRequest<{
    Params: { id: string };
    Body: { attachmentIds?: string[] };
  }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const item = await loadWorkItemRow(workItemType, user.orgId, request.params.id);
      if (!item) return reply.status(404).send({ error: 'Not found' });
      if (!canMutate(user, item)) return reply.status(403).send({ error: 'Không có quyền sắp xếp' });
      const ids = request.body?.attachmentIds;
      if (!Array.isArray(ids) || !ids.length) return reply.status(400).send({ error: 'attachmentIds required' });
      const ok = await reorderAttachments({
        orgId: user.orgId, workItemType, workItemId: item.id, attachmentIds: ids,
      });
      if (!ok) return reply.status(400).send({ error: 'Danh sách attachment không hợp lệ' });
      const attachments = await listAttachments(user.orgId, workItemType, item.id);
      return { attachments };
    } catch (err) {
      logger.error(`[${workItemType}] reorder attachments error:`, err);
      return reply.status(500).send({ error: 'Failed to reorder' });
    }
  });

  app.patch(`${basePath}/:id/attachments/:attachmentId`, async (request: FastifyRequest<{
    Params: { id: string; attachmentId: string };
    Body: { variantBlobId?: string | null };
  }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const item = await loadWorkItemRow(workItemType, user.orgId, request.params.id);
      if (!item) return reply.status(404).send({ error: 'Not found' });
      if (!canMutate(user, item)) return reply.status(403).send({ error: 'Không có quyền sửa' });
      const updated = await patchAttachmentVariant({
        orgId: user.orgId,
        workItemType,
        workItemId: item.id,
        attachmentId: request.params.attachmentId,
        variantBlobId: request.body?.variantBlobId === undefined ? null : request.body.variantBlobId,
      });
      if (!updated) return reply.status(404).send({ error: 'Attachment not found or invalid variant' });
      return { attachment: updated };
    } catch (err) {
      logger.error(`[${workItemType}] patch attachment error:`, err);
      return reply.status(500).send({ error: 'Failed to update attachment' });
    }
  });

  app.delete(`${basePath}/:id/attachments/:attachmentId`, async (request: FastifyRequest<{
    Params: { id: string; attachmentId: string };
  }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const item = await loadWorkItemRow(workItemType, user.orgId, request.params.id);
      if (!item) return reply.status(404).send({ error: 'Not found' });
      if (!canMutate(user, item)) return reply.status(403).send({ error: 'Không có quyền xóa attachment' });
      const ok = await deleteAttachment({
        orgId: user.orgId,
        workItemType,
        workItemId: item.id,
        attachmentId: request.params.attachmentId,
      });
      if (!ok) return reply.status(404).send({ error: 'Attachment not found' });
      return { success: true };
    } catch (err) {
      logger.error(`[${workItemType}] delete attachment error:`, err);
      return reply.status(500).send({ error: 'Failed to delete attachment' });
    }
  });
}
