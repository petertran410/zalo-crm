/**
 * hisweetie-mcp-routes.ts — Admin-facing read APIs over Hisweetie POS MCP.
 *
 * Smoke-level surface for CRM UI / Postman after `npm run mcp:smoke` works:
 *   GET  /api/v1/integrations/hisweetie/status
 *   GET  /api/v1/integrations/hisweetie/health   (proxy GET {mcp}/health)
 *   GET  /api/v1/integrations/hisweetie/branches
 *   GET  /api/v1/integrations/hisweetie/customers?search=&pageSize=&currentItem=
 *   GET  /api/v1/integrations/hisweetie/products?page=&limit=&branchId=
 *
 * Auth: JWT + requireGrant('settings', 'access') — same bar as other integrations settings.
 * Writes (orders/invoices) intentionally omitted until product mapping is designed.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { config } from '../../config/index.js';
import {
  getHisweetieClient,
  hisweetieMcpPublicStatus,
  isHisweetieMcpConfigured,
} from './hisweetie-mcp-client.js';

function notConfigured(reply: FastifyReply) {
  return reply.status(503).send({
    error: 'Hisweetie MCP chưa cấu hình',
    code: 'HISWEETIE_MCP_NOT_CONFIGURED',
    hint: 'Set HISWEETIE_MCP_URL, HISWEETIE_CLIENT_ID, HISWEETIE_CLIENT_SECRET in backend .env',
  });
}

function mapMcpError(err: unknown): { status: number; body: Record<string, unknown> } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('not configured') || msg.includes('HISWEETIE')) {
    return { status: 503, body: { error: msg, code: 'HISWEETIE_MCP_NOT_CONFIGURED' } };
  }
  if (msg.includes('OAuth') || msg.includes('authentication') || msg.includes('401')) {
    return { status: 502, body: { error: 'MCP OAuth failed — kiểm tra clientId/secret', code: 'HISWEETIE_MCP_AUTH', detail: msg } };
  }
  if (msg.includes('Rate limit') || msg.includes('429')) {
    return { status: 429, body: { error: 'MCP rate limit', code: 'HISWEETIE_MCP_RATE_LIMIT', detail: msg } };
  }
  return { status: 502, body: { error: 'MCP tool call failed', code: 'HISWEETIE_MCP_ERROR', detail: msg } };
}

/** Normalize MCP structuredContent → always an array for FE tables. */
export function asItemArray(raw: unknown): Record<string, unknown>[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  // MCP often wraps: { data: [...] }
  if (Array.isArray(o.data)) return o.data as Record<string, unknown>[];
  for (const k of ['items', 'customers', 'products', 'branches', 'result', 'rows']) {
    if (Array.isArray(o[k])) return o[k] as Record<string, unknown>[];
  }
  // Nested { data: { data: [...] } }
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
        ...hisweetieMcpPublicStatus(),
        writeToolsEnabled: false,
      };
    },
  );

  // ── Health of remote MCP gateway ─────────────────────────────────────────
  app.get(
    '/api/v1/integrations/hisweetie/health',
    { preHandler: requireGrant('settings', 'access') },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      if (!isHisweetieMcpConfigured()) return notConfigured(reply);
      try {
        const res = await fetch(new URL('/health', config.hisweetieMcpUrl), {
          signal: AbortSignal.timeout(15_000),
        });
        const text = await res.text();
        let body: unknown = text;
        try { body = JSON.parse(text); } catch { /* keep text */ }
        return { ok: res.ok, status: res.status, body };
      } catch (err) {
        logger.warn('[hisweetie-mcp] health probe failed:', err);
        return reply.status(502).send({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          code: 'HISWEETIE_MCP_UNREACHABLE',
        });
      }
    },
  );

  // ── Branches ─────────────────────────────────────────────────────────────
  app.get(
    '/api/v1/integrations/hisweetie/branches',
    { preHandler: requireGrant('settings', 'access') },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      if (!isHisweetieMcpConfigured()) return notConfigured(reply);
      try {
        const raw = await getHisweetieClient().branches.list();
        const items = asItemArray(raw);
        return { items, count: items.length, raw: items.length ? undefined : raw };
      } catch (err) {
        logger.error('[hisweetie-mcp] branches.list error:', err);
        const m = mapMcpError(err);
        return reply.status(m.status).send(m.body);
      }
    },
  );

  // ── Customers (list / search) ────────────────────────────────────────────
  app.get(
    '/api/v1/integrations/hisweetie/customers',
    { preHandler: requireGrant('settings', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isHisweetieMcpConfigured()) return notConfigured(reply);
      const q = request.query as {
        search?: string;
        currentItem?: string;
        pageSize?: string;
        isActive?: string;
      };
      try {
        const client = getHisweetieClient();
        if (q.search?.trim()) {
          const raw = await client.customers.search(q.search.trim());
          const items = asItemArray(raw);
          return { items, count: items.length, mode: 'search' as const };
        }
        const currentItem = Math.max(0, parseInt(q.currentItem || '0', 10) || 0);
        const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize || '20', 10) || 20));
        const args: Record<string, unknown> = { currentItem, pageSize };
        if (q.isActive === 'true') args.isActive = true;
        if (q.isActive === 'false') args.isActive = false;
        const raw = await client.customers.list(args);
        const items = asItemArray(raw);
        return { items, count: items.length, mode: 'list' as const, currentItem, pageSize };
      } catch (err) {
        logger.error('[hisweetie-mcp] customers error:', err);
        const m = mapMcpError(err);
        return reply.status(m.status).send(m.body);
      }
    },
  );

  // ── Products ─────────────────────────────────────────────────────────────
  app.get(
    '/api/v1/integrations/hisweetie/products',
    { preHandler: requireGrant('settings', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isHisweetieMcpConfigured()) return notConfigured(reply);
      const q = request.query as { page?: string; limit?: string; branchId?: string };
      try {
        const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(q.limit || '20', 10) || 20));
        const args: Record<string, unknown> = { page, limit };
        if (q.branchId) {
          const bid = parseInt(q.branchId, 10);
          if (!Number.isNaN(bid)) args.branchId = bid;
        }
        const raw = await getHisweetieClient().products.list(args);
        const items = asItemArray(raw);
        return { items, count: items.length, page, limit };
      } catch (err) {
        logger.error('[hisweetie-mcp] products.list error:', err);
        const m = mapMcpError(err);
        return reply.status(m.status).send(m.body);
      }
    },
  );
}
