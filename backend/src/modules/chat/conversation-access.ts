import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';

/**
 * Validates that the current user may read a conversation before chat-derived
 * actions (such as creating a task or ticket) use its content.
 */
export async function assertConversationReadAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  conversationId: string,
) {
  const user = request.user!;
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, orgId: user.orgId },
    select: { id: true, zaloAccountId: true },
  });
  if (!conversation) {
    reply.status(404).send({ error: 'Conversation not found' });
    return null;
  }
  if (['owner', 'admin'].includes(user.role)) return conversation;

  // Facebook and other non-Zalo conversations are not constrained by a Zalo
  // account access row.
  if (!conversation.zaloAccountId) return conversation;

  const access = await prisma.zaloAccountAccess.findFirst({
    where: { zaloAccountId: conversation.zaloAccountId, userId: user.id },
    select: { permission: true },
  });
  if (!access) {
    reply.status(403).send({ error: 'Không có quyền truy cập tài khoản Zalo này' });
    return null;
  }
  return conversation;
}
