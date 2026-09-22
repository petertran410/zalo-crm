import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { authMiddleware } from '../auth/auth-middleware.js';

/**
 * Map mã sale POS (token username trong groups, vd "phuongnt") → user CRM.
 * Quyết định 2026-08-25: NGƯỜI DÙNG tự map — hệ thống không suy diễn từ tên/email.
 * Chưa map thì Customer 360 hiển thị nguyên mã POS, không gán bừa.
 */
export async function posSaleMappingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Toàn bộ endpoint chỉ dành cho admin/owner — đây là cấu hình tổ chức.
  const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    const role = request.user?.role;
    if (role !== 'owner' && role !== 'admin') {
      return reply.status(403).send({ error: 'Chỉ admin/owner mới quản lý được mapping' });
    }
  };

  /** Mã sale xuất hiện trong pos_customers + số khách đang gắn, đánh dấu đã map chưa. */
  app.get('/api/v1/pos/sale-mappings/candidates', { preHandler: requireAdmin }, async (request: FastifyRequest) => {
    const user = request.user!;
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT assigned_sale_code AS "posSaleCode",
             count(*)::int AS "customerCount",
             min(name) AS "sampleCustomer"
        FROM pos_customers
       WHERE org_id = $1 AND assigned_sale_name IS NOT NULL
       GROUP BY 1
       ORDER BY count(*) DESC`, user.orgId);

    const mappings = await prisma.posSaleMapping.findMany({
      where: { orgId: user.orgId },
      select: { posSaleCode: true, userId: true, user: { select: { id: true, fullName: true, email: true } } },
    });
    const byCode = new Map(mappings.map((m) => [m.posSaleCode, m]));

    return {
      candidates: rows.map((r) => ({
        posSaleCode: r.posSaleCode,
        customerCount: Number(r.customerCount),
        sampleCustomer: r.sampleCustomer,
        mappedUser: byCode.get(r.posSaleCode)?.user ?? null,
      })),
    };
  });

  app.get('/api/v1/pos/sale-mappings', { preHandler: requireAdmin }, async (request: FastifyRequest) => {
    const mappings = await prisma.posSaleMapping.findMany({
      where: { orgId: request.user!.orgId },
      select: {
        id: true, posSaleCode: true,
        user: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { posSaleCode: 'asc' },
    });
    return { mappings };
  });

  app.put('/api/v1/pos/sale-mappings', { preHandler: requireAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = (request.body || {}) as { posSaleCode?: string; userId?: string };
    const posSaleCode = typeof body.posSaleCode === 'string' ? body.posSaleCode.trim() : '';
    if (!posSaleCode || !body.userId) {
      return reply.status(400).send({ error: 'posSaleCode và userId là bắt buộc' });
    }

    // User phải thuộc cùng org — chặn map chéo tenant.
    const targetUser = await prisma.user.findFirst({
      where: { id: body.userId, orgId: user.orgId },
      select: { id: true },
    });
    if (!targetUser) return reply.status(400).send({ error: 'userId không thuộc tổ chức này' });

    const mapping = await prisma.posSaleMapping.upsert({
      where: { orgId_posSaleCode: { orgId: user.orgId, posSaleCode } },
      create: { orgId: user.orgId, posSaleCode, userId: body.userId },
      update: { userId: body.userId },
      select: {
        posSaleCode: true,
        user: { select: { id: true, fullName: true, email: true } },
      },
    });
    return { success: true, mapping };
  });

  app.delete('/api/v1/pos/sale-mappings/:code', { preHandler: requireAdmin }, async (request: FastifyRequest) => {
    const code = decodeURIComponent((request.params as { code: string }).code);
    await prisma.posSaleMapping.deleteMany({
      where: { orgId: request.user!.orgId, posSaleCode: code },
    });
    return { success: true };
  });

  app.setErrorHandler((err, request, reply) => {
    logger.error('[pos-sale-mapping] Error:', err);
    if (!reply.sent) reply.status(500).send({ error: 'Lỗi xử lý mapping' });
  });
}
