/**
 * ticket-routes.ts — Ticket (KH complaint/request) V1, 2026-07-09.
 *
 * Quyền (KHÔNG dùng requireGrant — theo pattern Task/appointments/notes):
 *   - Xem "Của tôi" (view=mine): mọi user — ticket mình được giao.
 *   - Xem "Tất cả" (view=all): owner/admin cả org; trưởng/phó phòng xem ticket giao cho
 *     user trong subtree phòng (visibleUserIds từ getContactScope); sale thường → 403.
 *   - Sửa/đổi status: admin/owner ∨ assignee ∨ người tạo (canMutateTicket).
 *   - Xóa: CHỈ người tạo hoặc owner/admin.
 *   - Sửa NỘI DUNG (PUT) khi status=resolved: BỊ CHẶN — phải "Mở lại" (PATCH status
 *     →in_progress) trước. Ngừa sửa nhầm case đã đóng (2026-07-10).
 *   - contactId BẮT BUỘC (2026-07-10): tạo mới thiếu KH → 400; sửa không được set về null
 *     (chỉ đổi sang KH khác) — ticket không rõ KH thì không ai xử lý được.
 *
 * Lifecycle: open → in_progress → resolved, resolved → in_progress (Mở lại — sửa lỗi
 * bấm nhầm "Đánh dấu xong", xem ticket-permissions.ts).
 *
 * AI draft: POST /conversations/:id/ticket-draft tái dùng generateAiOutput(type='summary')
 * có sẵn từ module ai — KHÔNG lưu ticket, chỉ trả draft {title, summary} để FE prefill form,
 * nhân viên xem lại + bấm "Tạo ticket" mới thực sự lưu (draft-then-confirm, không auto-create —
 * khớp AI_CAPABILITIES deny-by-default, xem ai-capabilities.ts).
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { logActivity, computeDiff } from '../activity/activity-logger.js';
import { assertContactVisible, getContactScope } from '../contacts/contact-scope.js';
import { assertConversationReadAccess, assertPrivacyAllowsAi } from '../ai/ai-routes.js';
import { resolveWorkItemFromMessage } from '../chat/work-from-message.js';
import { generateAiOutput } from '../ai/ai-service.js';
import {
  canMutateTicket, canDeleteTicket, isValidTicketTransition, TICKET_STATUSES,
} from './ticket-permissions.js';
import {
  attachMediaToWorkItem,
  loadAttachmentsForItems,
  registerWorkAttachmentRoutes,
} from '../work/work-attachments.js';

const TICKET_INCLUDE = {
  assignee:   { select: { id: true, fullName: true, email: true, avatarUrl: true } },
  createdBy:  { select: { id: true, fullName: true } },
  resolvedBy: { select: { id: true, fullName: true } },
  contact:    { select: { id: true, fullName: true, phone: true, avatarUrl: true } },
} as const;

const TITLE_MAX = 300;
const SUMMARY_MAX = 5000;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

/** entityType/entityId cho ActivityLog: ticket link KH → log lên timeline KH (entityType 'contact'). */
function ticketLogEntity(ticket: { id: string; contactId: string | null }): { entityType: string; entityId: string } {
  return ticket.contactId
    ? { entityType: 'contact', entityId: ticket.contactId }
    : { entityType: 'ticket', entityId: ticket.id };
}

/** Suy ra tiêu đề ngắn từ đoạn summary AI trả (câu đầu, cắt 80 ký tự) — nhân viên sửa lại tự do. */
function deriveTitleFromSummary(summary: string): string {
  const firstSentence = summary.split(/[.!?\n]/)[0]?.trim() || '';
  const title = firstSentence.slice(0, 80).trim();
  return title || 'Ticket mới';
}

function aiErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('AI is disabled')) return 'Tính năng AI đang tắt cho tổ chức này';
  if (msg.includes('quota exceeded')) return 'Đã hết lượt dùng AI hôm nay';
  if (msg.includes('provider key is not configured')) return 'Chưa cấu hình AI provider';
  return 'Không thể tạo tóm tắt tự động, vui lòng nhập thủ công';
}

export async function ticketsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  registerWorkAttachmentRoutes(app, {
    workItemType: 'ticket',
    basePath: '/api/v1/tickets',
    loadItem: (orgId, id) => prisma.ticket.findFirst({ where: { id, orgId }, select: { id: true } }),
    canMutate: canMutateTicket,
  });

  // ── GET /api/v1/tickets ──────────────────────────────────────────────────────
  // Query: view=mine|all, status=open|in_progress|resolved|all (mặc định: chưa resolved),
  //        priority?, contactId?, assigneeUserId? (chỉ view=all), page=1, limit=50.
  app.get('/api/v1/tickets', async (request: FastifyRequest<{
    Querystring: { view?: string; status?: string; priority?: string; contactId?: string; assigneeUserId?: string; page?: string; limit?: string };
  }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const view = request.query.view === 'all' ? 'all' : 'mine';
      const page = Math.max(1, parseInt(request.query.page || '1', 10) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(request.query.limit || '50', 10) || 50));

      const where: Record<string, unknown> = { orgId: user.orgId };

      const statusParam = request.query.status;
      if ((TICKET_STATUSES as readonly string[]).includes(statusParam || '')) {
        where.status = statusParam;
      } else if (statusParam !== 'all') {
        where.status = { in: ['open', 'in_progress'] }; // mặc định: chưa resolved
      }

      if (PRIORITIES.includes(request.query.priority as (typeof PRIORITIES)[number])) {
        where.priority = request.query.priority;
      }

      if (view === 'mine') {
        where.assigneeUserId = user.id;
      } else {
        const isOrgAdmin = user.role === 'owner' || user.role === 'admin';
        if (!isOrgAdmin) {
          const scope = await getContactScope(user.id, user.orgId, user.role);
          if (scope.visibleUserIds.size <= 1) {
            return reply.status(403).send({ error: 'Chỉ quản lý mới xem được tất cả ticket' });
          }
          where.assigneeUserId = { in: Array.from(scope.visibleUserIds) };
        }
        if (request.query.assigneeUserId) {
          const requested = request.query.assigneeUserId;
          if (!isOrgAdmin) {
            const allowed = (where.assigneeUserId as { in: string[] } | undefined)?.in ?? [];
            if (!allowed.includes(requested)) {
              return reply.status(403).send({ error: 'Không có quyền xem ticket của người này' });
            }
          }
          where.assigneeUserId = requested;
        }
      }

      if (request.query.contactId) {
        const visible = await assertContactVisible({
          userId: user.id, orgId: user.orgId, legacyRole: user.role, contactId: request.query.contactId,
        });
        if (!visible) return reply.status(404).send({ error: 'Contact not found' });
        where.contactId = request.query.contactId;
      }

      const [tickets, total] = await Promise.all([
        prisma.ticket.findMany({
          where,
          include: TICKET_INCLUDE,
          orderBy: [{ createdAt: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.ticket.count({ where }),
      ]);

      const attMap = await loadAttachmentsForItems(user.orgId, 'ticket', tickets.map((t) => t.id), 4);
      const withAtt = tickets.map((t) => ({ ...t, attachments: attMap.get(t.id) ?? [] }));
      return { tickets: withAtt, total, page, limit };
    } catch (err) {
      logger.error('[tickets] List error:', err);
      return reply.status(500).send({ error: 'Failed to fetch tickets' });
    }
  });

  // ── GET /api/v1/contacts/:contactId/tickets ────────────────────────────────
  app.get('/api/v1/contacts/:contactId/tickets', async (request: FastifyRequest<{ Params: { contactId: string } }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { contactId } = request.params;

      const visible = await assertContactVisible({
        userId: user.id, orgId: user.orgId, legacyRole: user.role, contactId,
      });
      if (!visible) return reply.status(404).send({ error: 'Contact not found' });
      const contact = await prisma.contact.findFirst({ where: { id: contactId, orgId: user.orgId }, select: { id: true } });
      if (!contact) return reply.status(404).send({ error: 'Contact not found' });

      const tickets = await prisma.ticket.findMany({
        where: { orgId: user.orgId, contactId },
        include: TICKET_INCLUDE,
        orderBy: [{ createdAt: 'desc' }],
      });
      // resolved xuống cuối — chưa xử lý xong nổi lên trên (giống Task open-first).
      tickets.sort((a, b) => {
        const aDone = a.status === 'resolved' ? 1 : 0;
        const bDone = b.status === 'resolved' ? 1 : 0;
        return aDone - bDone;
      });

      const attMap = await loadAttachmentsForItems(user.orgId, 'ticket', tickets.map((t) => t.id), 4);
      const withAtt = tickets.map((t) => ({ ...t, attachments: attMap.get(t.id) ?? [] }));
      return { tickets: withAtt, total: withAtt.length };
    } catch (err) {
      logger.error('[tickets] Contact list error:', err);
      return reply.status(500).send({ error: 'Failed to fetch tickets' });
    }
  });

  // ── POST /api/v1/conversations/:id/ticket-draft ────────────────────────────
  // Draft-then-confirm: gọi AI tóm tắt hội thoại, trả về {title, summary} CHƯA LƯU.
  // Lỗi AI (quota/disabled/provider) → 200 kèm draft=null + warning, KHÔNG throw — để FE
  // fallback sang form thủ công thay vì chặn tạo ticket hoàn toàn.
  app.post('/api/v1/conversations/:id/ticket-draft', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const conversationId = request.params.id;
      const access = await assertConversationReadAccess(request, reply, conversationId);
      if (!access) return; // reply đã gửi bên trong helper
      if (!(await assertPrivacyAllowsAi(request, reply, conversationId))) return;

      const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { contactId: true } });

      try {
        const result = await generateAiOutput({ orgId: request.user!.orgId, conversationId, type: 'summary' });
        // generateAiOutput trả union (sentiment có {label,reason} khác summary có {content}) —
        // TS không narrow theo input.type tại call site, guard bằng 'in' cho an toàn runtime.
        if (!('content' in result)) throw new Error('Unexpected AI response shape for summary');
        return {
          draft: { title: deriveTitleFromSummary(result.content), summary: result.content },
          contactId: conv?.contactId ?? null,
        };
      } catch (aiErr) {
        logger.warn(`[tickets] AI draft failed for conversation ${conversationId}: ${aiErr instanceof Error ? aiErr.message : aiErr}`);
        return { draft: null, warning: aiErrorMessage(aiErr), contactId: conv?.contactId ?? null };
      }
    } catch (err) {
      logger.error('[tickets] Draft error:', err);
      return reply.status(500).send({ error: 'Failed to draft ticket' });
    }
  });

  // ── POST /api/v1/tickets ────────────────────────────────────────────────────
  app.post('/api/v1/tickets', async (request: FastifyRequest<{
      Body: {
      title?: string; summary?: string; priority?: string; category?: string | null; assigneeUserId?: string;
      contactId?: string | null; conversationId?: string | null; aiGenerated?: boolean;
      sourceMessageId?: string | null;
      sourceMessageIds?: string[] | null;
      mediaAssetIds?: string[] | null;
      attachments?: Array<{ mediaAssetId: string; variantBlobId?: string | null; sourceMessageId?: string | null }> | null;
    };
  }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const title = (request.body?.title || '').trim();
      if (!title) return reply.status(400).send({ error: 'Tiêu đề là bắt buộc' });
      if (title.length > TITLE_MAX) return reply.status(400).send({ error: `Tiêu đề tối đa ${TITLE_MAX} ký tự` });

      const summary = (request.body?.summary || '').trim();
      if (!summary) return reply.status(400).send({ error: 'Mô tả vấn đề là bắt buộc' });
      if (summary.length > SUMMARY_MAX) return reply.status(400).send({ error: `Mô tả tối đa ${SUMMARY_MAX} ký tự` });

      const priority = PRIORITIES.includes(request.body?.priority as (typeof PRIORITIES)[number])
        ? request.body!.priority!
        : 'normal';

      // category: enum thuộc sở hữu FE (refund/return/quality/shipping/other) — BE chỉ giới hạn độ dài,
      // không hardcode danh sách để tránh 2 nơi phải đồng bộ khi thêm loại khiếu nại mới.
      const category = (request.body?.category || '').trim().slice(0, 50) || null;

      const assigneeUserId = request.body?.assigneeUserId || user.id;
      if (assigneeUserId !== user.id) {
        const assignee = await prisma.user.findFirst({
          where: { id: assigneeUserId, orgId: user.orgId },
          select: { id: true },
        });
        if (!assignee) return reply.status(400).send({ error: 'Người phụ trách không hợp lệ' });
      }

      // KH + hội thoại: 2 đường.
      //  (A) Tạo từ tin nhắn chat nhóm (sourceMessageId) — anh chốt: quyền = ở-trong-nhóm, KH
      //      resolve từ người gửi + tự cấp access (resolveWorkItemFromMessage). Khiếu nại BẮT BUỘC
      //      từ tin của KH (không phải tin nhân viên).
      //  (B) Tạo thường — contactId từ body, bắt buộc + kiểm visibility.
      let contactId: string | null;
      let conversationId: string | null = request.body?.conversationId || null;
      const sourceMessageId = request.body?.sourceMessageId || null;

      if (sourceMessageId) {
        const src = await resolveWorkItemFromMessage(request, reply, sourceMessageId);
        if (!src) return; // reply đã gửi (404/403)
        if (!src.senderIsCustomer || !src.contactId) {
          return reply.status(400).send({ error: 'Khiếu nại phải tạo từ tin nhắn của khách hàng' });
        }
        contactId = src.contactId;       // đã resolve + cấp quyền trong helper → bỏ qua assertContactVisible
        conversationId = src.conversationId;
      } else {
        // Liên kết KH bắt buộc (2026-07-10): ticket không rõ KH thì không ai xử lý được.
        contactId = request.body?.contactId || null;
        if (!contactId) return reply.status(400).send({ error: 'Liên kết khách hàng là bắt buộc' });
        const contactVisible = await assertContactVisible({
          userId: user.id, orgId: user.orgId, legacyRole: user.role, contactId,
        });
        if (!contactVisible) return reply.status(404).send({ error: 'Contact not found' });
        const contact = await prisma.contact.findFirst({ where: { id: contactId, orgId: user.orgId }, select: { id: true } });
        if (!contact) return reply.status(404).send({ error: 'Contact not found' });

        if (conversationId) {
          const conv = await assertConversationReadAccess(request, reply, conversationId);
          if (!conv) return;
        }
      }

      const ticket = await prisma.ticket.create({
        data: {
          orgId: user.orgId,
          title,
          summary,
          priority,
          category,
          status: 'open',
          assigneeUserId,
          createdByUserId: user.id,
          contactId,
          conversationId,
          sourceMessageId,
          aiGenerated: Boolean(request.body?.aiGenerated),
        },
        include: TICKET_INCLUDE,
      });

      // Media attachments (chat auto + manual picker). Best-effort — ticket vẫn tạo nếu attach lỗi.
      const sourceMessageIds = [
        ...(Array.isArray(request.body?.sourceMessageIds) ? request.body!.sourceMessageIds! : []),
        ...(sourceMessageId ? [sourceMessageId] : []),
      ];
      let attachmentCount = 0;
      try {
        attachmentCount = await attachMediaToWorkItem({
          orgId: user.orgId,
          userId: user.id,
          workItemType: 'ticket',
          workItemId: ticket.id,
          sourceMessageIds,
          mediaAssetIds: request.body?.mediaAssetIds,
          attachments: request.body?.attachments,
        });
      } catch (attErr) {
        logger.warn('[tickets] attach media error:', attErr);
      }

      logActivity({
        orgId: user.orgId,
        userId: user.id,
        action: 'ticket_create',
        ...ticketLogEntity(ticket),
        details: {
          ticketId: ticket.id, title: ticket.title, priority: ticket.priority,
          assigneeUserId, aiGenerated: ticket.aiGenerated, attachmentCount,
        },
      });

      const attMap = await loadAttachmentsForItems(user.orgId, 'ticket', [ticket.id], 20);
      return reply.status(201).send({ ticket: { ...ticket, attachments: attMap.get(ticket.id) ?? [] } });
    } catch (err) {
      logger.error('[tickets] Create error:', err);
      return reply.status(500).send({ error: 'Failed to create ticket' });
    }
  });

  // ── PUT /api/v1/tickets/:id ─────────────────────────────────────────────────
  // Sửa nội dung (KHÔNG sửa status — dùng PATCH /:id/status).
  app.put('/api/v1/tickets/:id', async (request: FastifyRequest<{
    Params: { id: string };
    Body: { title?: string; summary?: string; priority?: string; category?: string | null; assigneeUserId?: string; contactId?: string | null };
  }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const existing = await prisma.ticket.findFirst({ where: { id: request.params.id, orgId: user.orgId } });
      if (!existing) return reply.status(404).send({ error: 'Ticket not found' });
      if (!canMutateTicket(user, existing)) {
        return reply.status(403).send({ error: 'Không có quyền sửa ticket này' });
      }
      if (existing.status === 'resolved') {
        return reply.status(400).send({ error: 'Ticket đã hoàn thành — bấm "Mở lại" trước khi sửa nội dung' });
      }

      const data: Record<string, unknown> = {};

      if (request.body?.title !== undefined) {
        const title = (request.body.title || '').trim();
        if (!title) return reply.status(400).send({ error: 'Tiêu đề là bắt buộc' });
        if (title.length > TITLE_MAX) return reply.status(400).send({ error: `Tiêu đề tối đa ${TITLE_MAX} ký tự` });
        data.title = title;
      }
      if (request.body?.summary !== undefined) {
        const summary = (request.body.summary || '').trim();
        if (!summary) return reply.status(400).send({ error: 'Mô tả vấn đề là bắt buộc' });
        if (summary.length > SUMMARY_MAX) return reply.status(400).send({ error: `Mô tả tối đa ${SUMMARY_MAX} ký tự` });
        data.summary = summary;
      }
      if (request.body?.priority !== undefined) {
        if (!PRIORITIES.includes(request.body.priority as (typeof PRIORITIES)[number])) {
          return reply.status(400).send({ error: 'Mức độ ưu tiên không hợp lệ' });
        }
        data.priority = request.body.priority;
      }
      if (request.body?.category !== undefined) {
        data.category = (request.body.category || '').trim().slice(0, 50) || null;
      }
      if (request.body?.assigneeUserId !== undefined && request.body.assigneeUserId !== existing.assigneeUserId) {
        const assignee = await prisma.user.findFirst({
          where: { id: request.body.assigneeUserId, orgId: user.orgId },
          select: { id: true },
        });
        if (!assignee) return reply.status(400).send({ error: 'Người phụ trách không hợp lệ' });
        data.assigneeUserId = request.body.assigneeUserId;
      }
      if (request.body?.contactId !== undefined) {
        const contactId = request.body.contactId || null;
        // Bắt buộc liên kết KH (2026-07-10) — chỉ được ĐỔI sang KH khác, không được bỏ link.
        if (!contactId) return reply.status(400).send({ error: 'Liên kết khách hàng là bắt buộc, không thể bỏ' });
        if (contactId !== existing.contactId) {
          const visible = await assertContactVisible({
            userId: user.id, orgId: user.orgId, legacyRole: user.role, contactId,
          });
          if (!visible) return reply.status(404).send({ error: 'Contact not found' });
          const contact = await prisma.contact.findFirst({ where: { id: contactId, orgId: user.orgId }, select: { id: true } });
          if (!contact) return reply.status(404).send({ error: 'Contact not found' });
        }
        data.contactId = contactId;
      }

      const updated = await prisma.ticket.update({
        where: { id: existing.id },
        data,
        include: TICKET_INCLUDE,
      });

      const diff = computeDiff(
        {
          title: existing.title, summary: existing.summary, priority: existing.priority, category: existing.category,
          assigneeUserId: existing.assigneeUserId, contactId: existing.contactId,
        },
        {
          title: updated.title, summary: updated.summary, priority: updated.priority, category: updated.category,
          assigneeUserId: updated.assigneeUserId, contactId: updated.contactId,
        },
        ['title', 'summary', 'priority', 'category', 'assigneeUserId', 'contactId'],
      );
      if (Object.keys(diff).length > 0) {
        logActivity({
          orgId: user.orgId,
          userId: user.id,
          action: 'ticket_update',
          ...ticketLogEntity(updated),
          details: { ticketId: updated.id, title: updated.title, diff },
        });
      }

      return { ticket: updated };
    } catch (err) {
      logger.error('[tickets] Update error:', err);
      return reply.status(500).send({ error: 'Failed to update ticket' });
    }
  });

  // ── PATCH /api/v1/tickets/:id/status ────────────────────────────────────────
  // Lifecycle: open→in_progress→resolved, resolved→in_progress (Mở lại — sửa lỗi bấm nhầm).
  app.patch('/api/v1/tickets/:id/status', async (request: FastifyRequest<{
    Params: { id: string };
    Body: { status?: string };
  }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const newStatus = request.body?.status;
      if (!newStatus || !(TICKET_STATUSES as readonly string[]).includes(newStatus)) {
        return reply.status(400).send({ error: 'Trạng thái không hợp lệ' });
      }
      const existing = await prisma.ticket.findFirst({ where: { id: request.params.id, orgId: user.orgId } });
      if (!existing) return reply.status(404).send({ error: 'Ticket not found' });
      if (!canMutateTicket(user, existing)) {
        return reply.status(403).send({ error: 'Không có quyền cập nhật ticket này' });
      }
      if (!isValidTicketTransition(existing.status, newStatus)) {
        const msg = existing.status === 'resolved'
          ? 'Chỉ có thể "Mở lại" (chuyển về Đang xử lý) từ trạng thái đã hoàn thành'
          : 'Chuyển trạng thái không hợp lệ';
        return reply.status(400).send({ error: msg });
      }

      const isResolving = newStatus === 'resolved';
      // Mở lại (revert resolved→in_progress): xoá dấu vết resolved cũ — ticket không còn
      // ở trạng thái hoàn thành nên resolvedAt/resolvedByUserId không còn đúng ngữ nghĩa.
      const isReverting = existing.status === 'resolved' && !isResolving;
      const updated = await prisma.ticket.update({
        where: { id: existing.id },
        data: isResolving
          ? { status: newStatus, resolvedAt: new Date(), resolvedByUserId: user.id }
          : isReverting
            ? { status: newStatus, resolvedAt: null, resolvedByUserId: null }
            : { status: newStatus },
        include: TICKET_INCLUDE,
      });

      logActivity({
        orgId: user.orgId,
        userId: user.id,
        action: isResolving ? 'ticket_resolve' : isReverting ? 'ticket_reopen' : 'ticket_status_change',
        ...ticketLogEntity(updated),
        details: { ticketId: updated.id, title: updated.title, from: existing.status, to: newStatus },
      });

      return { ticket: updated };
    } catch (err) {
      logger.error('[tickets] Status change error:', err);
      return reply.status(500).send({ error: 'Failed to update ticket status' });
    }
  });

  // ── DELETE /api/v1/tickets/:id ──────────────────────────────────────────────
  app.delete('/api/v1/tickets/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const existing = await prisma.ticket.findFirst({ where: { id: request.params.id, orgId: user.orgId } });
      if (!existing) return reply.status(404).send({ error: 'Ticket not found' });
      if (!canDeleteTicket(user, existing)) {
        return reply.status(403).send({ error: 'Chỉ người tạo hoặc quản trị được xóa ticket' });
      }

      logActivity({
        orgId: user.orgId,
        userId: user.id,
        action: 'ticket_delete',
        ...ticketLogEntity(existing),
        details: { ticketId: existing.id, title: existing.title },
      });
      await prisma.ticket.delete({ where: { id: existing.id } });

      return { success: true };
    } catch (err) {
      logger.error('[tickets] Delete error:', err);
      return reply.status(500).send({ error: 'Failed to delete ticket' });
    }
  });
}
