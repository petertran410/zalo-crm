/**
 * status-routes.ts — CRUD cho Status (Trạng thái KH) per-org.
 * Settings UI dùng để add/edit/delete/reorder status custom.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';

export async function statusRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // List all statuses for org, ordered ascending
  app.get('/api/v1/settings/statuses', async (request: FastifyRequest) => {
    const user = request.user!;
    const statuses = await prisma.status.findMany({
      where: { orgId: user.orgId },
      orderBy: { order: 'asc' },
    });
    return { statuses };
  });

}
