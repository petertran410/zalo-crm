import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { runBackgroundSync } from './sync-worker.js';

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

  // GET /api/v1/sync/jobs — list sync jobs (admin only)
  app.get(
    '/api/v1/sync/jobs',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orgId } = request.authCtx!;
        const jobs = await prisma.syncJob.findMany({
          where: { orgId },
          orderBy: { createdAt: 'desc' },
          take: 30, // return recent 30 jobs
        });
        return jobs;
      } catch (err: any) {
        logger.error('[sync-routes] Fetch sync jobs failed:', err);
        return reply.status(500).send({ error: 'Failed to fetch sync jobs' });
      }
    }
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
        return await triggerEntitySync(orgId, userId, 'All', reply);
      } catch (err: any) {
        logger.error('[sync-routes] Start all sync failed:', err);
        return reply.status(500).send({ error: 'Failed to start full pipeline sync' });
      }
    }
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

        if (targetJob.status !== 'Failed') {
          return reply.status(400).send({ error: 'Chỉ có thể chạy lại các job bị lỗi' });
        }

        // Create a new retry job
        const newJob = await prisma.syncJob.create({
          data: {
            orgId,
            userId,
            entity: targetJob.entity,
            status: 'Pending',
            retryCount: targetJob.retryCount + 1,
          }
        });

        // Trigger worker
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
}
