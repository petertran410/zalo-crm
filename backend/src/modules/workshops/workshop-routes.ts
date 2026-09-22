import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireAdmin } from '../auth/admin-guard.js';
import { logger } from '../../shared/utils/logger.js';
import { workshopService } from './workshop-service.js';

export async function workshopRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  /**
   * GET /api/v1/workshops/status
   * Kiểm tra trạng thái cấu hình & kết nối tới máy chủ Workshop Public API
   */
  app.get('/api/v1/workshops/status', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = await workshopService.getStatus();
      return status;
    } catch (err) {
      logger.error('[workshops] GET status error:', err);
      return reply.status(500).send({ error: 'Không thể kiểm tra trạng thái Workshop API' });
    }
  });

  /**
   * POST /api/v1/workshops/sync
   * Đồng bộ danh sách Workshops từ API ngoài về CRM (Admin only)
   */
  app.post('/api/v1/workshops/sync', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId } = request.user!;
      const result = await workshopService.syncWorkshops(orgId);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[workshops] POST sync error:', err);
      return reply.status(500).send({ error: msg || 'Đồng bộ workshops thất bại' });
    }
  });

  /**
   * POST /api/v1/workshops/sync-all-guests
   * Đồng bộ khách mời của toàn bộ workshops (Admin only)
   */
  app.post('/api/v1/workshops/sync-all-guests', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId } = request.user!;
      const result = await workshopService.syncAllWorkshopGuests(orgId);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[workshops] POST sync-all-guests error:', err);
      return reply.status(500).send({ error: msg || 'Đồng bộ toàn bộ khách mời thất bại' });
    }
  });

  /**
   * POST /api/v1/workshops/sync-checkin-logs
   * Đồng bộ nhật ký check-in từ server ngoài (Admin only)
   */
  app.post('/api/v1/workshops/sync-checkin-logs', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId } = request.user!;
      const result = await workshopService.syncCheckinLogs(orgId);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[workshops] POST sync-checkin-logs error:', err);
      return reply.status(500).send({ error: msg || 'Đồng bộ nhật ký check-in thất bại' });
    }
  });

  /**
   * POST /api/v1/workshops/sync-forms
   * Đồng bộ cấu hình các biểu mẫu đăng ký (Admin only)
   */
  app.post('/api/v1/workshops/sync-forms', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId } = request.user!;
      const result = await workshopService.syncRegistrationForms(orgId);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[workshops] POST sync-forms error:', err);
      return reply.status(500).send({ error: msg || 'Đồng bộ biểu mẫu thất bại' });
    }
  });

  /**
   * POST /api/v1/workshops/sync-all
   * Đồng bộ toàn diện hệ thống workshop (Workshops + Khách + Checkin Logs + Biểu mẫu) (Admin only)
   */
  app.post('/api/v1/workshops/sync-all', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId } = request.user!;
      const result = await workshopService.syncAll(orgId);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[workshops] POST sync-all error:', err);
      return reply.status(500).send({ error: msg || 'Đồng bộ toàn diện workshop thất bại' });
    }
  });

  /**
   * GET /api/v1/workshops
   * Lấy danh sách Workshops từ Database CRM
   */
  app.get('/api/v1/workshops', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId } = request.user!;
      const workshops = await workshopService.getWorkshops(orgId);
      return { data: workshops };
    } catch (err) {
      logger.error('[workshops] GET list error:', err);
      return reply.status(500).send({ error: 'Không thể tải danh sách workshops' });
    }
  });

  /**
   * POST /api/v1/workshops/:id/sync-guests
   * Kéo và làm mới danh sách khách mời của 1 workshop cụ thể (Lazy sync - Admin only)
   */
  app.post<{ Params: { id: string } }>('/api/v1/workshops/:id/sync-guests', { preHandler: [requireAdmin] }, async (request, reply) => {
    try {
      const { orgId } = request.user!;
      const { id } = request.params;
      const result = await workshopService.syncWorkshopGuests(orgId, id);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[workshops] POST sync-guests error:', err);
      return reply.status(500).send({ error: msg || 'Đồng bộ khách mời thất bại' });
    }
  });

  /**
   * GET /api/v1/workshops/:id
   * Lấy chi tiết Workshop và toàn bộ Khách mời kèm đối soát Contact CRM
   */
  app.get('/api/v1/workshops/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { orgId } = request.user!;
      const { id } = request.params;
      const data = await workshopService.getWorkshopDetail(orgId, id);
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[workshops] GET detail error:', err);
      return reply.status(404).send({ error: msg || 'Không tìm thấy workshop' });
    }
  });

  /**
   * GET /api/v1/workshops/checkins/logs
   * Xem lịch sử check-in từ Workshop server ngoài (làm giàu với dữ liệu khách mời CRM)
   */
  app.get('/api/v1/workshops/checkins/logs', async (request: FastifyRequest<{ Querystring: { workshop_id?: string; page?: string; per_page?: string } }>, reply: FastifyReply) => {
    try {
      const { orgId } = request.user!;
      const page = request.query.page ? parseInt(request.query.page, 10) : 1;
      const perPage = request.query.per_page ? Math.min(parseInt(request.query.per_page, 10), 100) : 50;
      const workshopId = request.query.workshop_id;
      const logs = await workshopService.getCheckinLogs(orgId, { workshop_id: workshopId, page, per_page: perPage });
      return logs;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[workshops] GET checkin logs error:', err);
      return reply.status(500).send({ error: msg || 'Không thể tải nhật ký check-in' });
    }
  });

  /**
   * GET /api/v1/workshops/forms
   * Lấy danh sách các biểu mẫu đăng ký từ các workshop
   */
  app.get('/api/v1/workshops/forms', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orgId } = request.user!;
      const forms = await workshopService.getRegistrationForms(orgId);
      return { data: forms };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[workshops] GET registration forms error:', err);
      return reply.status(500).send({ error: msg || 'Không thể tải danh sách biểu mẫu đăng ký' });
    }
  });

  /**
   * GET /api/v1/workshops/forms/:token
   * Lấy chi tiết 1 biểu mẫu đăng ký theo token
   */
  app.get('/api/v1/workshops/forms/:token', async (request: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
    try {
      const { token } = request.params;
      const form = await workshopService.getRegistrationFormDetail(token);
      return form;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[workshops] GET form detail error:', err);
      return reply.status(404).send({ error: msg || 'Không tìm thấy biểu mẫu đăng ký' });
    }
  });

  /**
   * GET /api/v1/workshops/guests/lookup
   * Tra cứu khách mời từ Workshop server
   */
  app.get('/api/v1/workshops/guests/lookup', async (request: FastifyRequest<{ Querystring: Record<string, string> }>, reply: FastifyReply) => {
    try {
      const result = await workshopService.lookupGuests(request.query);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[workshops] GET guest lookup error:', err);
      return reply.status(500).send({ error: msg || 'Tra cứu khách mời thất bại' });
    }
  });

  /**
   * POST /api/v1/workshops/checkins
   * Gửi thao tác check-in tới Workshop server (hỗ trợ Idempotency-Key)
   */
  app.post('/api/v1/workshops/checkins', async (request: FastifyRequest<{ Body: { qr_code?: string; guest_id?: string; workshop_id?: string } }>, reply: FastifyReply) => {
    try {
      const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
      const result = await workshopService.performCheckin(request.body, idempotencyKey);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[workshops] POST checkin error:', err);
      return reply.status(500).send({ error: msg || 'Check-in thất bại' });
    }
  });

  /**
   * GET /api/v1/workshops/sales-conversion
   * Báo cáo Phân tích Chuyển đổi Doanh thu Workshop ↔ POS (Phase 3)
   */
  app.get('/api/v1/workshops/sales-conversion', async (request: FastifyRequest<{ Querystring: { workshop_id?: string; window_days?: string } }>, reply: FastifyReply) => {
    try {
      const { orgId } = request.user!;
      const workshopId = request.query.workshop_id;
      const windowDaysParam = request.query.window_days;
      const windowDays = windowDaysParam === 'ALL' || !windowDaysParam ? 'ALL' : parseInt(windowDaysParam, 10);

      const result = await workshopService.getSalesConversionAnalysis(orgId, {
        workshopId: workshopId || undefined,
        windowDays,
      });
      return { data: result };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[workshops] GET sales conversion error:', err);
      return reply.status(500).send({ error: msg || 'Không thể tính toán chuyển đổi doanh thu' });
    }
  });
}
