/**
 * work-from-message.ts — "Tạo công việc / khiếu nại từ 1 tin nhắn" trong chat nhóm (2026-07-10).
 *
 * Bối cảnh: nhóm gồm nhiều KH + nhiều nhân viên. BẤT KỲ nhân viên nào ở trong nhóm được tạo
 * task/ticket thẳng từ tin nhắn (khiếu nại). Anh chốt:
 *   • Quyền = quyền ĐỌC hội thoại chứa tin (assertConversationReadAccess) = "ở trong nhóm".
 *     KHÔNG dùng contact-visibility (KH khiếu nại có thể chưa được gán cho nhân viên này).
 *   • Tin do KH gửi → resolve sender uid → Contact + TỰ CẤP quyền xem KH đó cho người tạo
 *     (ContactAccess) — "thành viên nhóm = có quyền".
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { assertConversationReadAccess } from '../ai/ai-routes.js';
import { resolveOrCreateContact } from '../contacts/resolve-contact.js';

export interface WorkItemSource {
  conversationId: string;
  /** contactId người gửi (nếu tin của KH); null nếu tin do nick/nhân viên (self) gửi. */
  contactId: string | null;
  senderIsCustomer: boolean;
  messageText: string | null;
}

/**
 * Xác thực + resolve nguồn tin nhắn. Trả null nếu fail (reply ĐÃ được gửi bên trong).
 * Grant ContactAccess best-effort (không chặn tạo nếu grant lỗi).
 */
export async function resolveWorkItemFromMessage(
  request: FastifyRequest,
  reply: FastifyReply,
  sourceMessageId: string,
): Promise<WorkItemSource | null> {
  const user = request.user!;

  const message = await prisma.message.findFirst({
    where: { id: sourceMessageId, conversation: { orgId: user.orgId } },
    select: {
      content: true,
      senderType: true,
      senderUid: true,
      conversationId: true,
      conversation: { select: { zaloAccountId: true } },
    },
  });
  if (!message) {
    reply.status(404).send({ error: 'Không tìm thấy tin nhắn nguồn' });
    return null;
  }

  // Auth: người tạo phải ĐỌC được hội thoại (owner/admin ∨ có zaloAccountAccess) = ở trong nhóm.
  const conv = await assertConversationReadAccess(request, reply, message.conversationId);
  if (!conv) return null; // reply đã gửi (404/403)

  let contactId: string | null = null;
  const senderIsCustomer = message.senderType !== 'self' && !!message.senderUid;

  if (senderIsCustomer && message.conversation?.zaloAccountId) {
    try {
      const resolved = await resolveOrCreateContact({
        orgId: user.orgId,
        zaloAccountId: message.conversation.zaloAccountId,
        zaloUidInNick: message.senderUid,
        enrichViaGetUserInfo: true,
      });
      contactId = resolved.id;
      // Tự cấp quyền xem KH cho người tạo (idempotent qua @@unique([contactId,userId])).
      await prisma.contactAccess.upsert({
        where: { contactId_userId: { contactId, userId: user.id } },
        create: { orgId: user.orgId, contactId, userId: user.id, role: 'collaborator', source: 'group_work' },
        update: {},
      });
    } catch (err) {
      logger.error('[work-from-message] resolve/grant contact error:', err);
      // best-effort: giữ senderIsCustomer=true nhưng contactId=null → caller quyết định chặn hay không.
    }
  }

  return {
    conversationId: message.conversationId,
    contactId,
    senderIsCustomer,
    messageText: message.content,
  };
}
