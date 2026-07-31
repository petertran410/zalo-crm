import { getPosMcpClient } from '../../shared/mcp/mcp-client.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { getIo } from '../../shared/event-buffer.js';
import {
  batchUpsertCustomers,
  batchUpsertProducts,
  syncPosCustomersFromMcp,
  syncPosProductsFromMcp,
  syncPosOrdersFromMcp,
  syncPosInvoicesFromMcp,
  syncPosBranchInventoryFromMcp,
} from '../../shared/mcp/pos-sync-service.js';
import { notifyAdminsOfIncidentAsync } from '../system-notifications/system-notify-service.js';
import { linkPosCustomersToContacts } from '../../workers/pos-customer-linker.js';

function emitSyncUpdate(orgId: string, data: {
  jobId: string;
  entity: string;
  processed: number;
  total: number;
  status: string;
  lastError?: string | null;
}) {
  const io = getIo();
  if (io) {
    logger.debug(`[sync-worker] Emitting progress update for job ${data.jobId}: ${data.processed}/${data.total} (${data.status})`);
    io.to(`org:${orgId}`).emit('pos:sync:update', data);
  } else {
    logger.warn('[sync-worker] Socket.IO instance not available to emit progress');
  }
}

export async function runBackgroundSync(orgId: string, jobId: string): Promise<void> {
  logger.info(`[sync-worker] Starting background sync job ${jobId} for org ${orgId}`);
  const client = getPosMcpClient();

  // Retrieve current job
  const job = await prisma.syncJob.findUnique({
    where: { id: jobId }
  });

  if (!job) {
    logger.error(`[sync-worker] SyncJob ${jobId} not found in database.`);
    return;
  }

  // Update status to Running
  await prisma.syncJob.update({
    where: { id: jobId },
    data: {
      status: 'Running',
      startTime: new Date(),
    }
  });

  const entity = job.entity;

  try {
    if (entity === 'Customer') {
      // 1. Fetch total count from POS
      let total = 0;
      try {
        const totalsRes = await client.customers.totals({ isActive: true });
        total = Number(totalsRes?.totals ?? totalsRes?.total ?? totalsRes?.count ?? totalsRes?.data ?? 0);
        logger.info(`[sync-worker] POS Customers total: ${total}`);
      } catch (err: any) {
        logger.warn(`[sync-worker] Failed to fetch customer totals: ${err.message || err}`);
      }

      await prisma.syncJob.update({
        where: { id: jobId },
        data: { total }
      });

      emitSyncUpdate(orgId, { jobId, entity, processed: 0, total, status: 'Running' });

      // 2. Fetch page by page
      let currentItem = 0;

      // Kiểm tra có job trước đó bị lỗi/hủy để tiếp tục (resume) không
      const lastJob = await prisma.syncJob.findFirst({
        where: {
          orgId,
          entity: 'Customer',
          id: { not: jobId }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (lastJob && lastJob.status !== 'Completed' && lastJob.processed > 0) {
        currentItem = lastJob.processed;
        logger.info(`[sync-worker] Resuming background customer sync from offset ${currentItem} (previous job: ${lastJob.id}, status: ${lastJob.status})`);
      }

      const pageSize = 100;
      let processed = currentItem;
      let hasMore = true;

      while (hasMore) {
        // Double check if job was cancelled or deleted
        const currentJob = await prisma.syncJob.findUnique({ where: { id: jobId } });
        if (!currentJob || currentJob.status === 'Cancelled') {
          logger.info(`[sync-worker] Job ${jobId} was stopped or deleted.`);
          break;
        }

        const res = await client.customers.list({ currentItem, pageSize, isActive: true });
        const customers = (res as any).data || [];

        if (customers.length === 0) {
          hasMore = false;
          break;
        }

        // Save to Local DB
        await batchUpsertCustomers(orgId, customers);

        processed += customers.length;
        const currentPage = Math.floor(currentItem / pageSize) + 1;

        // Update Job state
        await prisma.syncJob.update({
          where: { id: jobId },
          data: {
            processed,
            currentPage,
          }
        });

        emitSyncUpdate(orgId, { jobId, entity, processed, total: total > 0 ? total : processed, status: 'Running' });
        logger.info(`[sync-worker] Synced ${customers.length} customers. Total processed: ${processed}/${total}`);

        if (customers.length < pageSize) {
          hasMore = false;
        } else {
          currentItem += pageSize;
          if (currentItem > 50000) {
            logger.warn(`[sync-worker] Đã chạm giới hạn tối đa 50,000 khách hàng từ POS MCP Server. Dừng đồng bộ để tránh lỗi offset.`);
            hasMore = false;
          } else {
            // Small pause to prevent rate limiting
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        }
      }

      // Complete
      await prisma.syncJob.update({
        where: { id: jobId },
        data: {
          status: 'Completed',
          endTime: new Date(),
          total: processed, // set final count
        }
      });
      emitSyncUpdate(orgId, { jobId, entity, processed, total: processed, status: 'Completed' });
      logger.info(`[sync-worker] Job ${jobId} (Customer) completed successfully. Total: ${processed}`);

    } else if (entity === 'Product') {
      let page = 1;
      let processed = 0;

      // Kiểm tra có job sản phẩm trước đó bị lỗi/hủy để tiếp tục (resume) không
      const lastJob = await prisma.syncJob.findFirst({
        where: {
          orgId,
          entity: 'Product',
          id: { not: jobId }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (lastJob && lastJob.status !== 'Completed' && lastJob.currentPage > 0) {
        page = lastJob.currentPage;
        processed = lastJob.processed;
        logger.info(`[sync-worker] Resuming background product sync from page ${page}, processed: ${processed} (previous job: ${lastJob.id}, status: ${lastJob.status})`);
      }

      emitSyncUpdate(orgId, { jobId, entity, processed, total: processed, status: 'Running' });

      const limit = 100;
      let hasMore = true;

      while (hasMore) {
        const currentJob = await prisma.syncJob.findUnique({ where: { id: jobId } });
        if (!currentJob || currentJob.status === 'Cancelled') {
          logger.info(`[sync-worker] Job ${jobId} was stopped or deleted.`);
          break;
        }

        const res = await client.products.list({ page, limit });
        const products = (res as any).data || [];

        if (products.length === 0) {
          hasMore = false;
          break;
        }

        // Save to Local DB
        await batchUpsertProducts(orgId, products);

        processed += products.length;

        await prisma.syncJob.update({
          where: { id: jobId },
          data: {
            processed,
            currentPage: page,
          }
        });

        emitSyncUpdate(orgId, { jobId, entity, processed, total: processed, status: 'Running' });
        logger.info(`[sync-worker] Synced ${products.length} products. Total processed: ${processed}`);

        if (products.length < limit) {
          hasMore = false;
        } else {
          page++;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      // Complete
      await prisma.syncJob.update({
        where: { id: jobId },
        data: {
          status: 'Completed',
          endTime: new Date(),
          total: processed,
        }
      });
      emitSyncUpdate(orgId, { jobId, entity, processed, total: processed, status: 'Completed' });
      logger.info(`[sync-worker] Job ${jobId} (Product) completed successfully. Total: ${processed}`);
    } else if (entity === 'Order') {
      emitSyncUpdate(orgId, { jobId, entity, processed: 0, total: -1, status: 'Running' });
      await syncPosOrdersFromMcp(orgId);
      await linkPosCustomersToContacts(orgId);
      await prisma.syncJob.update({
        where: { id: jobId },
        data: { status: 'Completed', endTime: new Date() }
      });
      emitSyncUpdate(orgId, { jobId, entity, processed: 100, total: 100, status: 'Completed' });
    } else if (entity === 'Invoice') {
      emitSyncUpdate(orgId, { jobId, entity, processed: 0, total: -1, status: 'Running' });
      await syncPosInvoicesFromMcp(orgId);
      await linkPosCustomersToContacts(orgId);
      await prisma.syncJob.update({
        where: { id: jobId },
        data: { status: 'Completed', endTime: new Date() }
      });
      emitSyncUpdate(orgId, { jobId, entity, processed: 100, total: 100, status: 'Completed' });
    } else if (entity === 'BranchInventory') {
      emitSyncUpdate(orgId, { jobId, entity, processed: 0, total: -1, status: 'Running' });
      await syncPosBranchInventoryFromMcp(orgId);
      await prisma.syncJob.update({
        where: { id: jobId },
        data: { status: 'Completed', endTime: new Date() }
      });
      emitSyncUpdate(orgId, { jobId, entity, processed: 100, total: 100, status: 'Completed' });
    } else if (entity === 'All') {
      emitSyncUpdate(orgId, { jobId, entity, processed: 0, total: 5, status: 'Running' });
      logger.info(`[sync-worker] Starting ALL sync pipeline: Customer -> Product -> BranchInventory -> Order -> Invoice`);
      await syncPosCustomersFromMcp(orgId);
      emitSyncUpdate(orgId, { jobId, entity, processed: 1, total: 5, status: 'Running' });
      await syncPosProductsFromMcp(orgId);
      emitSyncUpdate(orgId, { jobId, entity, processed: 2, total: 5, status: 'Running' });
      await syncPosBranchInventoryFromMcp(orgId);
      emitSyncUpdate(orgId, { jobId, entity, processed: 3, total: 5, status: 'Running' });
      await syncPosOrdersFromMcp(orgId);
      emitSyncUpdate(orgId, { jobId, entity, processed: 4, total: 5, status: 'Running' });
      await syncPosInvoicesFromMcp(orgId);
      // Link POS customers → contacts một lần duy nhất sau khi toàn bộ data đã sync
      await linkPosCustomersToContacts(orgId);
      await prisma.syncJob.update({
        where: { id: jobId },
        data: { status: 'Completed', endTime: new Date() }
      });
      emitSyncUpdate(orgId, { jobId, entity, processed: 5, total: 5, status: 'Completed' });
    } else {
      throw new Error(`Unsupported sync entity: ${entity}`);
    }
  } catch (err: any) {
    logger.error(`[sync-worker] SyncJob ${jobId} failed:`, err);
    
    // Save failure status
    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: 'Failed',
        endTime: new Date(),
        lastError: err.message || String(err),
        errorCount: { increment: 1 },
      },
    });

    notifyAdminsOfIncidentAsync({
      orgId,
      type: 'pos_sync_critical_error',
      title: '⚠️ CẢNH BÁO: Tiến trình đồng bộ POS gặp sự cố nghiêm trọng',
      errorMsg: err.message || String(err),
      logOrJobId: jobId,
      eventTypeOrEntity: entity,
      recommendedAction:
        'Kiểm tra trạng thái cơ sở dữ liệu và kết nối POS MCP. Vào Admin Sync Dashboard để kích hoạt lại tiến trình đồng bộ.',
    });

    // Fetch the updated total & processed count to emit failure event correctly
    const finalJob = await prisma.syncJob.findUnique({ where: { id: jobId } });
    emitSyncUpdate(orgId, {
      jobId,
      entity,
      processed: finalJob?.processed ?? 0,
      total: finalJob?.total ?? 0,
      status: 'Failed',
      lastError: err.message || String(err)
    });
  }
}
