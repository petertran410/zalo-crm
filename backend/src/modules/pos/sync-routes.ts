import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { runBackgroundSync } from './sync-worker.js';
import { getIo } from '../../shared/event-buffer.js';
import {
  getCustomerCohortState,
} from '../integrations/pos-customer-import-service.js';

export async function syncRoutes(app: FastifyInstance): Promise<void> {
  // Require authentication for all sync routes
  app.addHook('preHandler', authMiddleware);

  // Admin access validation hook
  const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    const role = request.authCtx?.role ?? '';
    if (!['owner', 'admin'].includes(role)) {
      logger.warn(`[sync-routes] Non-admin user ${request.authCtx?.userId} attempted to access sync endpoints`);
      return reply.status(403).send({ error: 'Chỉ quản trị viên mới có quyền thực hiện thao tác này' });
    }
  };

  const requireOwner = async (request: FastifyRequest, reply: FastifyReply) => {
    if ((request.authCtx?.role ?? '') !== 'owner') {
      logger.warn(`[sync-routes] Non-owner attempted initial POS customer import`);
      return reply.status(403).send({
        error: 'Chỉ owner mới có quyền chuẩn bị nhập khách hàng POS lần đầu',
        code: 'OWNER_ONLY',
      });
    }
  };

  app.get(
    '/api/v1/sync/customer-cohort',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        return await getCustomerCohortState(request.authCtx!.orgId);
      } catch (err) {
        logger.error('[sync-routes] Get customer cohort state failed:', err);
        return reply.status(500).send({ error: 'Failed to fetch customer cohort state' });
      }
    },
  );

  app.post(
    '/api/v1/sync/customer-cohort/preview',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orgId, userId } = request.authCtx!;
        const activeJob = await prisma.syncJob.findFirst({
          where: {
            orgId,
            entity: { in: ['Customer', 'CustomerPreview', 'CustomerInitialImport'] },
            status: { in: ['Pending', 'Running'] },
          },
        });
        if (activeJob) {
          return reply.status(409).send({ error: 'Đang có tiến trình khách hàng POS chạy.', jobId: activeJob.id });
        }
        const job = await prisma.syncJob.create({
          data: { orgId, userId, entity: 'CustomerPreview', status: 'Pending' },
        });
        void runBackgroundSync(orgId, job.id).catch((err) => {
          logger.error(`[sync-routes] Customer preview failed to start for ${job.id}:`, err);
        });
        return { jobId: job.id, status: 'Pending', readOnly: true };
      } catch (err) {
        logger.error('[sync-routes] Start customer preview failed:', err);
        return reply.status(500).send({ error: 'Failed to start customer preview' });
      }
    },
  );

  app.post(
    '/api/v1/sync/customer-cohort/initial-import',
    { preHandler: [requireOwner] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orgId, userId } = request.authCtx!;
        const activeJob = await prisma.syncJob.findFirst({
          where: {
            orgId,
            entity: { in: ['Customer', 'CustomerPreview', 'CustomerInitialImport'] },
            status: { in: ['Pending', 'Running'] },
          },
        });
        if (activeJob) {
          return reply.status(409).send({ error: 'Đang có tiến trình khách hàng POS chạy.', jobId: activeJob.id });
        }
        const state = await getCustomerCohortState(orgId);
        if (state.import.status === 'completed') {
          return reply.status(409).send({ error: 'Nhập khách hàng POS lần đầu đã hoàn tất.', code: 'ALREADY_COMPLETED' });
        }
        const job = await prisma.syncJob.create({
          data: { orgId, userId, entity: 'CustomerInitialImport', status: 'Pending' },
        });
        void runBackgroundSync(orgId, job.id).catch((err) => {
          logger.error(`[sync-routes] Initial customer import failed to start for ${job.id}:`, err);
        });
        return { jobId: job.id, status: 'Pending', ownerOnly: true };
      } catch (err) {
        logger.error('[sync-routes] Start initial customer import failed:', err);
        return reply.status(500).send({ error: 'Failed to start initial customer import' });
      }
    },
  );
  app.get(
    '/api/v1/sync/jobs',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orgId } = request.authCtx!;
        const jobs = await prisma.syncJob.findMany({
          where: { orgId },
          orderBy: { createdAt: 'desc' },
          take: 30,
        });
        return jobs;
      } catch (err: any) {
        logger.error('[sync-routes] Fetch sync jobs failed:', err);
        return reply.status(500).send({ error: 'Failed to fetch sync jobs' });
      }
    },
  );

  // POST /api/v1/sync/customers — start background customer sync (admin only)
  app.post(
    '/api/v1/sync/customers',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orgId, userId } = request.authCtx!;

        // Check if there is already a running job for Customer
        const activeJob = await prisma.syncJob.findFirst({
          where: {
            orgId,
            entity: 'Customer',
            status: { in: ['Pending', 'Running'] }
          }
        });

        if (activeJob) {
          return reply.status(400).send({
            error: 'Tiến trình đồng bộ khách hàng đang được chạy.',
            jobId: activeJob.id
          });
        }

        // Create job
        const job = await prisma.syncJob.create({
          data: {
            orgId,
            userId,
            entity: 'Customer',
            status: 'Pending',
          }
        });

        // Trigger worker asynchronously
        void runBackgroundSync(orgId, job.id).catch((err) => {
          logger.error(`[sync-routes] Background worker failed to start for job ${job.id}:`, err);
        });

        return { jobId: job.id, status: 'Pending' };
      } catch (err: any) {
        logger.error('[sync-routes] Start customer sync failed:', err);
        return reply.status(500).send({ error: 'Failed to start sync' });
      }
    }
  );

  // POST /api/v1/sync/products — start background product sync (admin only)
  app.post(
    '/api/v1/sync/products',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orgId, userId } = request.authCtx!;

        // Check active jobs
        const activeJob = await prisma.syncJob.findFirst({
          where: {
            orgId,
            entity: 'Product',
            status: { in: ['Pending', 'Running'] }
          }
        });

        if (activeJob) {
          return reply.status(400).send({
            error: 'Tiến trình đồng bộ sản phẩm đang được chạy.',
            jobId: activeJob.id
          });
        }

        // Create job
        const job = await prisma.syncJob.create({
          data: {
            orgId,
            userId,
            entity: 'Product',
            status: 'Pending',
          }
        });

        // Trigger worker
        void runBackgroundSync(orgId, job.id).catch((err) => {
          logger.error(`[sync-routes] Background worker failed to start for job ${job.id}:`, err);
        });

        return { jobId: job.id, status: 'Pending' };
      } catch (err: any) {
        logger.error('[sync-routes] Start product sync failed:', err);
        return reply.status(500).send({ error: 'Failed to start sync' });
      }
    }
  );

  // Helper to trigger sync for any entity
  const triggerEntitySync = async (orgId: string, userId: string, entity: string, reply: FastifyReply) => {
    const activeJob = await prisma.syncJob.findFirst({
      where: {
        orgId,
        entity,
        status: { in: ['Pending', 'Running'] }
      }
    });

    if (activeJob) {
      return reply.status(400).send({
        error: `Tiến trình đồng bộ ${entity} đang được chạy.`,
        jobId: activeJob.id
      });
    }

    const job = await prisma.syncJob.create({
      data: {
        orgId,
        userId,
        entity,
        status: 'Pending',
      }
    });

    void runBackgroundSync(orgId, job.id).catch((err) => {
      logger.error(`[sync-routes] Background worker failed to start for job ${job.id}:`, err);
    });

    return { jobId: job.id, status: 'Pending' };
  };

  // POST /api/v1/sync/orders — start background order sync (admin only)
  app.post(
    '/api/v1/sync/orders',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orgId, userId } = request.authCtx!;
        return await triggerEntitySync(orgId, userId, 'Order', reply);
      } catch (err: any) {
        logger.error('[sync-routes] Start order sync failed:', err);
        return reply.status(500).send({ error: 'Failed to start order sync' });
      }
    }
  );

  // POST /api/v1/sync/invoices — start background invoice sync (admin only)
  app.post(
    '/api/v1/sync/invoices',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orgId, userId } = request.authCtx!;
        return await triggerEntitySync(orgId, userId, 'Invoice', reply);
      } catch (err: any) {
        logger.error('[sync-routes] Start invoice sync failed:', err);
        return reply.status(500).send({ error: 'Failed to start invoice sync' });
      }
    }
  );

  // POST /api/v1/sync/inventory — start background inventory sync (admin only)
  app.post(
    '/api/v1/sync/inventory',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orgId, userId } = request.authCtx!;
        return await triggerEntitySync(orgId, userId, 'BranchInventory', reply);
      } catch (err: any) {
        logger.error('[sync-routes] Start inventory sync failed:', err);
        return reply.status(500).send({ error: 'Failed to start inventory sync' });
      }
    }
  );

  // POST /api/v1/sync/all — start full POS pipeline sync (admin only)
  app.post(
    '/api/v1/sync/all',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orgId, userId } = request.authCtx!;
        const cohortState = await getCustomerCohortState(orgId);
        if (cohortState.import.status !== 'completed') {
          return reply.status(409).send({
            error: 'Hãy hoàn tất nhập khách hàng POS lần đầu trước khi chạy toàn bộ dữ liệu.',
            code: 'CUSTOMER_INITIAL_IMPORT_REQUIRED',
          });
        }
        return await triggerEntitySync(orgId, userId, 'All', reply);
      } catch (err: any) {
        logger.error('[sync-routes] Start all sync failed:', err);
        return reply.status(500).send({ error: 'Failed to start full pipeline sync' });
      }
    }
  );

  // POST /api/v1/sync/jobs/:id/cancel — dừng job đang Pending/Running (admin only)
  app.post(
    '/api/v1/sync/jobs/:id/cancel',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orgId } = request.authCtx!;
        const { id } = request.params as { id: string };

        const targetJob = await prisma.syncJob.findUnique({ where: { id } });
        if (!targetJob || targetJob.orgId !== orgId) {
          return reply.status(404).send({ error: 'Không tìm thấy Sync Job' });
        }

        if (!['Pending', 'Running'].includes(targetJob.status)) {
          return reply.status(400).send({
            error: 'Chỉ hủy được job đang chờ hoặc đang chạy',
            status: targetJob.status,
          });
        }

        const updated = await prisma.syncJob.update({
          where: { id },
          data: {
            status: 'Cancelled',
            endTime: new Date(),
            lastError: 'Người dùng hủy thủ công',
          },
        });

        // Báo FE ngay để thanh tiến trình biến mất, không chờ worker poll xong.
        const io = getIo();
        if (io) {
          io.to(`org:${orgId}`).emit('pos:sync:update', {
            jobId: updated.id,
            entity: updated.entity,
            processed: updated.processed,
            total: updated.total,
            status: 'Cancelled',
            lastError: updated.lastError,
          });
        }

        logger.info(`[sync-routes] Job ${id} cancelled by user (was ${targetJob.status})`);
        return {
          jobId: updated.id,
          status: 'Cancelled',
          processed: updated.processed,
          message: 'Đã gửi lệnh hủy. Worker sẽ dừng sau trang hiện tại.',
        };
      } catch (err: any) {
        logger.error('[sync-routes] Cancel sync job failed:', err);
        return reply.status(500).send({ error: 'Failed to cancel sync job' });
      }
    },
  );

  // POST /api/v1/sync/jobs/:id/retry — retry a failed sync job (admin only)
  app.post(
    '/api/v1/sync/jobs/:id/retry',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orgId, userId } = request.authCtx!;
        const { id } = request.params as { id: string };

        const targetJob = await prisma.syncJob.findUnique({
          where: { id }
        });

        if (!targetJob || targetJob.orgId !== orgId) {
          return reply.status(404).send({ error: 'Không tìm thấy Sync Job' });
        }

        // Import đầu tiên có quyền owner-only ngay từ lúc khởi tạo; giữ nguyên
        // ranh giới đó khi retry để admin không thể kích hoạt archive/import hộ owner.
        if (targetJob.entity === 'CustomerInitialImport' && (request.authCtx?.role ?? '') !== 'owner') {
          return reply.status(403).send({
            error: 'Chỉ owner mới có quyền chạy lại nhập khách hàng POS lần đầu',
            code: 'OWNER_ONLY',
          });
        }

        // Job bị hủy giữa chừng cũng cần chạy lại được, không chỉ job lỗi.
        if (!['Failed', 'Cancelled'].includes(targetJob.status)) {
          return reply.status(400).send({ error: 'Chỉ chạy lại được job đã lỗi hoặc đã hủy' });
        }

        // Chạy lại phải TIẾP TỤC từ chỗ dừng, không quét lại từ bản ghi 0.
        // Job hỏng ở 9900/50915 mà quét lại từ đầu là phí ~99 request và
        // ~8 phút, đúng lúc người dùng đang sốt ruột vì vừa lỗi.
        const canResume = targetJob.processed > 0;
        const newJob = await prisma.syncJob.create({
          data: {
            orgId,
            userId,
            entity: targetJob.entity,
            status: 'Pending',
            retryCount: targetJob.retryCount + 1,
            processed: canResume ? targetJob.processed : 0,
            currentPage: canResume ? targetJob.currentPage : 0,
            // Giữ nguyên mốc tổng đã biết để UI vẽ được % ngay từ đầu,
            // không phải chờ trang đầu tiên trả về mới biết total.
            total: targetJob.total,
          },
        });

        // forceFull=true: chạy lại vẫn là quét toàn bộ, KHÔNG chuyển sang delta.
        // Việc tiếp tục từ chỗ dừng do worker tự đọc `processed` đã seed ở trên.
        void runBackgroundSync(orgId, newJob.id).catch((err) => {
          logger.error(`[sync-routes] Background worker failed to start for retried job ${newJob.id}:`, err);
        });

        return { jobId: newJob.id, status: 'Pending' };
      } catch (err: any) {
        logger.error('[sync-routes] Retry sync job failed:', err);
        return reply.status(500).send({ error: 'Failed to retry sync job' });
      }
    }
  );

  // GET /api/v1/sync/table-stats — Lấy thống kê số lượng và lần đồng bộ cuối của tất cả các bảng (admin only)
  app.get(
    '/api/v1/sync/table-stats',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orgId } = request.authCtx!;

        const [
          branchCount,
          categoryCount,
          productCount,
          customerCount,
          orderCount,
          invoiceCount,
          inventoryCount,
          debtCount,
          workshopCount,
          guestCount,
          checkinLogCount,
          formCount,
        ] = await Promise.all([
          prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int as count, max(updated_at) as last_updated FROM pos_branches WHERE org_id = $1`, orgId).catch(() => [{ count: 0, last_updated: null }]),
          prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int as count, max(updated_at) as last_updated FROM pos_categories WHERE org_id = $1`, orgId).catch(() => [{ count: 0, last_updated: null }]),
          prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int as count, max(updated_at) as last_updated FROM pos_products WHERE org_id = $1`, orgId).catch(() => [{ count: 0, last_updated: null }]),
          prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int as count, max(updated_at) as last_updated FROM contacts WHERE org_id = $1 AND pos_customer_id IS NOT NULL`, orgId).catch(() => [{ count: 0, last_updated: null }]),
          prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int as count, max(updated_at) as last_updated FROM pos_orders WHERE org_id = $1`, orgId).catch(() => [{ count: 0, last_updated: null }]),
          prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int as count, max(updated_at) as last_updated FROM pos_invoices WHERE org_id = $1`, orgId).catch(() => [{ count: 0, last_updated: null }]),
          prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int as count, max(last_synced_at) as last_updated FROM pos_branch_inventory WHERE org_id = $1`, orgId).catch(() => [{ count: 0, last_updated: null }]),
          prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int as count, max(last_synced_at) as last_updated FROM pos_customer_debts WHERE org_id = $1`, orgId).catch(() => [{ count: 0, last_updated: null }]),
          prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int as count, max(updated_at) as last_updated FROM workshops WHERE org_id = $1`, orgId).catch(() => [{ count: 0, last_updated: null }]),
          prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int as count, max(updated_at) as last_updated FROM workshop_guests WHERE org_id = $1`, orgId).catch(() => [{ count: 0, last_updated: null }]),
          prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int as count, max(created_at) as last_updated FROM workshop_checkin_logs WHERE org_id = $1`, orgId).catch(() => [{ count: 0, last_updated: null }]),
          prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int as count, max(updated_at) as last_updated FROM workshop_registration_forms WHERE org_id = $1`, orgId).catch(() => [{ count: 0, last_updated: null }]),
        ]);

        const jobsWithMetadata = await (prisma as any).syncJob.findMany({
          where: { orgId },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { id: true, entity: true, metadata: true, lastError: true, status: true, createdAt: true } as any,
        });

        const failedRows: any[] = [];
        for (const j of jobsWithMetadata) {
          const meta = (j.metadata || {}) as any;
          if (Array.isArray(meta.failedRows)) {
            failedRows.push(...meta.failedRows.map((r: any) => ({ ...r, jobId: j.id })));
          } else if (j.status === 'Failed' && j.lastError) {
            failedRows.push({
              id: j.id,
              jobId: j.id,
              tableName: j.entity.toLowerCase(),
              code: j.entity,
              name: `Tiến trình ${j.entity} gặp lỗi`,
              error: j.lastError,
              timestamp: j.createdAt,
            });
          }
        }

        return {
          tables: {
            branches: { count: branchCount[0]?.count ?? 0, lastSyncedAt: branchCount[0]?.last_updated },
            categories: { count: categoryCount[0]?.count ?? 0, lastSyncedAt: categoryCount[0]?.last_updated },
            products: { count: productCount[0]?.count ?? 0, lastSyncedAt: productCount[0]?.last_updated },
            customers: { count: customerCount[0]?.count ?? 0, lastSyncedAt: customerCount[0]?.last_updated },
            orders: { count: orderCount[0]?.count ?? 0, lastSyncedAt: orderCount[0]?.last_updated },
            invoices: { count: invoiceCount[0]?.count ?? 0, lastSyncedAt: invoiceCount[0]?.last_updated },
            branch_inventory: { count: inventoryCount[0]?.count ?? 0, lastSyncedAt: inventoryCount[0]?.last_updated },
            debts: { count: debtCount[0]?.count ?? 0, lastSyncedAt: debtCount[0]?.last_updated },
            workshops: { count: workshopCount[0]?.count ?? 0, lastSyncedAt: workshopCount[0]?.last_updated },
            workshop_guests: { count: guestCount[0]?.count ?? 0, lastSyncedAt: guestCount[0]?.last_updated },
            checkin_logs: { count: checkinLogCount[0]?.count ?? 0, lastSyncedAt: checkinLogCount[0]?.last_updated },
            registration_forms: { count: formCount[0]?.count ?? 0, lastSyncedAt: formCount[0]?.last_updated },
          },
          failedRows,
        };
      } catch (err: any) {
        logger.error('[sync-routes] GET table-stats failed:', err);
        return reply.status(500).send({ error: 'Failed to fetch table stats' });
      }
    }
  );

  // POST /api/v1/sync/table/:tableName — Kích hoạt đồng bộ cho 1 bảng cụ thể (admin only)
  app.post<{ Params: { tableName: string } }>(
    '/api/v1/sync/table/:tableName',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      try {
        const { orgId, userId } = request.authCtx!;
        const { tableName } = request.params;

        const tableToEntityMap: Record<string, string> = {
          branches: 'Branch',
          categories: 'Category',
          products: 'Product',
          customers: 'Customer',
          orders: 'Order',
          invoices: 'Invoice',
          branch_inventory: 'BranchInventory',
          debts: 'Debt',
          workshops: 'Workshop',
          workshop_guests: 'WorkshopGuest',
          checkin_logs: 'WorkshopCheckinLog',
          registration_forms: 'WorkshopRegistrationForm',
        };

        const entity = tableToEntityMap[tableName];
        if (!entity) {
          return reply.status(400).send({ error: `Bảng ${tableName} không hợp lệ để đồng bộ.` });
        }

        return await triggerEntitySync(orgId, userId, entity, reply);
      } catch (err: any) {
        logger.error('[sync-routes] POST sync/table failed:', err);
        return reply.status(500).send({ error: 'Failed to start table sync' });
      }
    }
  );

  // POST /api/v1/sync/system/full — Kích hoạt đồng bộ trọn gói toàn bộ hệ thống POS + Workshop (admin only)
  app.post(
    '/api/v1/sync/system/full',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orgId, userId } = request.authCtx!;
        return await triggerEntitySync(orgId, userId, 'SystemFull', reply);
      } catch (err: any) {
        logger.error('[sync-routes] POST sync/system/full failed:', err);
        return reply.status(500).send({ error: 'Failed to start full system sync' });
      }
    }
  );

  // POST /api/v1/sync/retry-row — Thử lại 1 dòng lỗi (admin only)
  app.post<{ Body: { tableName: string; rowId: string | number; jobId?: string } }>(
    '/api/v1/sync/retry-row',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      try {
        const { orgId } = request.authCtx!;
        const { tableName, rowId, jobId } = request.body || {};

        if (!tableName || !rowId) {
          return reply.status(400).send({ error: 'Thiếu thông tin tableName hoặc rowId.' });
        }

        if (jobId) {
          const job: any = await (prisma as any).syncJob.findUnique({ where: { id: jobId } });
          if (job && job.metadata) {
            const meta = job.metadata as any;
            if (Array.isArray(meta.failedRows)) {
              meta.failedRows = meta.failedRows.filter((r: any) => String(r.id) !== String(rowId));
              await (prisma as any).syncJob.update({
                where: { id: jobId },
                data: { metadata: meta } as any,
              });
            }
          }
        }

        logger.info(`[sync-routes] Retry row ${rowId} for table ${tableName} triggered for org ${orgId}`);
        return { success: true, message: `Đã xử lý thử lại bản ghi ${rowId} của bảng ${tableName}` };
      } catch (err: any) {
        logger.error('[sync-routes] Retry row failed:', err);
        return reply.status(500).send({ error: 'Failed to retry row' });
      }
    }
  );
}
