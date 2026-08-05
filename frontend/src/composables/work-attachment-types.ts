/** Shared types for Task/Ticket media attachments (V1 2026-07-13). */

export type WorkMediaKind = 'image' | 'video' | 'file';

export interface WorkAttachmentMedia {
  id: string;
  kind: WorkMediaKind;
  name: string;
  thumbnailUrl: string | null;
  url: string | null;
  sizeBytes: number | null;
}

export interface WorkAttachmentVariant {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
}

export interface WorkAttachment {
  id: string;
  mediaAssetId: string;
  sourceMessageId: string | null;
  position: number;
  variantBlobId: string | null;
  createdAt: string;
  mediaAsset: WorkAttachmentMedia;
  variantBlob: WorkAttachmentVariant | null;
}

/** Local attachment in WorkItemEditor before/after submit. */
export interface WorkAttachLocal {
  /** Local key (mediaAssetId or messageId) */
  key: string;
  /** Có khi đã có trong kho Media; rỗng khi chỉ chọn từ gallery chat (chưa save-from-chat). */
  mediaAssetId: string;
  name: string;
  kind: WorkMediaKind;
  thumbnailUrl: string | null;
  url: string | null;
  sizeBytes: number | null;
  variantBlobId: string | null;
  variantUrl: string | null;
  /** Server attachment id after create (for post-create manage) */
  attachmentId?: string | null;
  /** Tin nhắn nguồn trong hội thoại Zalo — BE save-from-chat rồi attach. */
  sourceMessageId?: string | null;
}

/** 1 mục trong gallery media của hội thoại (GET /conversations/:id/media). */
export interface ConversationMediaItem {
  messageId: string;
  kind: WorkMediaKind;
  url: string | null;
  thumbnailUrl: string | null;
  name: string;
  senderName: string | null;
  senderType: string;
  sentAt: string;
  albumKey: string | null;
  albumIndex: number | null;
  albumTotal: number | null;
}

export interface WorkAttachmentInput {
  mediaAssetId: string;
  variantBlobId?: string | null;
  sourceMessageId?: string | null;
}

export function displayAttachUrl(a: Pick<WorkAttachLocal, 'variantUrl' | 'thumbnailUrl' | 'url'>): string | null {
  return a.variantUrl || a.thumbnailUrl || a.url || null;
}

export function attachmentToLocal(att: WorkAttachment): WorkAttachLocal {
  return {
    key: att.mediaAssetId,
    mediaAssetId: att.mediaAssetId,
    name: att.mediaAsset.name,
    kind: att.mediaAsset.kind,
    thumbnailUrl: att.mediaAsset.thumbnailUrl,
    url: att.mediaAsset.url,
    sizeBytes: att.mediaAsset.sizeBytes,
    variantBlobId: att.variantBlobId,
    variantUrl: att.variantBlob?.url ?? null,
    attachmentId: att.id,
    sourceMessageId: att.sourceMessageId,
  };
}
