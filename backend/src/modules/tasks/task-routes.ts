/**
 * task-routes.ts — Công việc (Task V1, 2026-07-07): to-do thủ công cho sale.
 *
 * Quyền (V1, KHÔNG dùng requireGrant — theo pattern appointments/notes):
 *   - Xem "Của tôi" (view=mine): mọi user — task mình được giao.
 *   - Xem "Tất cả" (view=all): owner/admin cả org; trưởng/phó phòng xem task giao cho
 *     user trong subtree phòng (visibleUserIds từ getContactScope); sale thường → 403.
 *   - Sửa/toggle: admin/owner ∨ assignee ∨ người tạo (canMutateTask).
 *   - Xóa: CHỈ người tạo hoặc owner/admin — assignee được giao thì hoàn thành, không xóa.
 *   - Task link KH: assertContactVisible như notes (404 nếu không thấy KH).
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { logActivity, computeDiff } from '../activity/activity-logger.js';
import { assertContactVisible, getContactScope } from '../contacts/contact-scope.js';
import { resolveWorkItemFromMessage } from '../chat/work-from-message.js';
import { canMutateTask, canDeleteTask } from './task-permissions.js';
import {
  attachMediaToWorkItem,
  loadAttachmentsForItems,
  registerWorkAttachmentRoutes,
} from '../work/work-attachments.js';

const TASK_INCLUDE = {
  assignee:  { select: { id: true, fullName: true, email: true, avatarUrl: true } },
  createdBy: { select: { id: true, fullName: true } },
  doneBy:    { select: { id: true, fullName: true } },
  contact:   { select: { id: true, fullName: true, phone: true, avatarUrl: true } },
} as const;

const TITLE_MAX = 300;
const DESC_MAX = 5000;

/** Parse dueAt từ body: undefined = không đổi, null = xóa hạn, string ISO = set. Invalid → Error. */
function parseDueAt(raw: unknown): Date | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) throw new Error('invalid_due_at');
  return d;
}

/** entityType/entityId cho ActivityLog: task link KH → log lên timeline KH (entityType 'contact'). */
function taskLogEntity(task: { id: string; contactId: string | null }): { entityType: string; entityId: string } {
  return task.contactId
    ? { entityType: 'contact', entityId: task.contactId }
    : { entityType: 'task', entityId: task.id };
}

export async function tasksRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  registerWorkAttachmentRoutes(app, {
    workItemType: 'task',
    basePath: '/api/v1/tasks',
    loadItem: (orgId, id) => prisma.task.findFirst({ where: { id, orgId }, select: { id: true } }),
    canMutate: canMutateTask,
  });

  // ── GET /api/v1/tasks ──────────────────────────────────────────────────────
  // Query: view=mine|all, status=open|done|all, contactId?, assigneeUserId? (chỉ view=all),
  //        page=1, limit=50. Sort: dueAt ASC nulls last (quá hạn nổi lên đầu), createdAt DESC.
  app.get('/api/v1/tasks', async (request: FastifyRequest<{
    Querystring: { view?: string; status?: string; contactId?: string; assigneeUserId?: string; page?: string; limit?: string };
  }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const view = request.query.view === 'all' ? 'all' : 'mine';
      const status = ['done', 'all'].includes(request.query.status || '') ? request.query.status! : 'open';
      const page = Math.max(1, parseInt(request.query.page || '1', 10) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(request.query.limit || '50', 10) || 50));

      const where: Record<string, unknown> = { orgId: user.orgId };
      if (status !== 'all') where.status = status;

      if (view === 'mine') {
        where.assigneeUserId = user.id;
      } else {
        // view=all: owner/admin cả org; trưởng phòng subtree; sale thường → 403
        const isOrgAdmin = user.role === 'owner' || user.role === 'admin';
        if (!isOrgAdmin) {
          const scope = await getContactScope(user.id, user.orgId, user.role);
          if (scope.visibleUserIds.size <= 1) {
            return reply.status(403).send({ error: 'Chỉ quản lý mới xem được tất cả công việc' });
          }
          where.assigneeUserId = { in: Array.from(scope.visibleUserIds) };
        }
        // Lọc thêm theo 1 assignee cụ thể (dropdown trong view Tất cả)
        if (request.query.assigneeUserId) {
          const requested = request.query.assigneeUserId;
          if (!isOrgAdmin) {
            const allowed = (where.assigneeUserId as { in: string[] } | undefined)?.in ?? [];
            if (!allowed.includes(requested)) {
              return reply.status(403).send({ error: 'Không có quyền xem công việc của người này' });
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

      const [tasks, total] = await Promise.all([
        prisma.task.findMany({
          where,
          include: TASK_INCLUDE,
          orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.task.count({ where }),
      ]);

      const attMap = await loadAttachmentsForItems(user.orgId, 'task', tasks.map((t) => t.id), 4);
      const withAtt = tasks.map((t) => ({ ...t, attachments: attMap.get(t.id) ?? [] }));
      return { tasks: withAtt, total, page, limit };
    } catch (err) {
      logger.error('[tasks] List error:', err);
      return reply.status(500).send({ error: 'Failed to fetch tasks' });
    }
  });

  // ── GET /api/v1/contacts/:contactId/tasks ──────────────────────────────────
  // Panel KH: mọi user thấy KH đều thấy task của KH đó (giống appointments-on-contact).
  // Đang mở trước (due ASC), done sau (doneAt DESC).
  app.get('/api/v1/contacts/:contactId/tasks', async (request: FastifyRequest<{ Params: { contactId: string } }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { contactId } = request.params;

      const visible = await assertContactVisible({
        userId: user.id, orgId: user.orgId, legacyRole: user.role, contactId,
      });
      if (!visible) return reply.status(404).send({ error: 'Contact not found' });
      const contact = await prisma.contact.findFirst({ where: { id: contactId, orgId: user.orgId }, select: { id: true } });
      if (!contact) return reply.status(404).send({ error: 'Contact not found' });

      const tasks = await prisma.task.findMany({
        where: { orgId: user.orgId, contactId },
        include: TASK_INCLUDE,
        orderBy: [{ status: 'asc' }, { dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      });
      // status 'done' < 'open' theo alphabet — muốn open trước nên sort tay cho rõ ràng
      tasks.sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1));

      const attMap = await loadAttachmentsForItems(user.orgId, 'task', tasks.map((t) => t.id), 4);
      const withAtt = tasks.map((t) => ({ ...t, attachments: attMap.get(t.id) ?? [] }));
      return { tasks: withAtt, total: withAtt.length };
    } catch (err) {
      logger.error('[tasks] Contact list error:', err);
      return reply.status(500).send({ error: 'Failed to fetch tasks' });
    }
  });

  // ── POST /api/v1/tasks ─────────────────────────────────────────────────────
  app.post('/api/v1/tasks', async (request: FastifyRequest<{
    Body: {
      title?: string; description?: string; assigneeUserId?: string; contactId?: string | null;
      ticketId?: string | null; dueAt?: string | null; dueHasTime?: boolean; sourceMessageId?: string | null;
      sourceMessageIds?: string[] | null; mediaAssetIds?: string[] | null;
      attachments?: Array<{ mediaAssetId: string; variantBlobId?: string | null; sourceMessageId?: string | null }> | null;
    };
  }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const title = (request.body?.title || '').trim();
      if (!title) return reply.status(400).send({ error: 'Tiêu đề là bắt buộc' });
      if (title.length > TITLE_MAX) return reply.status(400).send({ error: `Tiêu đề tối đa ${TITLE_MAX} ký tự` });
      const description = (request.body?.description || '').trim() || null;
      if (description && description.length > DESC_MAX) {
        return reply.status(400).send({ error: `Mô tả tối đa ${DESC_MAX} ký tự` });
      }

      let dueAt: Date | null;
      try {
        dueAt = parseDueAt(request.body?.dueAt) ?? null;
      } catch {
        return reply.status(400).send({ error: 'Hạn không hợp lệ' });
      }

      // Người phụ trách: mặc định người tạo; nếu chỉ định → phải là thành viên org
      const assigneeUserId = request.body?.assigneeUserId || user.id;
      if (assigneeUserId !== user.id) {
        const assignee = await prisma.user.findFirst({
          where: { id: assigneeUserId, orgId: user.orgId },
          select: { id: true },
        });
        if (!assignee) return reply.status(400).send({ error: 'Người phụ trách không hợp lệ' });
      }

      // Link KH: 2 đường.
      //  (A) Tạo từ tin nhắn chat nhóm (sourceMessageId) — quyền = ở-trong-nhóm; tin của KH →
      //      resolve + tự cấp access (helper). Task: contact TÙY CHỌN (tin nhân viên → không gắn KH).
      //  (B) Tạo thường — contactId từ body, chỉ link KH mình thấy được.
      let contactId = request.body?.contactId || null;
      const sourceMessageId = request.body?.sourceMessageId || null;
      if (sourceMessageId) {
        const src = await resolveWorkItemFromMessage(request, reply, sourceMessageId);
        if (!src) return; // reply đã gửi
        if (src.contactId) contactId = src.contactId; // đã cấp quyền trong helper → bỏ qua visibility
      } else if (contactId) {
        const visible = await assertContactVisible({
          userId: user.id, orgId: user.orgId, legacyRole: user.role, contactId,
        });
        if (!visible) return reply.status(404).send({ error: 'Contact not found' });
        const contact = await prisma.contact.findFirst({ where: { id: contactId, orgId: user.orgId }, select: { id: true } });
        if (!contact) return reply.status(404).send({ error: 'Contact not found' });
      }

      // Spawn từ ticket (Ticket V1 2026-07-09) — chỉ kiểm tồn tại cùng org, giống mức
      // kiểm contactId ở trên (không cần canMutateTicket — tạo task từ 1 ticket mình
      // đang xem là hành động tự nhiên, không phải sửa/xóa ticket đó).
      const ticketId = request.body?.ticketId || null;
      if (ticketId) {
        const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, orgId: user.orgId }, select: { id: true } });
        if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });
      }

      const task = await prisma.task.create({
        data: {
          orgId: user.orgId,
          title,
          description,
          assigneeUserId,
          createdByUserId: user.id,
          contactId,
          ticketId,
          sourceMessageId,
          dueAt,
          dueHasTime: dueAt ? Boolean(request.body?.dueHasTime) : false,
        },
        include: TASK_INCLUDE,
      });

      const sourceMessageIds = [
        ...(Array.isArray(request.body?.sourceMessageIds) ? request.body!.sourceMessageIds! : []),
        ...(sourceMessageId ? [sourceMessageId] : []),
      ];
      let attachmentCount = 0;
      try {
        attachmentCount = await attachMediaToWorkItem({
          orgId: user.orgId,
          userId: user.id,
          workItemType: 'task',
          workItemId: task.id,
          sourceMessageIds,
          mediaAssetIds: request.body?.mediaAssetIds,
          attachments: request.body?.attachments,
        });
      } catch (attErr) {
        logger.warn('[tasks] attach media error:', attErr);
      }

      logActivity({
        orgId: user.orgId,
        userId: user.id,
        action: 'task_create',
        ...taskLogEntity(task),
        details: {
          taskId: task.id, title: task.title, dueAt: task.dueAt?.toISOString() ?? null,
          assigneeUserId, attachmentCount,
        },
      });

      const attMap = await loadAttachmentsForItems(user.orgId, 'task', [task.id], 20);
      return reply.status(201).send({ task: { ...task, attachments: attMap.get(task.id) ?? [] } });
    } catch (err) {
      logger.error('[tasks] Create error:', err);
      return reply.status(500).send({ error: 'Failed to create task' });
    }
  });

  // ── PUT /api/v1/tasks/:id ──────────────────────────────────────────────────
  // Sửa nội dung (KHÔNG sửa status — dùng /toggle). contactId: null = gỡ link KH.
  app.put('/api/v1/tasks/:id', async (request: FastifyRequest<{
    Params: { id: string };
    Body: { title?: string; description?: string | null; assigneeUserId?: string; contactId?: string | null; dueAt?: string | null; dueHasTime?: boolean };
  }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const existing = await prisma.task.findFirst({ where: { id: request.params.id, orgId: user.orgId } });
      if (!existing) return reply.status(404).send({ error: 'Task not found' });
      if (!canMutateTask(user, existing)) {
        return reply.status(403).send({ error: 'Không có quyền sửa công việc này' });
      }

      const data: Record<string, unknown> = {};

      if (request.body?.title !== undefined) {
        const title = (request.body.title || '').trim();
        if (!title) return reply.status(400).send({ error: 'Tiêu đề là bắt buộc' });
        if (title.length > TITLE_MAX) return reply.status(400).send({ error: `Tiêu đề tối đa ${TITLE_MAX} ký tự` });
        data.title = title;
      }
      if (request.body?.description !== undefined) {
        const description = (request.body.description || '').trim() || null;
        if (description && description.length > DESC_MAX) {
          return reply.status(400).send({ error: `Mô tả tối đa ${DESC_MAX} ký tự` });
        }
        data.description = description;
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
        if (contactId && contactId !== existing.contactId) {
          const visible = await assertContactVisible({
            userId: user.id, orgId: user.orgId, legacyRole: user.role, contactId,
          });
          if (!visible) return reply.status(404).send({ error: 'Contact not found' });
          const contact = await prisma.contact.findFirst({ where: { id: contactId, orgId: user.orgId }, select: { id: true } });
          if (!contact) return reply.status(404).send({ error: 'Contact not found' });
        }
        data.contactId = contactId;
      }
      try {
        const dueAt = parseDueAt(request.body?.dueAt);
        if (dueAt !== undefined) data.dueAt = dueAt;
        if (request.body?.dueHasTime !== undefined) data.dueHasTime = Boolean(request.body.dueHasTime);
        // Gỡ hạn thì reset cờ giờ (dueHasTime vô nghĩa khi không có hạn)
        if (dueAt === null) data.dueHasTime = false;
      } catch {
        return reply.status(400).send({ error: 'Hạn không hợp lệ' });
      }

      const updated = await prisma.task.update({
        where: { id: existing.id },
        data,
        include: TASK_INCLUDE,
      });

      // computeDiff so sánh !== — đưa Date về ISO string để không báo đổi giả (Date là reference)
      const diff = computeDiff(
        {
          title: existing.title,
          dueAt: existing.dueAt?.toISOString() ?? null,
          assigneeUserId: existing.assigneeUserId,
          contactId: existing.contactId,
        },
        {
          title: updated.title,
          dueAt: updated.dueAt?.toISOString() ?? null,
          assigneeUserId: updated.assigneeUserId,
          contactId: updated.contactId,
        },
        ['title', 'dueAt', 'assigneeUserId', 'contactId'],
      );
      if (Object.keys(diff).length > 0) {
        logActivity({
          orgId: user.orgId,
          userId: user.id,
          action: 'task_update',
          ...taskLogEntity(updated),
          details: { taskId: updated.id, title: updated.title, diff },
        });
      }

      return { task: updated };
    } catch (err) {
      logger.error('[tasks] Update error:', err);
      return reply.status(500).send({ error: 'Failed to update task' });
    }
  });

  // ── PATCH /api/v1/tasks/:id/toggle ─────────────────────────────────────────
  // Endpoint riêng cho checkbox nhanh — không đụng editor (mirror appointments /status).
  app.patch('/api/v1/tasks/:id/toggle', async (request: FastifyRequest<{
    Params: { id: string };
    Body: { done?: boolean };
  }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      if (typeof request.body?.done !== 'boolean') {
        return reply.status(400).send({ error: 'Thiếu trường done (boolean)' });
      }
      const existing = await prisma.task.findFirst({ where: { id: request.params.id, orgId: user.orgId } });
      if (!existing) return reply.status(404).send({ error: 'Task not found' });
      if (!canMutateTask(user, existing)) {
        return reply.status(403).send({ error: 'Không có quyền cập nhật công việc này' });
      }

      const done = request.body.done;
      const updated = await prisma.task.update({
        where: { id: existing.id },
        data: done
          ? { status: 'done', doneAt: new Date(), doneByUserId: user.id }
          : { status: 'open', doneAt: null, doneByUserId: null },
        include: TASK_INCLUDE,
      });

      logActivity({
        orgId: user.orgId,
        userId: user.id,
        action: done ? 'task_complete' : 'task_reopen',
        ...taskLogEntity(updated),
        details: { taskId: updated.id, title: updated.title },
      });

      return { task: updated };
    } catch (err) {
      logger.error('[tasks] Toggle error:', err);
      return reply.status(500).send({ error: 'Failed to toggle task' });
    }
  });

  // ── DELETE /api/v1/tasks/:id ───────────────────────────────────────────────
  // Chỉ người tạo hoặc owner/admin — người được giao thì hoàn thành, không xóa.
  app.delete('/api/v1/tasks/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const existing = await prisma.task.findFirst({ where: { id: request.params.id, orgId: user.orgId } });
      if (!existing) return reply.status(404).send({ error: 'Task not found' });
      if (!canDeleteTask(user, existing)) {
        return reply.status(403).send({ error: 'Chỉ người tạo hoặc quản trị được xóa công việc' });
      }

      logActivity({
        orgId: user.orgId,
        userId: user.id,
        action: 'task_delete',
        ...taskLogEntity(existing),
        details: { taskId: existing.id, title: existing.title },
      });
      await prisma.task.delete({ where: { id: existing.id } });

      return { success: true };
    } catch (err) {
      logger.error('[tasks] Delete error:', err);
      return reply.status(500).send({ error: 'Failed to delete task' });
    }
  });
}
