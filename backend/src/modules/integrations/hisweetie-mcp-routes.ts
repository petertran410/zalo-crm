/**
 * hisweetie-pos-routes.ts (trước đây là hisweetie-mcp-routes.ts)
 *
 * Admin-facing read APIs over Hisweetie POS — CHUYỂN SANG PUBLIC API THUẦN
 * (2026-08-25, loại bỏ MCP khỏi mã nguồn). URL giữ nguyên để frontend
 * HisweetiePosView không phải đổi:
 *   GET  /api/v1/integrations/hisweetie/status
 *   GET  /api/v1/integrations/hisweetie/health   (probe POS bằng listBranches)
 *   GET  /api/v1/integrations/hisweetie/branches
 *   GET  /api/v1/integrations/hisweetie/customers?search=&pageSize=&currentItem=
 *   GET  /api/v1/integrations/hisweetie/products?page=&limit=&branchId=
 *
 * Auth: JWT + requireGrant('settings', 'access') — same bar as other integrations settings.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import {
  getHisweetiePublicApiClient,
  isPublicApiSyncEnabled,
} from './hisweetie-public-api-client.js';

function notConfigured(reply: FastifyReply) {
  return reply.status(503).send({
    error: 'Hisweetie POS Public API chưa cấu hình',
    code: 'HISWEETIE_PUBLIC_API_NOT_CONFIGURED',
    hint: 'Set HISWEETIE_PUBLIC_API_URL, HISWEETIE_PUBLIC_API_CLIENT_ID, HISWEETIE_PUBLIC_API_CLIENT_SECRET in backend .env',
  });
}

function mapPublicApiError(err: unknown): { status: number; body: Record<string, unknown> } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('chưa cấu hình') || msg.includes('HISWEETIE_PUBLIC_API')) {
    return { status: 503, body: { error: msg, code: 'HISWEETIE_PUBLIC_API_NOT_CONFIGURED' } };
  }
  if (msg.includes('401') || msg.includes('invalid_client')) {
    return { status: 502, body: { error: 'POS OAuth failed — kiểm tra clientId/secret', code: 'HISWEETIE_POS_AUTH', detail: msg } };
  }
  if (msg.includes('429') || msg.includes('rate_limit')) {
    return { status: 429, body: { error: 'POS rate limit', code: 'HISWEETIE_POS_RATE_LIMIT', detail: msg } };
  }
  return { status: 502, body: { error: 'POS API call failed', code: 'HISWEETIE_POS_ERROR', detail: msg } };
}

/** Normalize POS response → always an array for FE tables. */
export function asItemArray(raw: unknown): Record<string, unknown>[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.data)) return o.data as Record<string, unknown>[];
  for (const k of ['items', 'customers', 'products', 'branches', 'result', 'rows']) {
    if (Array.isArray(o[k])) return o[k] as Record<string, unknown>[];
  }
  if (o.data && typeof o.data === 'object' && !Array.isArray(o.data)) {
    const inner = o.data as Record<string, unknown>;
    if (Array.isArray(inner.data)) return inner.data as Record<string, unknown>[];
  }
  return [];
}

export async function hisweetieMcpRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── Status (no secrets) ──────────────────────────────────────────────────
  app.get(
    '/api/v1/integrations/hisweetie/status',
    { preHandler: requireGrant('settings', 'access') },
    async (_request: FastifyRequest, _reply: FastifyReply) => {
      return {
        configured: isPublicApiSyncEnabled(),
        transport: 'public_api' as const,
        writeToolsEnabled: false,
      };
    },
  );

  // ── Health — probe POS bằng 1 request rẻ nhất (1 chi nhánh, pageSize=1) ──
  app.get(
    '/api/v1/integrations/hisweetie/health',
    { preHandler: requireGrant('settings', 'access') },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      if (!isPublicApiSyncEnabled()) return notConfigured(reply);
      try {
        await getHisweetiePublicApiClient().listBranches({ pageSize: 1 });
        return { ok: true, transport: 'public_api' };
      } catch (err) {
        logger.warn('[hisweetie-pos] health probe failed:', err);
        return reply.status(502).send({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          code: 'HISWEETIE_POS_UNREACHABLE',
        });
      }
    },
  );

  // ── Branches ─────────────────────────────────────────────────────────────
  app.get(
    '/api/v1/integrations/hisweetie/branches',
    { preHandler: requireGrant('settings', 'access') },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      if (!isPublicApiSyncEnabled()) return notConfigured(reply);
      try {
        const raw = await getHisweetiePublicApiClient().listBranches({ pageSize: 100 });
        const items = asItemArray(raw);
        return { items, count: items.length };
      } catch (err) {
        logger.error('[hisweetie-pos] branches.list error:', err);
        const m = mapPublicApiError(err);
        return reply.status(m.status).send(m.body);
      }
    },
  );

  // ── Customers (list / search) ────────────────────────────────────────────
  app.get(
    '/api/v1/integrations/hisweetie/customers',
    { preHandler: requireGrant('settings', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isPublicApiSyncEnabled()) return notConfigured(reply);
      const q = request.query as {
        search?: string;
        currentItem?: string;
        pageSize?: string;
      };
      try {
        const api = getHisweetiePublicApiClient();
        if (q.search?.trim()) {
          const raw = await api.searchCustomers(q.search.trim(), 100);
          const items = asItemArray(raw);
          return { items, count: items.length, mode: 'search' as const };
        }
        const currentItem = Math.max(0, parseInt(q.currentItem || '0', 10) || 0);
        const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize || '20', 10) || 20));
        const raw = await api.listCustomers({ currentItem, pageSize });
        const items = asItemArray(raw);
        return { items, count: items.length, mode: 'list' as const, currentItem, pageSize };
      } catch (err) {
        logger.error('[hisweetie-pos] customers error:', err);
        const m = mapPublicApiError(err);
        return reply.status(m.status).send(m.body);
      }
    },
  );

  // ── Products ─────────────────────────────────────────────────────────────
  app.get(
    '/api/v1/integrations/hisweetie/products',
    { preHandler: requireGrant('settings', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isPublicApiSyncEnabled()) return notConfigured(reply);
      const q = request.query as { page?: string; limit?: string; branchId?: string };
      try {
        const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(q.limit || '20', 10) || 20));
        const raw = await getHisweetiePublicApiClient().listProducts({
          currentItem: (page - 1) * limit,
          pageSize: limit,
        });
        const items = asItemArray(raw);
        return { items, count: items.length, page, limit };
      } catch (err) {
        logger.error('[hisweetie-pos] products.list error:', err);
        const m = mapPublicApiError(err);
        return reply.status(m.status).send(m.body);
      }
    },
  );
}
