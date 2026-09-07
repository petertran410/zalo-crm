/**
 * product-interest-routes.ts
 *
 * REST API Routes cho tính năng "Sản phẩm đang quan tâm" trích xuất từ chat:
 * - POST   /api/v1/contacts/:contactId/product-interests/scan
 * - GET    /api/v1/contacts/:contactId/product-interests
 * - PATCH  /api/v1/contacts/:contactId/product-interests/:interestId
 * - DELETE /api/v1/contacts/:contactId/product-interests/:interestId
 *
 * Yêu cầu JWT authentication và tenant isolation qua orgId.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { assertContactVisible } from './contact-scope.js';
import { productInterestService } from './product-interest-service.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

export async function productInterestRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── 1. POST /api/v1/contacts/:contactId/product-interests/scan ─────────────
  app.post(
    '/api/v1/contacts/:contactId/product-interests/scan',
    async (
      request: FastifyRequest<{
        Params: { contactId: string };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const user = request.user!;
        const { contactId } = request.params;

        const visible = await assertContactVisible({
          userId: user.id,
          orgId: user.orgId,
          legacyRole: user.role,
          contactId,
        });
        if (!visible) {
          return reply.status(404).send({ error: 'Khách hàng không tồn tại hoặc bạn không có quyền truy cập.' });
        }

        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { fullName: true },
        });
        const userName = dbUser?.fullName || user.email || 'Sale';
        const result = await productInterestService.scanProductInterests({
          contactId,
          orgId: user.orgId,
          userId: user.id,
          userName,
        });

        return reply.send(result);
      } catch (err: any) {
        logger.error('[productInterestRoutes] Scan error:', err);
        return reply.status(500).send({
          error: err.message || 'Có lỗi xảy ra khi quét nhu cầu sản phẩm từ hội thoại chat.',
        });
      }
    },
  );

  // ── 2. GET /api/v1/contacts/:contactId/product-interests ──────────────────
  app.get(
    '/api/v1/contacts/:contactId/product-interests',
    async (
      request: FastifyRequest<{
        Params: { contactId: string };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const user = request.user!;
        const { contactId } = request.params;

        const visible = await assertContactVisible({
          userId: user.id,
          orgId: user.orgId,
          legacyRole: user.role,
          contactId,
        });
        if (!visible) {
          return reply.status(404).send({ error: 'Khách hàng không tồn tại.' });
        }

        const data = await productInterestService.listProductInterests(contactId, user.orgId);
        return reply.send(data);
      } catch (err: any) {
        logger.error('[productInterestRoutes] List error:', err);
        return reply.status(500).send({
          error: 'Không thể tải danh sách sản phẩm đang quan tâm.',
        });
      }
    },
  );

  // ── 3. PATCH /api/v1/contacts/:contactId/product-interests/:interestId ─────
  app.patch(
    '/api/v1/contacts/:contactId/product-interests/:interestId',
    async (
      request: FastifyRequest<{
        Params: { contactId: string; interestId: string };
        Body: {
          productName?: string;
          intent?: string;
          notes?: string;
          status?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const user = request.user!;
        const { contactId, interestId } = request.params;
        const body = request.body || {};

        const visible = await assertContactVisible({
          userId: user.id,
          orgId: user.orgId,
          legacyRole: user.role,
          contactId,
        });
        if (!visible) {
          return reply.status(404).send({ error: 'Khách hàng không tồn tại.' });
        }

        const updated = await productInterestService.updateProductInterest(
          interestId,
          user.orgId,
          body,
        );

        return reply.send({ success: true, item: updated });
      } catch (err: any) {
        logger.error('[productInterestRoutes] Update error:', err);
        return reply.status(400).send({
          error: err.message || 'Không thể cập nhật sản phẩm quan tâm.',
        });
      }
    },
  );

  // ── 4. DELETE /api/v1/contacts/:contactId/product-interests/:interestId ────
  app.delete(
    '/api/v1/contacts/:contactId/product-interests/:interestId',
    async (
      request: FastifyRequest<{
        Params: { contactId: string; interestId: string };
        Body: {
          salesDeleteNote?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const user = request.user!;
        const { contactId, interestId } = request.params;
        const salesDeleteNote = (request.body?.salesDeleteNote || '').trim();

        if (!salesDeleteNote) {
          return reply.status(400).send({
            error: 'Vui lòng nhập ghi chú của Sales (lý do xóa) để lưu lại lịch sử kiểm toán.',
          });
        }

        const visible = await assertContactVisible({
          userId: user.id,
          orgId: user.orgId,
          legacyRole: user.role,
          contactId,
        });
        if (!visible) {
          return reply.status(404).send({ error: 'Khách hàng không tồn tại.' });
        }

        const deleted = await productInterestService.deleteProductInterest(
          interestId,
          user.orgId,
          salesDeleteNote,
        );

        return reply.send({ success: true, item: deleted });
      } catch (err: any) {
        logger.error('[productInterestRoutes] Delete error:', err);
        return reply.status(400).send({
          error: err.message || 'Không thể xóa sản phẩm quan tâm.',
        });
      }
    },
  );

  // ── 5. GET /api/v1/contacts/product-interests/check-inventory ──────────────
  app.get(
    '/api/v1/contacts/product-interests/check-inventory',
    async (
      request: FastifyRequest<{
        Querystring: { keyword?: string; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const user = request.user!;
        const keyword = (request.query?.keyword || '').trim();
        const limit = parseInt(request.query?.limit || '15', 10) || 15;

        if (!keyword) {
          return reply.send({ success: true, keyword: '', items: [] });
        }

        const result = await productInterestService.checkPosInventory(keyword, user.orgId, limit);
        return reply.send(result);
      } catch (err: any) {
        logger.error('[productInterestRoutes] Check inventory error:', err);
        return reply.status(500).send({
          error: 'Không thể tra cứu tồn kho sản phẩm POS.',
        });
      }
    },
  );
}
