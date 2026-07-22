/**
 * facebook-inbound-service.ts — ghi tin Messenger inbound vào Conversation/Message + emit socket.
 * (multi-channel Phase 2, 2026-07-21)
 *
 * Nhận danh sách tin ĐÃ chuẩn hoá (facebookDriver.normalizeWebhook) → upsert hội thoại theo
 * (facebookPageAccountId, externalThreadId=PSID KH), dedup theo externalMsgId, tạo Message,
 * cập nhật counter hội thoại, phát 'chat:message'. PHẢI chạy trong withTenant(orgId) —
 * Conversation org-scoped. FB không có nick riêng tư → privacyMode='sub', ownerUserId=null.
 *
 * Hội thoại MỚI → tạo Contact (source='FB') gắn kèm, tên lấy từ Graph (Profile API, fallback
 * Conversations API) → tên KH hiển thị ở MỌI nơi trong CRM (tab chat chung, danh sách KH…).
 */
import type { Server } from 'socket.io';
import { prisma } from '../../../shared/database/prisma-client.js';
import { emitChatMessage } from '../../../shared/realtime/emit-chat.js';
import { logger } from '../../../shared/utils/logger.js';
import type { NormalizedInboundMessage, ChannelAccountRef } from '../channel-driver.js';
import { facebookDriver } from './facebook-driver.js';
import { loadPageAccountRef } from './facebook-pages.js';

// Cache tên KH theo PSID (tránh gọi Graph mỗi tin). TTL 6h — tên đổi hiếm.
const nameCache = new Map<string, { name: string | null; ts: number }>();
const NAME_TTL_MS = 6 * 60 * 60 * 1000;

async function resolveSenderName(ref: ChannelAccountRef | null, psid: string): Promise<string | null> {
  const hit = nameCache.get(psid);
  // Chỉ dùng cache khi ĐÃ có tên thật — cache null thì vẫn thử lại (tránh kẹt tên tạm).
  if (hit && hit.name && Date.now() - hit.ts < NAME_TTL_MS) return hit.name;
  if (!ref) return hit?.name ?? null;
  // Profile API trước, fallback Conversations API (chạy được cả với KH không có app role).
  const name = await facebookDriver.resolveUserName(ref, psid);
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

      // 1) Tìm hội thoại theo (page, thread). Tách find/create (không upsert) để CHỈ tạo
      //    Contact khi hội thoại thật sự mới — Contact là nơi tên KH hiển thị khắp CRM.
      let conv = await prisma.conversation.findUnique({
        where: {
          facebookPageAccountId_externalThreadId: {
            facebookPageAccountId,
            externalThreadId: m.externalThreadId,
          },
        },
        select: { id: true, contactId: true },
      });

      if (!conv) {
        // Hội thoại MỚI → tạo Contact gắn kèm (tên từ Graph; fallback theo PSID để luôn có tên).
        const name = await resolveSenderName(pageRef, m.externalThreadId);
        const contact = await prisma.contact.create({
          data: {
            orgId,
            fullName: name ?? `Facebook ${m.externalThreadId.slice(-6)}`,
            source: 'FB',
            sourceDate: m.sentAt,
            firstContactDate: m.sentAt,
            lastActivity: m.sentAt,
            metadata: { facebook: { psid: m.externalThreadId, pageAccountId: facebookPageAccountId } },
          },
          select: { id: true },
        });
        conv = await prisma.conversation.create({
          data: {
            orgId,
            zaloAccountId: null,
            channel: 'facebook',
            facebookPageAccountId,
            externalThreadId: m.externalThreadId,
            threadType: 'user',
            contactId: contact.id,
            tab: 'main',
            lastMessageAt: m.sentAt,
            unreadCount: isInbound ? 1 : 0,
            isReplied: !isInbound,
          },
          select: { id: true, contactId: true },
        });
      } else {
        await prisma.conversation.update({
          where: { id: conv.id },
          data: {
            lastMessageAt: m.sentAt,
            ...(isInbound ? { unreadCount: { increment: 1 }, isReplied: false } : {}),
          },
        });
        // Cập nhật hoạt động cuối của KH (để list/scoring dùng chung với Zalo).
        if (conv.contactId) {
          await prisma.contact.update({ where: { id: conv.contactId }, data: { lastActivity: m.sentAt } })
            .catch(() => {});
        }
      }

      // 2) Dedup theo externalMsgId trong hội thoại (webhook có thể gửi lại).
      const existing = await prisma.message.findFirst({
        where: { conversationId: conv.id, externalMsgId: m.externalMsgId },
        select: { id: true },
      });
      if (existing) { skipped++; continue; }

      // Enrich tên KH cho tin inbound (Graph: Profile API → fallback Conversations API).
      const senderName = isInbound
        ? await resolveSenderName(pageRef, m.senderExternalId)
        : null;

      // TỰ VÁ tên: lần đầu resolve có thể lỗi tạm (Graph 429/5xx) → Contact kẹt tên tạm
      // "Facebook xxxxxx" vĩnh viễn. Khi sau này lấy được tên thật thì cập nhật. updateMany +
      // điều kiện tên-tạm ở where = 1 query, KHÔNG đọc trước, KHÔNG ghi đè tên sale đã sửa tay.
      if (isInbound && senderName && conv.contactId) {
        await prisma.contact.updateMany({
          where: {
            id: conv.contactId,
            OR: [{ fullName: null }, { fullName: '' }, { fullName: { startsWith: 'Facebook ' } }],
          },
          data: { fullName: senderName },
        }).catch(() => {});
      }

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
