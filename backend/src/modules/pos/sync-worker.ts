import { getPosMcpClient } from '../../shared/mcp/mcp-client.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { getIo } from '../../shared/event-buffer.js';
import { batchUpsertCustomers, batchUpsertProducts } from '../../shared/mcp/pos-sync-service.js';

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
        errorCount: { increment: 1 }
      }
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
