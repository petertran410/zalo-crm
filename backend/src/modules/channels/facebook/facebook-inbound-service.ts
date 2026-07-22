/**
 * facebook-inbound-service.ts — ghi tin Messenger inbound vào Conversation/Message + emit socket.
 * (multi-channel Phase 2, 2026-07-21)
 *
 * Nhận danh sách tin ĐÃ chuẩn hoá (facebookDriver.normalizeWebhook) → upsert hội thoại theo
 * (facebookPageAccountId, externalThreadId=PSID KH), dedup theo externalMsgId, tạo Message,
 * cập nhật counter hội thoại, phát 'chat:message'. PHẢI chạy trong withTenant(orgId) —
 * Conversation org-scoped. FB không có nick riêng tư → privacyMode='sub', ownerUserId=null.
 *
 * v1: chưa resolve Contact từ PSID (contactId=null) — hội thoại vẫn hiện, gắn KH để sau.
 */
import type { Server } from 'socket.io';
import { prisma } from '../../../shared/database/prisma-client.js';
import { emitChatMessage } from '../../../shared/realtime/emit-chat.js';
import { logger } from '../../../shared/utils/logger.js';
import type { NormalizedInboundMessage } from '../channel-driver.js';
import { facebookDriver } from './facebook-driver.js';
import { loadPageAccountRef } from './facebook-pages.js';

// Cache tên KH theo PSID (tránh gọi Graph mỗi tin). TTL 6h — tên đổi hiếm.
const nameCache = new Map<string, { name: string | null; ts: number }>();
const NAME_TTL_MS = 6 * 60 * 60 * 1000;

async function resolveSenderName(accessToken: string | null, psid: string): Promise<string | null> {
  const hit = nameCache.get(psid);
  if (hit && Date.now() - hit.ts < NAME_TTL_MS) return hit.name;
  if (!accessToken) return hit?.name ?? null;
  const name = await facebookDriver.getUserProfileName({ id: '', externalId: '', accessToken }, psid);
  nameCache.set(psid, { name, ts: Date.now() });
  return name;
}

// Map loại attachment FB → contentType nội bộ (Message.contentType).
function toContentType(msg: NormalizedInboundMessage): string {
  if (msg.attachments.length === 0) return 'text';
  const t = msg.attachments[0].type;
  if (t === 'image') return 'image';
  if (t === 'video') return 'video';
  if (t === 'audio') return 'voice';
  return 'file';
}

export interface PersistInboundResult {
  created: number;
  skipped: number; // trùng externalMsgId
}

/**
 * Ghi + emit các tin inbound của 1 Page. Trả số tin tạo mới / bỏ qua (dedup).
 * Chạy trong withTenant(orgId).
 */
export async function persistInboundMessages(
  io: Server | undefined | null,
  orgId: string,
  facebookPageAccountId: string,
  messages: NormalizedInboundMessage[],
): Promise<PersistInboundResult> {
  let created = 0;
  let skipped = 0;

  // Nạp token Page 1 lần để enrich tên KH (chỉ khi có tin inbound). Lỗi → bỏ qua enrich.
  const hasInbound = messages.some((m) => m.direction === 'inbound');
  const pageRef = hasInbound ? await loadPageAccountRef(facebookPageAccountId) : null;

  for (const m of messages) {
    try {
      const isInbound = m.direction === 'inbound';

      // 1) Upsert hội thoại theo (page, thread). Non-null cả 2 → dùng compound unique.
      const conv = await prisma.conversation.upsert({
        where: {
          facebookPageAccountId_externalThreadId: {
            facebookPageAccountId,
            externalThreadId: m.externalThreadId,
          },
        },
        create: {
          orgId,
          zaloAccountId: null,
          channel: 'facebook',
          facebookPageAccountId,
          externalThreadId: m.externalThreadId,
          threadType: 'user',
          contactId: null,
          tab: 'main',
          lastMessageAt: m.sentAt,
          unreadCount: isInbound ? 1 : 0,
          isReplied: !isInbound,
        },
        update: {
          lastMessageAt: m.sentAt,
          ...(isInbound ? { unreadCount: { increment: 1 }, isReplied: false } : {}),
        },
        select: { id: true },
      });

      // 2) Dedup theo externalMsgId trong hội thoại (webhook có thể gửi lại).
      const existing = await prisma.message.findFirst({
        where: { conversationId: conv.id, externalMsgId: m.externalMsgId },
        select: { id: true },
      });
      if (existing) { skipped++; continue; }

      // Enrich tên KH cho tin inbound (Graph User Profile API, cache theo PSID).
      const senderName = isInbound
        ? await resolveSenderName(pageRef?.accessToken ?? null, m.senderExternalId)
        : null;

      // 3) Tạo Message.
      const message = await prisma.message.create({
        data: {
          conversationId: conv.id,
          externalMsgId: m.externalMsgId,
          senderType: isInbound ? 'contact' : 'self',
          senderUid: m.senderExternalId,
          senderName,
          content: m.text,
          contentType: toContentType(m),
          attachments: m.attachments,
          sentAt: m.sentAt,
          isLocal: false,
        },
      });
      created++;

      // 4) Emit realtime (accountId = page account id; FB không có nick riêng tư).
      await emitChatMessage({
        io,
        orgId,
        accountId: facebookPageAccountId,
        conversationId: conv.id,
        message,
        privacyMode: 'sub',
        ownerUserId: null,
      });
    } catch (err) {
      logger.error(`[fb-inbound] ghi tin lỗi (mid=${m.externalMsgId}):`, err);
    }
  }

  return { created, skipped };
}
