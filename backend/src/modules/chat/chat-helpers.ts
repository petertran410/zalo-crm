/**
 * Chat helpers — shared utilities cho 11 writer site của Message.
 *
 * 2026-06-03 — Anh báo bug optimistic "Sale CRM · Staff":
 * Khi sale gõ tin trên CRM, BE insert Message rồi socket emit. Trước fix
 * Message thiếu metadata.sender.name + repliedBy relation → FE render
 * badge "Sale CRM · Staff" (fallback hardcoded). Sau reload mới đúng.
 *
 * Fix: 11 writer site (chat-routes + chat-operations + chat-attachment)
 * dùng helper này để build sender metadata + lookup userFullName 1 lần
 * per request.
 */

import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';

const userNameCache = new Map<string, { name: string; ts: number }>();
const CACHE_TTL_MS = 5 * 60_000; // 5 phút

/**
 * Lookup User.fullName với cache 5 phút. Giảm 1 DB roundtrip mỗi tin gửi
 * (sale gõ liên tục → cùng userId → cache hit).
 */
export async function getUserFullName(userId: string): Promise<string> {
  const cached = userNameCache.get(userId);
  const now = Date.now();
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.name;

  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true, email: true },
  });
  const name = u?.fullName?.trim() || u?.email?.split('@')[0] || 'Sale';
  userNameCache.set(userId, { name, ts: now });
  return name;
}

/**
 * Build M11 metadata.sender cho tin sale gõ qua CRM.
 * Đảm bảo FE MessageSourceBadge render badge "Sale CRM · {tên}" ngay
 * optimistic, không đợi reload.
 */
export function buildSaleCrmSenderMeta(userFullName: string) {
  return {
    sender: { kind: 'user_crm' as const, name: userFullName },
  };
}

/**
 * buildReplyQuote / mapReplyMsgType — moved từ chat-routes.ts (2026-07-27) để
 * zalo-pending-send-queue.ts (flush tin nhắn queue offline) dùng lại được mà
 * KHÔNG import ngược chat-routes.ts (tránh circular import — chat-routes.ts
 * gọi enqueuePendingFlush từ module đó).
 */
export function mapReplyMsgType(contentType: string): string {
  if (contentType === 'text') return 'webchat';
  if (contentType === 'image') return 'photo';
  if (contentType === 'file') return 'file';
  if (contentType === 'video') return 'video';
  if (contentType === 'voice') return 'voice';
  if (contentType === 'sticker') return 'sticker';
  if (contentType === 'gif') return 'gif';
  if (contentType === 'link') return 'link';
  if (contentType === 'location') return 'location';
  if (contentType === 'contact_card') return 'card';
  if (contentType === 'bank_transfer') return 'bank';
  if (contentType === 'call') return 'call';
  if (contentType === 'qr_code') return 'qr';
  if (contentType === 'reminder') return 'remind';
  if (contentType === 'poll') return 'poll';
  if (contentType === 'note') return 'note';
  if (contentType === 'forwarded') return 'forward';
  return contentType;
}

export function buildReplyQuote(message: {
  zaloMsgId: string | null;
  senderUid: string | null;
  content: string | null;
  contentType: string;
  sentAt: Date;
}) {
  if (!message.zaloMsgId || !message.senderUid) return null;
  let quoteContent = message.content ?? '';
  if (['image', 'video', 'file'].includes(message.contentType) && quoteContent.startsWith('{')) {
    try {
      const p = JSON.parse(quoteContent);
      if (message.contentType === 'image') quoteContent = '[Hình ảnh]';
      else if (message.contentType === 'video') quoteContent = '[Video]';
      else quoteContent = `[Tệp] ${p.name || ''}`.trim();
    } catch {
      quoteContent = `[${message.contentType}]`;
    }
  }
  return {
    content: quoteContent,
    msgType: mapReplyMsgType(message.contentType),
    propertyExt: {},
    uidFrom: message.senderUid,
    msgId: message.zaloMsgId,
    cliMsgId: message.zaloMsgId,
    ts: String(message.sentAt.getTime()),
    ttl: 0,
  };
}

/**
 * createMediaMessage — Phase Media Library 2026-06-11 (eng review E4 / DRY).
 *
 * Gộp 4 block prisma.message.create LẶP trong chat-attachment-routes
 * (image batch / video-success / video-fallback / file) thành 1 helper.
 * Trước: 4 chỗ copy cùng base (id/zaloMsgId/senderType/senderUid/...) chỉ khác
 * content+contentType → sửa privacy/field 1 chỗ phải nhớ 4 chỗ. Giờ 1 nguồn.
 *
 * Caller chỉ truyền phần KHÁC NHAU: contentType + content (đã JSON.stringify)
 * + tùy chọn sentVia/metadata. Phần chung (sender self, senderName Staff,
 * sentAt, repliedByUserId) helper tự điền.
 */
export interface CreateMediaMessageInput {
  conversationId: string;
  zaloAccount: { zaloUid: string | null };
  repliedByUserId: string;
  zaloMsgId: string; // '' nếu chưa có
  contentType: 'image' | 'video' | 'file';
  content: string; // đã JSON.stringify
  /** M11 sender metadata (badge "Sale CRM · {tên}"). image/video truyền; file legacy có thể bỏ. */
  metadata?: Record<string, unknown>;
  /** 'user' cho image/video (đường gửi mới). file legacy để mặc định (undefined). */
  sentVia?: string;
}

export async function createMediaMessage(input: CreateMediaMessageInput) {
  const { zaloMsgId } = input;
  return prisma.message.create({
    data: {
      id: randomUUID(),
      conversationId: input.conversationId,
      zaloMsgId: zaloMsgId || null,
      zaloMsgIdNum: zaloMsgId && /^\d+$/.test(zaloMsgId) ? BigInt(zaloMsgId) : null,
      senderType: 'self',
      senderUid: input.zaloAccount.zaloUid || '',
      senderName: 'Staff',
      sentVia: input.sentVia,
      metadata: input.metadata,
      content: input.content,
      contentType: input.contentType,
      sentAt: new Date(),
      repliedByUserId: input.repliedByUserId,
    },
  });
}
