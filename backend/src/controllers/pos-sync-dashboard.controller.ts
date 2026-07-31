import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../shared/database/prisma-client.js';
import { logger } from '../shared/utils/logger.js';
import { processPosWebhookLog } from './pos-webhook.controller.js';
import {
  syncPosProductsFromMcp,
  syncPosCustomersFromMcp,
  syncPosOrdersFromMcp,
  syncPosInvoicesFromMcp,
  syncPosBranchInventoryFromMcp,
} from '../shared/mcp/pos-sync-service.js';

export async function getPosDashboardStatsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.authCtx?.orgId || (request as any).user?.orgId;
    if (!orgId) {
      return reply.status(401).send({ success: false, error: 'Unauthorized: missing org context' });
    }

    const [
      totalOrdersSynced,
      totalDebtRecords,
      totalWebhookEvents,
      failedWebhooksCount,
      pendingWebhooksCount,
      processedWebhooksCount,
      activeJob,
      lastCompletedJob,
    ] = await Promise.all([
      prisma.posOrder.count({ where: { orgId } }),
      prisma.posCustomerDebt.count({ where: { orgId } }),
      prisma.posWebhookLog.count({ where: { orgId } }),
      prisma.posWebhookLog.count({ where: { orgId, status: 'FAILED' } }),
      prisma.posWebhookLog.count({ where: { orgId, status: 'PENDING' } }),
      prisma.posWebhookLog.count({ where: { orgId, status: 'PROCESSED' } }),
      prisma.syncJob.findFirst({
        where: { orgId, status: { in: ['Pending', 'Running'] } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.syncJob.findFirst({
        where: { orgId, status: 'Completed' },
        orderBy: { endTime: 'desc' },
      }),
    ]);

    const syncHealth = failedWebhooksCount > 10 ? 'degraded' : failedWebhooksCount > 0 ? 'warning' : 'healthy';

    return {
      success: true,
      data: {
        totalOrdersSynced,
        totalDebtRecords,
        totalWebhookEvents,
        failedWebhooksCount,
        pendingWebhooksCount,
        processedWebhooksCount,
        syncHealth,
        isSyncing: !!activeJob,
        lastSyncedAt: lastCompletedJob?.endTime ? lastCompletedJob.endTime.toISOString() : null,
        activeJob: activeJob
          ? {
              id: activeJob.id,
              entity: activeJob.entity,
              status: activeJob.status,
              processed: activeJob.processed,
              total: activeJob.total,
              startTime: activeJob.startTime.toISOString(),
            }
          : null,
      },
    };
  } catch (err: any) {
    logger.error('[pos-sync-dashboard] Get stats failed:', err);
    return reply.status(500).send({ success: false, error: err.message || 'Failed to fetch dashboard stats' });
  }
}

export async function getPosWebhookLogsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.authCtx?.orgId || (request as any).user?.orgId;
    if (!orgId) {
      return reply.status(401).send({ success: false, error: 'Unauthorized: missing org context' });
    }

    const query = (request.query || {}) as {
      page?: string;
      limit?: string;
      status?: string;
      eventType?: string;
      search?: string;
    };

    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10) || 20));
    const skip = (page - 1) * limit;

    const whereClause: any = {
      orgId,
    };

    if (query.status && ['PENDING', 'PROCESSED', 'FAILED'].includes(query.status.toUpperCase())) {
      whereClause.status = query.status.toUpperCase();
    }

    if (query.eventType) {
      whereClause.eventType = { contains: String(query.eventType), mode: 'insensitive' };
    }

    if (query.search) {
      const searchStr = String(query.search).trim();
      whereClause.OR = [
        { id: { contains: searchStr, mode: 'insensitive' } },
        { eventType: { contains: searchStr, mode: 'insensitive' } },
      ];
    }

    const [items, totalItems] = await Promise.all([
      prisma.posWebhookLog.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.posWebhookLog.count({ where: whereClause }),
    ]);

    return {
      success: true,
      data: {
        items,
        pagination: {
          page,
          limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
        },
      },
    };
  } catch (err: any) {
    logger.error('[pos-sync-dashboard] Get webhook logs failed:', err);
    return reply.status(500).send({ success: false, error: err.message || 'Failed to fetch webhook logs' });
  }
}

export async function retryPosWebhookLogHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.authCtx?.orgId || (request as any).user?.orgId;
    if (!orgId) {
      return reply.status(401).send({ success: false, error: 'Unauthorized: missing org context' });
    }

    const { id } = request.params as { id: string };
    const log = await prisma.posWebhookLog.findFirst({
      where: { id, orgId },
    });

    if (!log) {
      return reply.status(404).send({ success: false, error: 'Webhook log record not found' });
    }

    const success = await processPosWebhookLog(id);
    const updatedLog = await prisma.posWebhookLog.findUnique({ where: { id } });

    // Emit Socket.IO update if available
    const io = (request.server as any).io;
    if (io) {
      io.to(`org:${orgId}`).emit('pos:webhook:retried', {
        logId: id,
        success,
        status: updatedLog?.status,
        attempts: updatedLog?.attempts,
        lastError: updatedLog?.lastError,
      });
    }

    if (success) {
      return { success: true, message: 'Webhook record retried successfully', data: updatedLog };
    } else {
      return reply.status(400).send({
        success: false,
        error: updatedLog?.lastError || 'Webhook retry execution failed',
        data: updatedLog,
      });
    }
  } catch (err: any) {
    logger.error('[pos-sync-dashboard] Webhook retry failed:', err);
    return reply.status(500).send({ success: false, error: err.message || 'Webhook retry failed' });
  }
}

export async function triggerPosSyncHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = request.authCtx?.orgId || (request as any).user?.orgId;
    if (!orgId) {
      return reply.status(401).send({ success: false, error: 'Unauthorized: missing org context' });
    }

    const activeJob = await prisma.syncJob.findFirst({
      where: { orgId, status: { in: ['Pending', 'Running'] } },
    });

    if (activeJob) {
      return reply.status(409).send({
        success: false,
        error: 'Quá trình đồng bộ dữ liệu POS đang diễn ra, vui lòng chờ trong giây lát.',
        activeJobId: activeJob.id,
      });
    }

    // Trigger async background sync sequence (non-blocking)
    void (async () => {
      try {
        await syncPosProductsFromMcp(orgId);
        await syncPosCustomersFromMcp(orgId);
        await syncPosOrdersFromMcp(orgId);
        await syncPosInvoicesFromMcp(orgId);
        await syncPosBranchInventoryFromMcp(orgId);
      } catch (err: any) {
        logger.error(`[pos-sync-dashboard] Background sync failed for org ${orgId}:`, err);
      }
    })();

    return {
      success: true,
      message: 'Đã kích hoạt quá trình đồng bộ dữ liệu POS nền thành công.',
    };
  } catch (err: any) {
    logger.error('[pos-sync-dashboard] Trigger sync failed:', err);
    return reply.status(500).send({ success: false, error: err.message || 'Trigger sync failed' });
  }
}
