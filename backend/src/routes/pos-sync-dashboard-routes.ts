import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../modules/auth/auth-middleware.js';
import {
  getPosDashboardStatsHandler,
  getPosWebhookLogsHandler,
  retryPosWebhookLogHandler,
  triggerPosSyncHandler,
} from '../controllers/pos-sync-dashboard.controller.js';

export async function posSyncDashboardRoutes(app: FastifyInstance): Promise<void> {
  // Apply authMiddleware to protect all dashboard routes
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/pos/dashboard/stats', getPosDashboardStatsHandler);
  app.get('/api/v1/pos/webhooks/logs', getPosWebhookLogsHandler);
  app.post('/api/v1/pos/webhooks/logs/:id/retry', retryPosWebhookLogHandler);
  app.post('/api/v1/pos/sync/trigger', triggerPosSyncHandler);
}
