import type { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { prisma } from '../shared/database/prisma-client.js';
import { logger } from '../shared/utils/logger.js';
import {
  batchUpsertOrders,
  batchUpsertCustomers,
  batchUpsertProducts,
  batchUpsertCustomerDebts,
  batchUpsertInvoices,
  batchUpsertBranchInventory,
  emitPosDataUpdated,
} from '../shared/mcp/pos-sync-service.js';
import { notifyAdminsOfIncidentAsync } from '../modules/system-notifications/system-notify-service.js';

export interface VerifySignatureResult {
  valid: boolean;
  reason?: string;
}

/**
 * Verifies the incoming POS Webhook HMAC-SHA256 signature against request.rawBody.
 */
export function verifyPosWebhookSignature(request: FastifyRequest): VerifySignatureResult {
  const signatureHeader = request.headers['x-pos-signature'];
  if (!signatureHeader || typeof signatureHeader !== 'string') {
    return { valid: false, reason: 'Missing x-pos-signature header' };
  }

  const secret = config.posWebhookSecret || process.env.POS_WEBHOOK_SECRET || 'default_pos_webhook_secret_key_change_me_in_prod';
  const rawBody = request.rawBody;

  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    return { valid: false, reason: 'Raw request body buffer unavailable' };
  }

  const cleanHeader = signatureHeader.replace(/^sha256=/i, '').trim();

  const computedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  try {
    const headerBuffer = Buffer.from(cleanHeader, 'hex');
    const computedBuffer = Buffer.from(computedSignature, 'hex');

    if (headerBuffer.length !== computedBuffer.length) {
      return { valid: false, reason: 'Signature length mismatch' };
    }

    const match = crypto.timingSafeEqual(headerBuffer, computedBuffer);
    return { valid: match, reason: match ? undefined : 'Signature mismatch' };
  } catch (err: any) {
    return { valid: false, reason: `Signature verification error: ${err.message}` };
  }
}

/**
 * Helper to resolve target Organization ID from payload, query, header, or DB fallback.
 */
async function resolveOrgId(request: FastifyRequest, body: any): Promise<string> {
  if (body?.orgId && typeof body.orgId === 'string') return body.orgId;
  if (body?.org_id && typeof body.org_id === 'string') return body.org_id;

  const queryOrgId = (request.query as any)?.orgId;
  if (queryOrgId && typeof queryOrgId === 'string') return queryOrgId;

  const headerOrgId = request.headers['x-org-id'];
  if (headerOrgId && typeof headerOrgId === 'string') return headerOrgId;

  const firstOrg = await prisma.organization.findFirst({ select: { id: true } });
  if (firstOrg) return firstOrg.id;

  throw new Error('Organization context could not be resolved for webhook processing');
}

/**
 * Processes a saved PosWebhookLog record by ID.
 * Increments attempts, executes batch sync via pos-sync-service.ts, updates status.
 */
export async function processPosWebhookLog(logId: string): Promise<boolean> {
  const log = await prisma.posWebhookLog.findUnique({
    where: { id: logId },
  });

  if (!log) {
    logger.error(`[pos-webhook-controller] Webhook log ${logId} not found`);
    return false;
  }

  const currentAttempts = log.attempts + 1;
  const payload = (log.payload || {}) as Record<string, any>;
  const eventType = (log.eventType || payload.event || payload.eventType || '').toLowerCase();
  const orgId = log.orgId;

  try {
    const entityData = payload.data || payload.payload || payload;

    if (eventType.includes('order')) {
      const orderList = Array.isArray(entityData) ? entityData : [entityData];
      await batchUpsertOrders(orgId, orderList);
      emitPosDataUpdated(orgId, {
        type: 'order',
        action: 'synced',
        summary: `Đã cập nhật dữ liệu POS từ Webhook (Đơn hàng #${orderList[0]?.code || orderList[0]?.id || ''})`,
        data: orderList[0],
      });
    } else if (eventType.includes('customer')) {
      const customerList = Array.isArray(entityData) ? entityData : [entityData];
      await batchUpsertCustomers(orgId, customerList);
      emitPosDataUpdated(orgId, {
        type: 'customer',
        action: 'synced',
        summary: `Đã cập nhật dữ liệu POS từ Webhook (Khách hàng ${customerList[0]?.name || customerList[0]?.code || ''})`,
        data: customerList[0],
      });
    } else if (eventType.includes('product')) {
      const productList = Array.isArray(entityData) ? entityData : [entityData];
      await batchUpsertProducts(orgId, productList);
      emitPosDataUpdated(orgId, {
        type: 'product',
        action: 'synced',
        summary: `Đã cập nhật dữ liệu POS từ Webhook (Sản phẩm ${productList[0]?.name || productList[0]?.code || ''})`,
        data: productList[0],
      });
    } else if (eventType.includes('inventory') || eventType.includes('stock')) {
      const inventoryList = Array.isArray(entityData) ? entityData : [entityData];
      await batchUpsertBranchInventory(orgId, inventoryList);
      emitPosDataUpdated(orgId, {
        type: 'inventory',
        action: 'synced',
        summary: `Đã cập nhật dữ liệu POS từ Webhook (Tồn kho ${inventoryList[0]?.productName || inventoryList[0]?.productCode || ''})`,
        data: inventoryList[0],
      });
    } else if (eventType.includes('debt') || eventType.includes('invoice')) {
      const itemList = Array.isArray(entityData) ? entityData : [entityData];
      if (eventType.includes('invoice')) {
        await batchUpsertInvoices(orgId, itemList);
      } else {
        await batchUpsertCustomerDebts(orgId, itemList);
      }
      emitPosDataUpdated(orgId, {
        type: 'debt',
        action: 'synced',
        summary: `Đã cập nhật dữ liệu POS từ Webhook (Công nợ / Hóa đơn)`,
        data: itemList[0],
      });
    } else {
      logger.warn(`[pos-webhook-controller] Unrecognized POS eventType: ${eventType}`);
    }

    await prisma.posWebhookLog.update({
      where: { id: logId },
      data: {
        status: 'PROCESSED',
        attempts: currentAttempts,
        processedAt: new Date(),
        lastError: null,
      },
    });

    logger.info(`[pos-webhook-controller] Webhook log ${logId} processed successfully (Attempt ${currentAttempts})`);
    return true;
  } catch (err: any) {
    const errorMsg = err.message || String(err);
    const newStatus = currentAttempts >= 3 ? 'FAILED' : 'PENDING';

    await prisma.posWebhookLog.update({
      where: { id: logId },
      data: {
        status: newStatus,
        attempts: currentAttempts,
        lastError: errorMsg,
        processedAt: newStatus === 'FAILED' ? new Date() : null,
      },
    });

    if (newStatus === 'FAILED') {
      notifyAdminsOfIncidentAsync({
        orgId,
        type: 'pos_webhook_failed',
        title: '⚠️ CẢNH BÁO: Webhook POS xử lý thất bại (3/3 lần thử)',
        errorMsg,
        logOrJobId: logId,
        eventTypeOrEntity: eventType,
        recommendedAction:
          'Kiểm tra kết nối mạng/API POS. Sau khi khắc phục, truy cập CRM Admin Sync Dashboard để bấm Retry thủ công.',
      });
    }

    logger.error(`[pos-webhook-controller] Processing failed for log ${logId} (Attempt ${currentAttempts}/3): ${errorMsg}`);
    return false;
  }
}

/**
 * Controller handler for POST /api/v1/webhooks/pos
 */
export async function handlePosWebhook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // 1. Signature Verification
  const verifyResult = verifyPosWebhookSignature(request);
  if (!verifyResult.valid) {
    logger.warn(`[pos-webhook-controller] Unauthorized webhook access: ${verifyResult.reason}`);
    return reply.status(401).send({
      error: 'Unauthorized',
      code: 'invalid_signature',
      message: verifyResult.reason || 'Invalid HMAC-SHA256 signature',
    });
  }

  const body = (request.body || {}) as Record<string, any>;
  const eventType = String(body.event || body.eventType || body.type || 'pos.event');

  try {
    const orgId = await resolveOrgId(request, body);

    // 2. Log webhook request as PENDING
    const webhookLog = await prisma.posWebhookLog.create({
      data: {
        orgId,
        eventType,
        payload: body as any,
        status: 'PENDING',
        attempts: 0,
      },
    });

    // 3. Process POS payload immediately
    void processPosWebhookLog(webhookLog.id).catch((err) => {
      logger.error(`[pos-webhook-controller] Async execution error for log ${webhookLog.id}:`, err);
    });

    // 4. Return fast HTTP 200 OK
    return reply.status(200).send({
      success: true,
      logId: webhookLog.id,
      message: 'POS Webhook received and queued for processing',
    });
  } catch (err: any) {
    logger.error('[pos-webhook-controller] Exception handling POS webhook:', err);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: err.message || 'Failed to record POS webhook',
    });
  }
}
