/**
 * chat-archive-routes.ts — Phase Lưu Hội Thoại 2026-07-22.
 *
 * ⚠️ QUYỀN: TOÀN BỘ route ở đây gác bằng requireRole('owner') — CHỈ Chủ tài khoản
 *    (vai trò cao nhất, mỗi org đúng 1, user-routes chặn tạo thêm) xem được.
 *    Anh chốt: "nhân viên (và cả admin) KHÔNG xem được cơ sở dữ liệu này."
 *    ⇒ CỐ TÌNH không dùng ma trận phân quyền RBAC: mọi grant, kể cả
 *      conversation.view_all / media.view_all, đều KHÔNG mở được cửa này.
 *
 * Bản lưu chứa nguyên văn tin nhắn khách → mọi thao tác đều ghi nhật ký (logActivity).
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { logActivity } from '../activity/activity-logger.js';
import { logger } from '../../shared/utils/logger.js';
import { createChatArchive, type ArchiveMode } from './chat-archive-service.js';

const VALID_MODES: ArchiveMode[] = ['summary', 'verbatim', 'both'];

export async function chatArchiveRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);
  // Gác vai trò cho MỌI route trong plugin này — thêm route mới cũng tự kín.
  app.addHook('preHandler', requireRole('owner'));

  // ── POST /api/v1/chat-archives — lưu 1 hội thoại vào kho lưu trữ ──────────
  // body: { conversationId, mode?: 'summary' | 'verbatim' | 'both' }
  app.post(
    '/api/v1/chat-archives',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const body = (request.body ?? {}) as { conversationId?: string; mode?: string };

      if (!body.conversationId) return reply.status(400).send({ error: 'Thiếu conversationId' });
      const mode = (VALID_MODES as string[]).includes(body.mode ?? '')
        ? (body.mode as ArchiveMode)
        : 'both';

      try {
        const res = await createChatArchive({
          orgId: user.orgId,
          conversationId: body.conversationId,
          createdById: userId,
          mode,
        });
        logActivity({
          orgId: user.orgId, userId, action: 'chat_archive_create',
          entityType: 'chat_archive', entityId: res.archiveId,
          details: {
            conversationId: body.conversationId, mode,
            messageCount: res.messageCount, mediaCount: res.mediaCount,
          },
        });
        return res;
      } catch (err: any) {
        logger.error('[chat-archive] create error:', err);
        const notFound = /Không tìm thấy hội thoại/.test(String(err?.message ?? ''));
        return reply.status(notFound ? 404 : 500).send({ error: err?.message ?? 'Lưu hội thoại lỗi' });
      }
    },
  );

  // ── GET /api/v1/chat-archives — danh sách bản lưu ─────────────────────────
  // KHÔNG trả nội dung tin ở đây (danh sách nhẹ); mở chi tiết mới đọc từng dòng.
  app.get(
    '/api/v1/chat-archives',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const q = request.query as {
        conversationId?: string; contactId?: string; q?: string;
        limit?: string; skip?: string;
      };
      try {
        const where: any = { orgId: user.orgId };
        if (q.conversationId) where.conversationId = q.conversationId;
        if (q.contactId) where.contactId = q.contactId;
        if (q.q) where.contactName = { contains: q.q, mode: 'insensitive' };

        const limit = Math.min(parseInt(q.limit ?? '50', 10) || 50, 200);
        const skip = Math.max(parseInt(q.skip ?? '0', 10) || 0, 0);

        const [total, rows] = await Promise.all([
          prisma.chatArchive.count({ where }),
          prisma.chatArchive.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
            include: { createdBy: { select: { fullName: true } } },
          }),
        ]);

        return {
          total,
          items: rows.map((a) => ({
            id: a.id,
            conversationId: a.conversationId,
            contactId: a.contactId,
            contactName: a.contactName,
            channel: a.channel,
            nickName: a.nickName,
            mode: a.mode,
            hasSummary: !!a.summaryText,
            messageCount: a.messageCount,
            mediaCount: a.mediaCount,
            firstMessageAt: a.firstMessageAt,
            lastMessageAt: a.lastMessageAt,
            createdAt: a.createdAt,
            createdByName: a.createdBy?.fullName ?? null,
          })),
        };
      } catch (err: any) {
        logger.error('[chat-archive] list error:', err);
        return reply.status(500).send({ error: err?.message ?? 'Đọc danh sách lỗi' });
      }
    },
  );

  // ── GET /api/v1/chat-archives/:id — đọc 1 bản lưu (tóm tắt + từng dòng) ───
  app.get(
    '/api/v1/chat-archives/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const { id } = request.params as { id: string };
      const q = request.query as { limit?: string; skip?: string };

      try {
        const archive = await prisma.chatArchive.findFirst({
          where: { id, orgId: user.orgId },
          include: { createdBy: { select: { fullName: true } } },
        });
        if (!archive) return reply.status(404).send({ error: 'Không tìm thấy bản lưu' });

        // Phân trang bản chép — hội thoại dài vài nghìn dòng không nên trả 1 cục.
        const limit = Math.min(parseInt(q.limit ?? '500', 10) || 500, 2000);
        const skip = Math.max(parseInt(q.skip ?? '0', 10) || 0, 0);
        const lines = await prisma.chatArchiveMessage.findMany({
          where: { archiveId: archive.id },
          orderBy: { seq: 'asc' },
          skip,
          take: limit,
        });

        logActivity({
          orgId: user.orgId, userId, action: 'chat_archive_view',
          entityType: 'chat_archive', entityId: archive.id,
          details: { contactName: archive.contactName },
        });

        return {
          archive: {
            id: archive.id,
            conversationId: archive.conversationId,
            contactId: archive.contactId,
            contactName: archive.contactName,
            channel: archive.channel,
            nickName: archive.nickName,
            mode: archive.mode,
            summaryText: archive.summaryText,
            messageCount: archive.messageCount,
            mediaCount: archive.mediaCount,
            firstMessageAt: archive.firstMessageAt,
            lastMessageAt: archive.lastMessageAt,
            createdAt: archive.createdAt,
            createdByName: archive.createdBy?.fullName ?? null,
          },
          lines: lines.map((l) => ({
            seq: l.seq,
            senderType: l.senderType,
            senderName: l.senderName,
            content: l.content,
            contentType: l.contentType,
            mediaUrls: l.mediaUrls,
            sentAt: l.sentAt,
          })),
          hasMore: skip + lines.length < archive.messageCount,
        };
      } catch (err: any) {
        logger.error('[chat-archive] detail error:', err);
        return reply.status(500).send({ error: err?.message ?? 'Đọc bản lưu lỗi' });
      }
    },
  );

  // ── DELETE /api/v1/chat-archives/:id — xoá CỨNG 1 bản lưu ─────────────────
  // Xoá thật (cascade sang chat_archive_messages). Byte ảnh trong kho KHÔNG đụng —
  // chúng dùng chung với lịch sử chat (invariant của media-trash-gc-cron).
  app.delete(
    '/api/v1/chat-archives/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const { id } = request.params as { id: string };
      try {
        const archive = await prisma.chatArchive.findFirst({
          where: { id, orgId: user.orgId }, select: { id: true, contactName: true },
        });
        if (!archive) return reply.status(404).send({ error: 'Không tìm thấy bản lưu' });

        await prisma.chatArchive.delete({ where: { id: archive.id } });
        logActivity({
          orgId: user.orgId, userId, action: 'chat_archive_delete',
          entityType: 'chat_archive', entityId: archive.id,
          details: { contactName: archive.contactName },
        });
        return { ok: true };
      } catch (err: any) {
        logger.error('[chat-archive] delete error:', err);
        return reply.status(500).send({ error: err?.message ?? 'Xoá bản lưu lỗi' });
      }
    },
  );
}
