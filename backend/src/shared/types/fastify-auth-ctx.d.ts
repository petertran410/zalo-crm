/**
 * Mở rộng FastifyRequest với `authCtx` — tenant context chuẩn hoá set bởi
 * authMiddleware (Phase 0 Gateway). Mọi route đọc authCtx thay vì rải rác
 * `request.user.id` / `request.user.userId` (diệt mầm bug claim-shape).
 */
import 'fastify';
import type { TenantContext } from '../tenant/tenant-context.js';

declare module 'fastify' {
  interface FastifyRequest {
    authCtx?: TenantContext;
  }
}
