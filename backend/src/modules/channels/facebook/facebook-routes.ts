/**
 * facebook-routes.ts — HTTP surface kênh Facebook Messenger (multi-channel Phase 2, 2026-07-10).
 *
 * 2 plugin tách biệt (theo pattern appointmentRoutes vs appointmentPublicRoutes):
 *   • facebookWebhookRoutes — CÔNG KHAI (Meta gọi, không session). GET verify + POST events.
 *   • facebookChannelRoutes — có auth + requireGrant('settings',...). Config + list Page + connect.
 *
 * TRẠNG THÁI: phần tự chứa (verify handshake, config CRUD, list Page) ĐÃ chạy thật; phần cần
 * gọi Graph API (xử lý event webhook, kết nối Page/đổi token, gửi/kéo lịch sử) STUB — chờ Meta
 * App cấu hình xong (Phase 2). Điểm nối đã sẵn: facebookDriver.normalizeWebhook/sendMessage/fetchHistory.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Server } from 'socket.io';
import { prisma } from '../../../shared/database/prisma-client.js';
import { authMiddleware } from '../../auth/auth-middleware.js';
import { requireGrant } from '../../rbac/rbac-middleware.js';
import { logger } from '../../../shared/utils/logger.js';
import { withTenant } from '../../../shared/tenant/tenant-context.js';
import { getFacebookConfigSafe, upsertFacebookConfig, findOrgByVerifyToken, getDecryptedAppSecret } from './facebook-config.js';
import { connectPageManual, resolvePageForWebhook } from './facebook-pages.js';
import { facebookDriver } from './facebook-driver.js';
import { verifyWebhookSignature } from './facebook-webhook.js';
import { persistInboundMessages } from './facebook-inbound-service.js';

// ── Plugin CÔNG KHAI: webhook Meta (KHÔNG auth) ────────────────────────────────
export async function facebookWebhookRoutes(app: FastifyInstance): Promise<void> {
  // Raw-body parser BỌC-ĐÓNG trong plugin này (Fastify encapsulation → chỉ áp route webhook).
  // Giữ raw Buffer để verify X-Hub-Signature-256; vẫn parse JSON cho request.body.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    (_req as unknown as { rawBody?: Buffer }).rawBody = body as Buffer;
    try {
      const json = (body as Buffer).length ? JSON.parse((body as Buffer).toString('utf8')) : {};
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // GET verify handshake — echo hub.challenge nếu verify_token khớp 1 org.
  app.get('/api/v1/channels/facebook/webhook', async (request: FastifyRequest<{
    Querystring: Record<string, string | undefined>;
  }>, reply: FastifyReply) => {
    const mode = request.query['hub.mode'];
    const token = request.query['hub.verify_token'];
    const challenge = request.query['hub.challenge'];
    if (mode === 'subscribe' && token) {
      const orgId = await findOrgByVerifyToken(token);
      if (orgId) {
        logger.info(`[fb-webhook] verify OK (org ${orgId})`);
        return reply.type('text/plain').status(200).send(challenge ?? '');
      }
    }
    logger.warn('[fb-webhook] verify FAILED — verify_token không khớp org nào');
    return reply.status(403).send('Forbidden');
  });

  // POST events — verify chữ ký → resolve page→org → normalize → ghi Message + emit.
  // LUÔN trả 200 EVENTS_RECEIVED sau khi verify (Meta retry-storm nếu != 200), trừ khi chữ ký sai.
  app.post('/api/v1/channels/facebook/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { object?: string; entry?: Array<{ id?: string }> } | undefined;
      const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from('');
      const sigHeader = request.headers['x-hub-signature-256'] as string | undefined;

      if (!body || body.object !== 'page' || !Array.isArray(body.entry) || body.entry.length === 0) {
        return reply.status(200).send('EVENTS_RECEIVED'); // ping/không phải page event → nuốt.
      }

      // Resolve org từ page id đầu (mọi entry cùng 1 Meta App = cùng org) để lấy appSecret verify.
      const firstPageId = body.entry[0]?.id;
      const firstPage = firstPageId ? await resolvePageForWebhook(firstPageId) : null;
      if (!firstPage) {
        logger.warn(`[fb-webhook] page chưa connect (pageId=${firstPageId}) — bỏ qua.`);
        return reply.status(200).send('EVENTS_RECEIVED');
      }

      const appSecret = await getDecryptedAppSecret(firstPage.orgId);
      if (!appSecret) {
        logger.warn(`[fb-webhook] org ${firstPage.orgId} chưa cấu hình appSecret — không verify được.`);
        return reply.status(200).send('EVENTS_RECEIVED');
      }
      if (!verifyWebhookSignature(rawBody, sigHeader, appSecret)) {
        logger.warn('[fb-webhook] chữ ký X-Hub-Signature-256 KHÔNG hợp lệ — từ chối.');
        return reply.status(403).send('Invalid signature');
      }

      const io = (app as unknown as { io?: Server }).io;

      // Xử lý TỪNG entry (có thể nhiều Page cùng 1 app/org) → resolve page riêng, normalize, ghi.
      for (const entry of body.entry) {
        const page = entry.id ? await resolvePageForWebhook(entry.id) : null;
        if (!page) continue;
        const messages = facebookDriver.normalizeWebhook({ object: 'page', entry: [entry] });
        if (messages.length === 0) continue;

        const res = await withTenant(page.orgId, () =>
          persistInboundMessages(io, page.orgId, page.id, messages),
        );
        // Cập nhật mốc webhook cuối (trong tenant context — FacebookPageAccount org-scoped).
        await withTenant(page.orgId, () =>
          prisma.facebookPageAccount.update({ where: { id: page.id }, data: { lastWebhookAt: new Date() } }),
        );
        logger.info(`[fb-webhook] page ${page.id}: +${res.created} tin (bỏ ${res.skipped} trùng).`);
      }

      return reply.status(200).send('EVENTS_RECEIVED');
    } catch (err) {
      logger.error('[fb-webhook] xử lý event lỗi:', err);
      // Vẫn 200 để Meta không retry-storm (lỗi nội bộ ta tự log + điều tra).
      return reply.status(200).send('EVENTS_RECEIVED');
    }
  });
}

// ── Plugin CÓ AUTH: cấu hình + Page (owner/admin qua requireGrant settings) ─────
export async function facebookChannelRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // GET danh sách hội thoại FB của org (cho trang inbox FB tối giản). CHỈ authMiddleware
  // (sale cần xem — không gate requireGrant settings admin, giống pattern hisweetie-billing).
  app.get('/api/v1/channels/facebook/conversations', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orgId = request.user!.orgId;
      const convs = await prisma.conversation.findMany({
        where: { orgId, channel: 'facebook', deletedAt: null },
        select: {
          id: true, externalThreadId: true, lastMessageAt: true, unreadCount: true, isReplied: true,
          facebookPageAccount: { select: { pageName: true, pageId: true } },
          messages: {
            orderBy: { sentAt: 'desc' }, take: 8,
            select: { content: true, senderType: true, contentType: true, sentAt: true, senderName: true },
          },
        },
        orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        take: 100,
      });
      return {
        conversations: convs.map((c) => ({
          id: c.id,
          threadId: c.externalThreadId,
          pageName: c.facebookPageAccount?.pageName ?? null,
          // Tên KH lấy từ tin inbound gần nhất có senderName (enrich Graph). Fallback null → FE hiện PSID.
          senderName: c.messages.find((m) => m.senderType === 'contact' && m.senderName)?.senderName ?? null,
          lastMessageAt: c.lastMessageAt,
          unreadCount: c.unreadCount,
          isReplied: c.isReplied,
          preview: c.messages[0]
            ? { content: c.messages[0].content, senderType: c.messages[0].senderType, contentType: c.messages[0].contentType }
            : null,
        })),
      };
    } catch (err) {
      logger.error('[fb-conversations] list error:', err);
      return reply.status(500).send({ error: 'Không đọc được hội thoại Facebook' });
    }
  });

  // GET cấu hình (an toàn — không lộ appSecret).
  app.get('/api/v1/channels/facebook/config', { preHandler: requireGrant('settings', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        return await getFacebookConfigSafe(request.user!.orgId);
      } catch (err) {
        logger.error('[fb-config] get error:', err);
        return reply.status(500).send({ error: 'Không đọc được cấu hình Facebook' });
      }
    });

  // PUT cấu hình — lưu appId / appSecret (mã hoá) / webhookVerifyToken.
  app.put<{ Body: { appId?: string; appSecret?: string; webhookVerifyToken?: string } }>(
    '/api/v1/channels/facebook/config', { preHandler: requireGrant('settings', 'edit') },
    async (request, reply) => {
      try {
        const body = request.body ?? {};
        return await upsertFacebookConfig(request.user!.orgId, {
          appId: body.appId,
          appSecret: body.appSecret,
          webhookVerifyToken: body.webhookVerifyToken,
        });
      } catch (err) {
        logger.error('[fb-config] put error:', err);
        const msg = err instanceof Error && err.message.includes('FB_TOKEN_ENC_KEY')
          ? 'Chưa cấu hình khoá mã hoá (FB_TOKEN_ENC_KEY) trên server'
          : 'Không lưu được cấu hình Facebook';
        return reply.status(500).send({ error: msg });
      }
    });

  // GET danh sách Page đã connect (đọc FacebookPageAccount).
  app.get('/api/v1/channels/facebook/pages', { preHandler: requireGrant('settings', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const pages = await prisma.facebookPageAccount.findMany({
          where: { orgId: request.user!.orgId },
          select: { id: true, pageId: true, pageName: true, isActive: true, subscribedAt: true, lastWebhookAt: true },
          orderBy: { subscribedAt: 'desc' },
        });
        return { pages };
      } catch (err) {
        logger.error('[fb-pages] list error:', err);
        return reply.status(500).send({ error: 'Không đọc được danh sách Page' });
      }
    });

  // POST connect Page — STUB Phase 2 (cần Graph token exchange qua Meta App đã cấu hình).
  app.post('/api/v1/channels/facebook/pages/connect', { preHandler: requireGrant('settings', 'edit') },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      // Phase 2: nhận short-lived user token (Meta JS SDK login) → đổi long-lived → GET /me/accounts
      //   → chọn Page → lưu FacebookPageAccount (encrypt page token) → subscribe field 'messages'.
      return reply.status(501).send({
        error: 'Kết nối Page sẽ khả dụng ở Phase 2 (cần Meta App đã cấu hình xong)',
        code: 'PHASE_2_PENDING',
      });
    });

  // POST connect Page THỦ CÔNG — đường tạm cho test: nhập tay Page Access Token (lấy từ Meta
  // App dashboard) thay OAuth. Token mã hoá trước khi lưu. authMiddleware đã set tenant context.
  app.post<{ Body: { pageId?: string; pageName?: string; pageAccessToken?: string } }>(
    '/api/v1/channels/facebook/pages/connect-manual', { preHandler: requireGrant('settings', 'edit') },
    async (request, reply) => {
      try {
        const body = request.body ?? {};
        if (!body.pageId || !body.pageAccessToken) {
          return reply.status(400).send({ error: 'pageId và pageAccessToken là bắt buộc' });
        }
        const page = await connectPageManual(request.user!.orgId, {
          pageId: body.pageId,
          pageName: body.pageName ?? null,
          pageAccessToken: body.pageAccessToken,
          connectedByUserId: request.user!.id,
        });
        return { page };
      } catch (err) {
        logger.error('[fb-pages] connect-manual error:', err);
        const msg = err instanceof Error && err.message.includes('FB_TOKEN_ENC_KEY')
          ? 'Chưa cấu hình khoá mã hoá (FB_TOKEN_ENC_KEY) trên server'
          : 'Không kết nối được Page';
        return reply.status(500).send({ error: msg });
      }
    });
}
