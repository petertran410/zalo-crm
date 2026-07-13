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
import { prisma } from '../../../shared/database/prisma-client.js';
import { authMiddleware } from '../../auth/auth-middleware.js';
import { requireGrant } from '../../rbac/rbac-middleware.js';
import { logger } from '../../../shared/utils/logger.js';
import { getFacebookConfigSafe, upsertFacebookConfig, findOrgByVerifyToken } from './facebook-config.js';

// ── Plugin CÔNG KHAI: webhook Meta (KHÔNG auth) ────────────────────────────────
export async function facebookWebhookRoutes(app: FastifyInstance): Promise<void> {
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

  // POST events — STUB: log + 200 để Meta không retry-storm. Xử lý thật ở Phase 2.
  app.post('/api/v1/channels/facebook/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    // Phase 2:
    //  1. verify X-Hub-Signature-256 (cần raw body — thêm fastify-raw-body) qua verifyWebhookSignature()
    //  2. resolve entry[].id (page id) → FacebookPageAccount → org
    //  3. facebookDriver.normalizeWebhook(body) → ghi Message + emit socket (như listener Zalo)
    //  4. cập nhật FacebookPageAccount.lastWebhookAt
    logger.info(`[fb-webhook] event (stub, chưa xử lý): ${JSON.stringify(request.body ?? {}).slice(0, 300)}`);
    return reply.status(200).send('EVENTS_RECEIVED');
  });
}

// ── Plugin CÓ AUTH: cấu hình + Page (owner/admin qua requireGrant settings) ─────
export async function facebookChannelRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

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
}
