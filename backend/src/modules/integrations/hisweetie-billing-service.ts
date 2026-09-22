/**
 * hisweetie-billing-service.ts — Tạo + gửi hoá đơn từ chat (goal 4), CÓ TRẠNG THÁI (DB).
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ RANH GIỚI (cập nhật 2026-07-18, anh chốt): CẦU CRM → POS đã MỞ nhưng     ║
 * ║ CHỈ SANG SANDBOX (sandbox-mcp.hisweetievietnam.com).                     ║
 * ║ 2 tầng chặn độc lập:                                                     ║
 * ║   1. Cờ env HISWEETIE_BILLING_DISPATCH=enabled (tắt = không gửi gì).     ║
 * ║   2. hisweetie-sandbox-guard: URL không phải sandbox → THROW bất kể cờ.  ║
 * ║ Production POS: CHƯA có quyền ghi — muốn mở phải thêm host vào guard     ║
 * ║ SAU KHI có quyền + anh xác nhận.                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { config } from '../../config/index.js';
import { getHisweetiePublicApiClient, isPublicApiSyncEnabled } from './hisweetie-public-api-client.js';
import { buildOrderPayload, buildDispatchPayload, type BillingLineInput } from './hisweetie-billing.js';

export interface CreateBillingDraftArgs {
  orgId: string;
  contactId: string;
  createdByUserId: string;
  branchId: number;
  items: BillingLineInput[];
  paidAmount?: number;
  description?: string;
  sourceMessageId?: string;
}

export type CreateBillingDraftResult =
  | { ok: true; draftId: string; totalAmount: number; idempotencyKey: string; posCustomerName: string | null }
  | { ok: false; errors: string[] };

/**
 * Tạo + validate + LƯU draft hoá đơn (status='draft'). KHÔNG tự gửi POS — gửi là
 * bước riêng (dispatchBillingToPos) do người dùng bấm.
 * Snapshot lúc tạo: posCustomerId, posCustomerName (crmName || fullName — cùng quy
 * tắc goal 2), items kèm productName/productCode/unit.
 */
export async function createBillingDraft(args: CreateBillingDraftArgs): Promise<CreateBillingDraftResult> {
  const contact = await prisma.contact.findFirst({
    where: { id: args.contactId, orgId: args.orgId },
    select: { id: true, posCustomerId: true, archivedAt: true, crmName: true, fullName: true },
  });
  if (!contact) return { ok: false, errors: ['KH không tồn tại trong tổ chức'] };
  if (contact.archivedAt) return { ok: false, errors: ['KH đang ở Thùng rác — không thể tạo hoá đơn'] };

  const built = buildOrderPayload({
    posCustomerId: contact.posCustomerId,
    branchId: args.branchId,
    items: args.items,
    paidAmount: args.paidAmount,
    description: args.description,
  });
  if (!built.ok || !built.payload) return { ok: false, errors: built.errors };

  const posCustomerName = (contact.crmName || contact.fullName || '').trim() || null;
  const idempotencyKey = randomUUID();
  const draft = await prisma.posBillingDraft.create({
    data: {
      orgId: args.orgId,
      contactId: contact.id,
      createdByUserId: args.createdByUserId,
      posCustomerId: built.payload.customerId,
      posCustomerName,
      branchId: built.payload.branchId,
      items: built.payload.items as unknown as Prisma.InputJsonValue,
      // Cột Decimal: truyền number/string trực tiếp (Prisma tự cast). KHÔNG dùng
      // new Prisma.Decimal() — instance đó Prisma 7 không serialize lại được.
      totalAmount: built.totalAmount,
      paidAmount: args.paidAmount ?? null,
      description: args.description ?? null,
      status: 'draft',
      idempotencyKey,
      sourceMessageId: args.sourceMessageId ?? null,
    },
    select: { id: true },
  });

  logger.info(`[hisweetie-billing] Draft ${draft.id} created (contact ${contact.id}, total ${built.totalAmount})`);
  return { ok: true, draftId: draft.id, totalAmount: built.totalAmount, idempotencyKey, posCustomerName };
}

/**
 * Cờ mở cầu CRM → POS sandbox. Đọc từ env để không ai vô tình bật bằng code.
 * Lưu ý: đây CHỈ là tầng 1 — tầng 2 (sandbox guard) vẫn chặn nếu URL sai môi trường.
 */
export function isPosBillingDispatchEnabled(): boolean {
  return process.env.HISWEETIE_BILLING_DISPATCH === 'enabled';
}

export type DispatchBillingResult =
  | { ok: true; posOrderId: number | null }
  | {
      ok: false;
      code: 'DISPATCH_DISABLED' | 'PUBLIC_API_NOT_CONFIGURED' | 'NOT_FOUND' | 'ALREADY_SENT' | 'IN_FLIGHT' | 'POS_ERROR';
      error: string;
      posOrderId?: number | null;
    };

/** Móc id đơn POS từ response JsonObject (shape không cam kết — dò các key phổ biến). */
function extractPosOrderId(resp: unknown): number | null {
  if (!resp || typeof resp !== 'object') return null;
  const r = resp as Record<string, unknown>;
  const cands = [r.id, r.orderId, (r.data as Record<string, unknown> | undefined)?.id,
    (r.data as Record<string, unknown> | undefined)?.orderId, (r.order as Record<string, unknown> | undefined)?.id];
  for (const c of cands) {
    const n = Number(c);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

/**
 * Gửi draft → POS SANDBOX (orders.create). Chỉ draft/failed được gửi; sent là chốt.
 * Claim status='pending_dispatch' bằng updateMany có điều kiện → bấm 2 lần/2 tab
 * không tạo 2 đơn. idempotencyKey sinh lúc tạo draft được DÙNG LẠI mọi lần retry
 * → POS không nhân đôi đơn kể cả lỗi mạng giữa chừng.
 */
export async function dispatchBillingToPos(args: { draftId: string; orgId: string }): Promise<DispatchBillingResult> {
  if (!isPosBillingDispatchEnabled()) {
    return { ok: false, code: 'DISPATCH_DISABLED', error: 'Gửi POS đang tắt (HISWEETIE_BILLING_DISPATCH chưa bật)' };
  }
  if (!isPublicApiSyncEnabled()) {
    return { ok: false, code: 'PUBLIC_API_NOT_CONFIGURED', error: 'Hisweetie POS chưa cấu hình' };
  }

  const draft = await prisma.posBillingDraft.findFirst({
    where: { id: args.draftId, orgId: args.orgId },
  });
  if (!draft) return { ok: false, code: 'NOT_FOUND', error: 'Không tìm thấy draft' };
  if (draft.status === 'sent') {
    return { ok: false, code: 'ALREADY_SENT', error: 'Draft đã gửi POS rồi', posOrderId: draft.posOrderId };
  }

  // Claim có điều kiện — thua race (tab khác đang gửi) thì báo IN_FLIGHT, không gửi đôi.
  const claimed = await prisma.posBillingDraft.updateMany({
    where: { id: draft.id, orgId: args.orgId, status: { in: ['draft', 'failed'] } },
    data: { status: 'pending_dispatch' },
  });
  if (claimed.count === 0) {
    return { ok: false, code: 'IN_FLIGHT', error: 'Draft đang được gửi ở phiên khác' };
  }

  const payload = buildDispatchPayload({
    draftId: draft.id,
    posCustomerId: draft.posCustomerId,
    posCustomerName: draft.posCustomerName,
    branchId: draft.branchId,
    items: draft.items as unknown as BillingLineInput[],
    paidAmount: draft.paidAmount != null ? Number(draft.paidAmount) : null,
    description: draft.description,
  });

  try {
    // Public API strict (PUBLIC-API.md §6): chỉ gửi {branchId, customerId,
    // items[{productId, quantity, unitPrice}]} — khuyến mãi POS tự tính lại.
    // buildDispatchPayload sinh shape MCP cũ (có note/discount) → cắt gọn tại đây.
    const dp = payload as unknown as {
      customerId: number; branchId: number;
      items: Array<{ productId: number; quantity: number; unitPrice: number }>;
    };
    const resp = await getHisweetiePublicApiClient().createOrder(
      {
        customerId: dp.customerId,
        branchId: dp.branchId,
        items: dp.items.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice })),
      },
      draft.idempotencyKey,
    );
    const posOrderId = extractPosOrderId(resp);
    if (posOrderId == null) {
      // Vẫn coi là sent (POS đã nhận) nhưng log để đối soát tay — shape response lạ.
      logger.warn(`[hisweetie-billing] Dispatch ${draft.id} OK nhưng không móc được posOrderId; keys=${Object.keys(resp ?? {}).join(',')}`);
    }
    await prisma.posBillingDraft.update({
      where: { id: draft.id },
      data: { status: 'sent', posOrderId, dispatchedAt: new Date(), dispatchError: null },
    });
    logger.info(`[hisweetie-billing] Draft ${draft.id} → POS sandbox OK (posOrderId=${posOrderId ?? 'unknown'})`);
    return { ok: true, posOrderId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.posBillingDraft.update({
      where: { id: draft.id },
      data: { status: 'failed', dispatchError: msg.slice(0, 2000) },
    }).catch((e) => logger.error('[hisweetie-billing] Không ghi được dispatchError:', e));
    logger.error(`[hisweetie-billing] Dispatch ${draft.id} FAILED: ${msg}`);
    return { ok: false, code: 'POS_ERROR', error: msg };
  }
}
