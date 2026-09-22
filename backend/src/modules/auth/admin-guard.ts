import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Fastify preHandler hook: Yêu cầu quyền Quản trị viên (Admin hoặc Owner).
 * Áp dụng cho toàn bộ các endpoint trigger đồng bộ dữ liệu hoặc retry logs.
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const role = (request as any).authCtx?.role || (request as any).user?.role;
  if (!role) {
    return reply.status(401).send({ error: 'Unauthorized: Vui lòng đăng nhập' });
  }

  if (role !== 'admin' && role !== 'owner') {
    return reply.status(403).send({
      error: 'Chỉ Quản trị viên (Admin/Owner) mới có quyền truy cập tính năng đồng bộ dữ liệu',
      code: 'ADMIN_REQUIRED',
    });
  }
}
