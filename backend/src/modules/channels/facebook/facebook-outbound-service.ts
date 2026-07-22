/**
 * facebook-outbound-service.ts — gửi tin Messenger từ CRM (multi-channel Phase 2, 2026-07-21).
 *
 * Sale trả lời hội thoại FB trong /chat → route gọi hàm này: driver.sendMessage (Graph API) →
 * lưu Message outbound (senderType='self') → cập nhật hội thoại → emit 'chat:message'.
 * PHẢI chạy trong tenant context (route đã có qua authMiddleware).
 */
import type { Server } from 'socket.io';
import { prisma } from '../../../shared/database/prisma-client.js';
import { emitChatMessage } from '../../../shared/realtime/emit-chat.js';
import { facebookDriver } from './facebook-driver.js';
import { loadPageAccountRef } from './facebook-pages.js';

export interface SendFacebookInput {
  orgId: string;
  conversationId: string;
  facebookPageAccountId: string;
  externalThreadId: string; // PSID KH
  content: string;
  repliedByUserId: string;
}

/** Kết quả: Message đã tạo (serialize-safe) để trả HTTP + đã emit socket. */
export async function sendFacebookMessage(io: Server | undefined | null, input: SendFacebookInput) {
  const ref = await loadPageAccountRef(input.facebookPageAccountId);
  if (!ref) throw new Error('PAGE_NOT_CONNECTED'); // chưa connect Page / token hỏng.

  // 1) Gọi Graph API gửi tin.
  const sent = await facebookDriver.sendMessage(ref, input.externalThreadId, { text: input.content });

  // 2) Lưu Message outbound (dedup echo webhook sau qua externalMsgId).
  const message = await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      externalMsgId: sent.externalMsgId,
      senderType: 'self',
      content: input.content,
      contentType: 'text',
      sentAt: sent.sentAt,
      repliedByUserId: input.repliedByUserId,
      isLocal: false,
      sentVia: 'user',
    },
  });

  // 3) Cập nhật hội thoại (đã trả lời, clear unread).
  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { lastMessageAt: sent.sentAt, isReplied: true, unreadCount: 0 },
  });

  // 4) Emit realtime (FB không có nick riêng tư → privacyMode='sub').
  await emitChatMessage({
    io,
    orgId: input.orgId,
    accountId: input.facebookPageAccountId,
    conversationId: input.conversationId,
    message,
    privacyMode: 'sub',
    ownerUserId: null,
  });

  return message;
}
