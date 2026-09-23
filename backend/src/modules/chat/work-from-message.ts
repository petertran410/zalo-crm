/**
 * work-from-message.ts — "Tạo công việc / khiếu nại từ 1 tin nhắn" trong chat nhóm (2026-07-10).
 *
 * Reading a group does not grant access to its CRM customer. Resolve the explicit
 * customer link independently of the sender; never create contacts or access rows.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { assertConversationReadAccess } from './conversation-access.js';
import { requireCustomer } from '../contacts/customer-workspace-service.js';

export interface WorkItemSource {
  conversationId: string;
  /** contactId người gửi (nếu tin của KH); null nếu tin do nick/nhân viên (self) gửi. */
  contactId: string | null;
  senderIsCustomer: boolean;
  messageText: string | null;
}

/**
 * Xác thực + resolve nguồn tin nhắn. Trả null nếu fail (reply ĐÃ được gửi bên trong).
 * Customer access is checked separately from conversation access.
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
      conversation: { select: { zaloAccountId: true, contactId: true, threadType: true, customerLink: true } },
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

  const linkedContactId = message.conversation.customerLink?.contactId
    ?? (message.conversation.threadType === 'user' ? message.conversation.contactId : null);
  if (linkedContactId) {
    try {
      await requireCustomer(user, linkedContactId);
      contactId = linkedContactId;
    } catch (err) {
      reply.status(403).send({ error: 'Có quyền đọc nhóm không đồng nghĩa có quyền truy cập hồ sơ khách hàng.' });
      return null;
    }
  }

  return {
    conversationId: message.conversationId,
    contactId,
    senderIsCustomer,
    messageText: message.content,
  };
}
