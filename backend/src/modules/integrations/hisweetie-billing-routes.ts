/**
 * hisweetie-billing-routes.ts — Tạo hoá đơn từ chat (goal 4) + catalogue sản phẩm POS
 * cho NHÂN VIÊN (sale), không phải admin.
 *
 * Vì sao KHÔNG dùng /integrations/hisweetie/products có sẵn: route đó gác sau
 * requireGrant('settings','access') = quyền admin. Sale chốt đơn trong chat cần đọc
 * sản phẩm/giá + tạo draft nhưng KHÔNG có quyền settings → mở endpoint riêng chỉ
 * cần đăng nhập (giống pattern task/ticket: authMiddleware, không requireGrant).
 *
 * Routes:
 *   GET  /api/v1/pos-catalog/branches                 — chi nhánh (chọn kho xuất)
 *   GET  /api/v1/pos-catalog/products?search=&branchId=&page=&limit=  — tìm sản phẩm
 *   GET  /api/v1/contacts/:contactId/billing-drafts   — danh sách draft của KH
 *   POST /api/v1/contacts/:contactId/billing-drafts   — tạo draft (chưa gửi POS)
 *   POST /api/v1/billing-drafts/:draftId/dispatch     — GỬI draft → POS SANDBOX (2026-07-18)
 *
 * Dispatch chỉ chạy khi HISWEETIE_BILLING_DISPATCH=enabled VÀ URL là sandbox
 * (hisweetie-sandbox-guard). Production POS vẫn khoá.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { assertContactVisible } from '../contacts/contact-scope.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { logActivity } from '../activity/activity-logger.js';
import { getHisweetieClient, isHisweetieMcpConfigured } from './hisweetie-mcp-client.js';
import { asItemArray } from './hisweetie-mcp-routes.js';
import { createBillingDraft, dispatchBillingToPos, isPosBillingDispatchEnabled } from './hisweetie-billing-service.js';
import type { BillingLineInput } from './hisweetie-billing.js';

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Rút gọn record sản phẩm POS → field cần cho picker (bỏ 50+ field rác). */
function slimProduct(raw: Record<string, unknown>) {
  return {
    id: num(raw.id),
    code: (raw.code as string) ?? null,
    name: (raw.fullName as string) || (raw.name as string) || '(không tên)',
    unit: (raw.unit as string) ?? null,
    basePrice: num(raw.basePrice),
    vat: raw.vat != null ? num(raw.vat) : null,
    allowsSale: raw.allowsSale !== false,
  };
}

const DRAFT_SELECT = {
  id: true, status: true, totalAmount: true, paidAmount: true, items: true,
  branchId: true, description: true, posOrderId: true, posCustomerName: true,
  dispatchedAt: true, dispatchError: true, sourceMessageId: true, createdAt: true,
  createdBy: { select: { id: true, fullName: true } },
} as const;

export async function hisweetieBillingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  function notConfigured(reply: FastifyReply) {
    return reply.status(503).send({ error: 'Hisweetie POS chưa cấu hình', code: 'HISWEETIE_MCP_NOT_CONFIGURED' });
  }

  // ── Chi nhánh (chọn kho xuất hàng) ───────────────────────────────────────
  app.get('/api/v1/pos-catalog/branches', async (_req: FastifyRequest, reply: FastifyReply) => {
    if (!isHisweetieMcpConfigured()) return notConfigured(reply);
    try {
      const raw = await getHisweetieClient().branches.list();
      const items = asItemArray(raw).map((b) => ({
        id: num(b.id), name: (b.name as string) ?? '(không tên)', code: (b.code as string) ?? null,
      }));
      return { items };
    } catch (err) {
      logger.error('[pos-catalog] branches error:', err);
      return reply.status(502).send({ error: 'Không tải được chi nhánh POS', code: 'POS_BRANCHES_ERROR' });
    }
  });

  // ── Tìm sản phẩm (picker) ────────────────────────────────────────────────
  app.get('/api/v1/pos-catalog/products', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isHisweetieMcpConfigured()) return notConfigured(reply);
    const q = request.query as { search?: string; branchId?: string; page?: string; limit?: string };
    try {
      const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(q.limit || '20', 10) || 20));
      const args: Record<string, unknown> = { page, limit };
      if (q.search?.trim()) args.search = q.search.trim();
      if (q.branchId) {
        const bid = parseInt(q.branchId, 10);
        if (!Number.isNaN(bid)) args.branchId = bid;
      }
      const raw = await getHisweetieClient().products.list(args);
      const items = asItemArray(raw).map(slimProduct).filter((p) => p.allowsSale);
      const total = num((raw as Record<string, unknown>).total);
      return { items, page, limit, total };
    } catch (err) {
      logger.error('[pos-catalog] products error:', err);
      return reply.status(502).send({ error: 'Không tải được sản phẩm POS', code: 'POS_PRODUCTS_ERROR' });
    }
  });

  // ── Danh sách draft hoá đơn của 1 KH ─────────────────────────────────────
  app.get('/api/v1/contacts/:contactId/billing-drafts', async (request: FastifyRequest<{ Params: { contactId: string } }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { contactId } = request.params;
      const visible = await assertContactVisible({ userId: user.id, orgId: user.orgId, legacyRole: user.role, contactId });
      if (!visible) return reply.status(404).send({ error: 'Contact not found' });

      const drafts = await prisma.posBillingDraft.findMany({
        where: { orgId: user.orgId, contactId },
        orderBy: { createdAt: 'desc' },
        select: DRAFT_SELECT,
      });
      // FE cần biết nút "Gửi POS" có hiệu lực không (cờ env tắt = ẩn nút).
      return { drafts, dispatchEnabled: isPosBillingDispatchEnabled() };
    } catch (err) {
      logger.error('[billing] list drafts error:', err);
      return reply.status(500).send({ error: 'Không tải được danh sách hoá đơn' });
    }
  });

  // ── Tạo draft hoá đơn (chưa gửi POS — gửi là bước riêng) ─────────────────
  app.post('/api/v1/contacts/:contactId/billing-drafts', async (request: FastifyRequest<{
    Params: { contactId: string };
    Body: {
      branchId?: number;
      items?: BillingLineInput[];
      paidAmount?: number;
      description?: string;
      sourceMessageId?: string;
    };
  }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { contactId } = request.params;
      const visible = await assertContactVisible({ userId: user.id, orgId: user.orgId, legacyRole: user.role, contactId });
      if (!visible) return reply.status(404).send({ error: 'Contact not found' });

      const body = request.body || {};
      if (body.branchId == null || !Number.isInteger(body.branchId)) {
        return reply.status(400).send({ error: 'Thiếu chi nhánh (branchId)' });
      }
      if (!Array.isArray(body.items) || body.items.length === 0) {
        return reply.status(400).send({ error: 'Hoá đơn phải có ít nhất 1 sản phẩm' });
      }

      const result = await createBillingDraft({
        orgId: user.orgId,
        contactId,
        createdByUserId: user.id,
        branchId: body.branchId,
        items: body.items,
        paidAmount: body.paidAmount,
        description: body.description,
        sourceMessageId: body.sourceMessageId,
      });

      if (!result.ok) return reply.status(400).send({ error: result.errors.join('; '), errors: result.errors });

      logActivity({
        orgId: user.orgId,
        userId: user.id,
        action: 'billing_draft_create',
        entityType: 'contact',
        entityId: contactId,
        details: {
          draftId: result.draftId, totalAmount: result.totalAmount,
          branchId: body.branchId, itemCount: body.items.length,
          posCustomerName: result.posCustomerName, sourceMessageId: body.sourceMessageId ?? null,
        },
      });

      return reply.status(201).send({
        draftId: result.draftId,
        totalAmount: result.totalAmount,
        status: 'draft',
        dispatched: false,
        dispatchEnabled: isPosBillingDispatchEnabled(),
        note: 'Đã lưu nháp hoá đơn. Bấm "Gửi POS" để đẩy sang POS sandbox.',
      });
    } catch (err) {
      logger.error('[billing] create draft error:', err);
      return reply.status(500).send({ error: 'Không lưu được hoá đơn' });
    }
  });

  // ── Gửi draft → POS SANDBOX (2026-07-18) ─────────────────────────────────
  app.post('/api/v1/billing-drafts/:draftId/dispatch', async (request: FastifyRequest<{ Params: { draftId: string } }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { draftId } = request.params;

      // Quyền: draft thuộc org + KH của draft phải visible với user (cùng rule tab chat).
      const draft = await prisma.posBillingDraft.findFirst({
        where: { id: draftId, orgId: user.orgId },
        select: { id: true, contactId: true },
      });
      if (!draft) return reply.status(404).send({ error: 'Không tìm thấy draft' });
      if (draft.contactId) {
        const visible = await assertContactVisible({ userId: user.id, orgId: user.orgId, legacyRole: user.role, contactId: draft.contactId });
        if (!visible) return reply.status(404).send({ error: 'Không tìm thấy draft' });
      }

      const result = await dispatchBillingToPos({ draftId, orgId: user.orgId });

      if (result.ok) {
        logActivity({
          orgId: user.orgId,
          userId: user.id,
          action: 'billing_dispatch_sent',
          entityType: draft.contactId ? 'contact' : 'billing_draft',
          entityId: draft.contactId ?? draftId,
          details: { draftId, posOrderId: result.posOrderId },
        });
        return { status: 'sent', posOrderId: result.posOrderId };
      }

      if (result.code === 'POS_ERROR') {
        logActivity({
          orgId: user.orgId,
          userId: user.id,
          action: 'billing_dispatch_fail',
          entityType: draft.contactId ? 'contact' : 'billing_draft',
          entityId: draft.contactId ?? draftId,
          details: { draftId, error: result.error.slice(0, 500) },
        });
      }

      const httpByCode: Record<string, number> = {
        DISPATCH_DISABLED: 503, MCP_NOT_CONFIGURED: 503, NOT_FOUND: 404,
        ALREADY_SENT: 409, IN_FLIGHT: 409, POS_ERROR: 502,
      };
      return reply.status(httpByCode[result.code] ?? 500).send({
        error: result.error, code: result.code,
        ...(result.posOrderId != null ? { posOrderId: result.posOrderId } : {}),
      });
    } catch (err) {
      // Gồm cả sandbox-guard throw (URL sai môi trường) — lỗi hệ thống, log to.
      logger.error('[billing] dispatch error:', err);
      return reply.status(500).send({ error: 'Không gửi được hoá đơn sang POS' });
    }
  });
}
