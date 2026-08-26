import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { getIo } from '../../shared/event-buffer.js';
import {
  batchUpsertCustomers,
  batchUpsertProducts,
  getCustomerSyncSince,
  readServerTimestamp,
  syncPosCustomersFromMcp,
  syncPosProductsFromMcp,
  syncPosOrdersFromMcp,
  syncPosInvoicesFromMcp,
  syncPosBranchInventoryFromMcp,
} from '../../shared/mcp/pos-sync-service.js';
import { notifyAdminsOfIncidentAsync } from '../system-notifications/system-notify-service.js';
import { linkPosCustomersToContacts } from '../../workers/pos-customer-linker.js';
import {
  getHisweetiePublicApiClient,
  isPublicApiSyncEnabled,
  isRetryableNetworkError,
  PublicApiUnreachableError,
} from '../integrations/hisweetie-public-api-client.js';
import { withPosSyncLock, SyncCancelledError } from './pos-sync-lock.js';

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

/**
 * Đổi lỗi kỹ thuật thành câu người dùng đọc hiểu được.
 * `lastError` hiện thẳng trên panel đồng bộ ở header, mà "TypeError: fetch
 * failed" thì người vận hành không biết phải làm gì tiếp.
 */
function toUserFacingError(err: any): string {
  const raw = err?.message || String(err);
  if (err instanceof PublicApiUnreachableError || isRetryableNetworkError(err)) {
    return 'Không kết nối được máy chủ POS. Kiểm tra POS có đang chạy không, rồi bấm Chạy lại.';
  }
  if (raw.includes('rate_limit_exceeded') || raw.includes('429')) {
    return 'POS tạm khóa do vượt giới hạn truy cập. Chờ vài phút rồi bấm Chạy lại.';
  }
  if (raw.includes('Hisweetie Public API 401') || raw.includes('Hisweetie Public API 403')) {
    return 'Thông tin kết nối POS không hợp lệ. Kiểm tra lại client id/secret trong cấu hình.';
  }
  if (raw.includes('chưa cấu hình')) {
    return 'Chưa cấu hình kết nối POS. Liên hệ quản trị viên để thiết lập.';
  }
  return raw;
}

/**
 * @param forceFull true (mặc định) = quét toàn bộ, dùng cho thao tác bấm tay.
 *                  false = đồng bộ tăng dần, dùng cho tác vụ nền định kỳ.
 */
export async function runBackgroundSync(
  orgId: string,
  jobId: string,
  forceFull = true,
): Promise<void> {
  const jobPreview = await prisma.syncJob.findUnique({ where: { id: jobId }, select: { entity: true } });
  if (!jobPreview) {
    logger.error(`[sync-worker] SyncJob ${jobId} not found in database.`);
    return;
  }
  return withPosSyncLock(orgId, jobPreview.entity, () => runBackgroundSyncUnlocked(orgId, jobId, forceFull));
}

async function runBackgroundSyncUnlocked(
  orgId: string,
  jobId: string,
  forceFull: boolean,
): Promise<void> {
  logger.info(`[sync-worker] Starting background sync job ${jobId} for org ${orgId}`);
  const job = await prisma.syncJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  // Update status to Running
  await prisma.syncJob.update({
    where: { id: jobId },
    data: {
      status: 'Running',
      startTime: new Date(),
    }
  });

  const entity = job.entity;

  // Truyền xuống các vòng phân trang dài để dừng ngay khi người dùng bấm hủy.
  const shouldCancel = async (): Promise<boolean> => {
    const cur = await prisma.syncJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    });
    return !cur || cur.status === 'Cancelled';
  };

  // Báo ngay Pending → Running. Thiếu bước này thì giao diện kẹt ở
  // "Đang khởi tạo tiến trình" và không bao giờ vẽ thanh tiến trình,
  // dù backend đã chạy và emit tiến độ đều đặn.
  emitSyncUpdate(orgId, {
    jobId,
    entity,
    processed: job.processed ?? 0,
    total: job.total ?? 0,
    status: 'Running',
  });

  try {
    if (entity === 'Customer') {
      // 1. Fetch total count from POS
      let total = 0;
      try {
        // Public API trả tổng số ở `total` của response phân trang; MCP dùng
        // customers.totals. Lấy 1 bản ghi là đủ để biết tổng, không tốn hạn mức.
        const totalsRes: any = await getHisweetiePublicApiClient().listCustomers({ pageSize: 1 });
        total = Number(totalsRes?.total ?? totalsRes?.totals ?? totalsRes?.count ?? totalsRes?.data ?? 0);
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

      // Job chạy lại được seed sẵn `processed` của job hỏng trước đó → tiếp tục
      // từ đúng chỗ dừng. Tách khỏi `forceFull` vì cờ đó còn bật cả delta sync;
      // chạy lại phải giữ full scan, chỉ bỏ qua phần đã lấy xong.
      if (job.processed > 0) {
        currentItem = job.processed;
        logger.info(
          `[sync-worker] Job ${jobId} chạy lại: tiếp tục từ bản ghi ${currentItem}`,
        );
      } else if (!forceFull) {
        // Chỉ resume khi KHÔNG phải bấm tay. Bấm tay mà resume theo offset của job
        // hỏng trước đó sẽ bỏ qua toàn bộ phần đầu danh sách một cách âm thầm.
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
      }

      // Bấm tay từ dashboard luôn quét TOÀN BỘ. Delta chỉ dùng cho sync ngầm
      // (sau create/update KH, cron) — nếu bấm tay cũng delta thì UI hiện "0 bản ghi"
      // và người dùng tưởng không chạy, dù hệ thống đang hoạt động đúng.
      const customerSince =
        !forceFull && isPublicApiSyncEnabled()
          ? await getCustomerSyncSince(orgId)
          : null;

      if (customerSince) {
        // Delta: bắt đầu lại từ đầu danh sách đã lọc, không resume offset full-scan.
        currentItem = 0;
        logger.info(`[sync-worker] Customer delta since ${customerSince.toISOString()}`);
      } else {
        logger.info(`[sync-worker] Customer FULL scan (target ≈ ${total})`);
      }

      const pageSize = 100;
      let processed = currentItem;
      let hasMore = true;
      let cancelled = false;
      // Mốc server của trang ĐẦU tiên — ghi lại lúc job xong để lần delta sau
      // dùng đúng đồng hồ POS thay vì giờ máy CRM (PUBLIC-API.md mục 4).
      let serverTimestamp: Date | null = null;
      // Khi delta, total trên UI phải là số bản ghi delta, không phải tổng 50k của POS.
      let displayTotal = customerSince ? -1 : total;

      while (hasMore) {
        // Double check if job was cancelled or deleted
        const currentJob = await prisma.syncJob.findUnique({ where: { id: jobId } });
        if (!currentJob || currentJob.status === 'Cancelled') {
          logger.info(`[sync-worker] Job ${jobId} was stopped or deleted.`);
          cancelled = true;
          break;
        }

        // KHÔNG gửi `includeInactive`: POS mặc định false = chỉ trả khách CÒN
        // HOẠT ĐỘNG, khớp với `isActive: true` của nhánh MCP và khớp với `total`
        // đếm ở trên (cũng đếm active-only) nên thanh tiến trình không lệch.
        const res = await getHisweetiePublicApiClient().listCustomers({
            currentItem,
            pageSize,
            ...(customerSince ? { lastModifiedFrom: customerSince.toISOString() } : {}),
          });
        const customers = (res as any).data || [];

        if (serverTimestamp === null) serverTimestamp = readServerTimestamp(res);

        // Public API trả total của kết quả đã lọc — dùng để UI biết tiến độ delta.
        if (customerSince && typeof (res as any).total === 'number') {
          displayTotal = Number((res as any).total);
        }

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
            total: displayTotal > 0 ? displayTotal : processed,
          }
        });

        emitSyncUpdate(orgId, {
          jobId,
          entity,
          processed,
          total: displayTotal > 0 ? displayTotal : processed,
          status: 'Running',
        });
        logger.info(
          `[sync-worker] Synced ${customers.length} customers. `
          + `Total processed: ${processed}/${displayTotal > 0 ? displayTotal : '?'}`,
        );

        if (customers.length < pageSize) {
          hasMore = false;
        } else {
          currentItem += pageSize;
          if (currentItem > 50000) {
            logger.warn(`[sync-worker] Đã chạm giới hạn tối đa 50,000 khách hàng. Dừng để tránh lỗi offset.`);
            hasMore = false;
          }
          // Không sleep thêm ở đây: HisweetiePublicApiClient đã giãn nhịp 800ms/request.
        }
      }

      // Hủy giữa chừng: giữ nguyên trạng thái Cancelled, không ghi đè Completed.
      if (cancelled) {
        emitSyncUpdate(orgId, {
          jobId,
          entity,
          processed,
          total: displayTotal > 0 ? displayTotal : processed,
          status: 'Cancelled',
        });
        logger.info(`[sync-worker] Job ${jobId} (Customer) cancelled at ${processed} records.`);
        return;
      }

      // Complete
      await prisma.syncJob.update({
        where: { id: jobId },
        data: {
          status: 'Completed',
          endTime: new Date(),
          // processed = số bản ghi đã đọc từ POS; total = mốc hiển thị trên UI.
          processed,
          total: customerSince ? processed : (total > 0 ? total : processed),
          // Chỉ ghi khi POS thật sự trả mốc; null thì getCustomerSyncSince tự lùi
          // về fallback endTime−5 phút.
          ...(serverTimestamp ? { posTimestamp: serverTimestamp } : {}),
        }
      });
      emitSyncUpdate(orgId, {
        jobId,
        entity,
        processed,
        total: customerSince ? processed : (total > 0 ? total : processed),
        status: 'Completed',
      });
      if (processed === 0 && customerSince) {
        logger.info(
          `[sync-worker] Job ${jobId} (Customer) completed — không có khách thay đổi `
          + `kể từ ${customerSince.toISOString()} (delta).`,
        );
      } else {
        logger.info(`[sync-worker] Job ${jobId} (Customer) completed successfully. Total: ${processed}`);
      }

    } else if (entity === 'Product') {
      let page = 1;
      let processed = 0;

      // Job chạy lại được seed sẵn `processed` của job hỏng trước đó → tiếp tục
      // từ đúng chỗ dừng. Tách khỏi `forceFull` vì cờ đó còn bật cả delta sync;
      // chạy lại phải giữ full scan, chỉ bỏ qua phần đã lấy xong.
      if (job.processed > 0) {
        page = job.currentPage || 1;
        processed = job.processed;
        logger.info(
          `[sync-worker] Job ${jobId} chạy lại: tiếp tục từ trang ${page}, bản ghi ${processed}`,
        );
      } else if (!forceFull) {
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
      }

      emitSyncUpdate(orgId, { jobId, entity, processed, total: processed, status: 'Running' });

      const limit = 100;
      let hasMore = true;
      let productCancelled = false;

      while (hasMore) {
        const currentJob = await prisma.syncJob.findUnique({ where: { id: jobId } });
        if (!currentJob || currentJob.status === 'Cancelled') {
          logger.info(`[sync-worker] Job ${jobId} was stopped or deleted.`);
          productCancelled = true;
          break;
        }

        const res = await getHisweetiePublicApiClient().listProducts({ page, limit });
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

      if (productCancelled) {
        emitSyncUpdate(orgId, { jobId, entity, processed, total: processed, status: 'Cancelled' });
        logger.info(`[sync-worker] Job ${jobId} (Product) cancelled at ${processed} records.`);
        return;
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
      await syncPosOrdersFromMcp(orgId, shouldCancel);
      await linkPosCustomersToContacts(orgId);
      await prisma.syncJob.update({
        where: { id: jobId },
        data: { status: 'Completed', endTime: new Date() }
      });
      emitSyncUpdate(orgId, { jobId, entity, processed: 100, total: 100, status: 'Completed' });
    } else if (entity === 'Invoice') {
      emitSyncUpdate(orgId, { jobId, entity, processed: 0, total: -1, status: 'Running' });
      await syncPosInvoicesFromMcp(orgId, shouldCancel);
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
      await syncPosCustomersFromMcp(orgId, { since: await getCustomerSyncSince(orgId), shouldCancel });
      emitSyncUpdate(orgId, { jobId, entity, processed: 1, total: 5, status: 'Running' });
      await syncPosProductsFromMcp(orgId, shouldCancel);
      emitSyncUpdate(orgId, { jobId, entity, processed: 2, total: 5, status: 'Running' });
      await syncPosBranchInventoryFromMcp(orgId);
      emitSyncUpdate(orgId, { jobId, entity, processed: 3, total: 5, status: 'Running' });
      await syncPosOrdersFromMcp(orgId, shouldCancel);
      emitSyncUpdate(orgId, { jobId, entity, processed: 4, total: 5, status: 'Running' });
      await syncPosInvoicesFromMcp(orgId, shouldCancel);
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
    // Người dùng bấm hủy không phải sự cố — không báo động, không tăng errorCount.
    if (err instanceof SyncCancelledError) {
      const cur = await prisma.syncJob.findUnique({
        where: { id: jobId },
        select: { processed: true, total: true },
      });
      await prisma.syncJob.update({
        where: { id: jobId },
        data: {
          status: 'Cancelled',
          endTime: new Date(),
          lastError: 'Người dùng hủy thủ công',
        },
      });
      emitSyncUpdate(orgId, {
        jobId,
        entity,
        processed: cur?.processed ?? 0,
        total: cur?.total ?? 0,
        status: 'Cancelled',
        lastError: 'Người dùng hủy thủ công',
      });
      logger.info(`[sync-worker] SyncJob ${jobId} cancelled by user.`);
      return;
    }

    logger.error(`[sync-worker] SyncJob ${jobId} failed:`, err);
    const userError = toUserFacingError(err);
    
    // Save failure status
    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: 'Failed',
        endTime: new Date(),
        lastError: userError,
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
      lastError: userError,
    });
  }
}
