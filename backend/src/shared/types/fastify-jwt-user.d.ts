/**
 * Extends Fastify's JWT user type to include our custom JWT payload fields.
 * This merges with @fastify/jwt's FastifyJWT interface.
 */
import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    // Phase Onboarding v1 2026-05-24 — thêm 'tv' (token version) để revoke JWT cũ sau đổi password.
    // Middleware check token.tv === user.jwtTokenVersion, sai = reject.
    // Phase 2 2026-06-08 — 'typ': 'access' = access token ngắn (15', bỏ check tv mỗi request);
    // thiếu typ = legacy 7d (giữ check tv để backward-compat).
    payload: { id: string; email: string; role: string; orgId: string; tv?: number; typ?: 'access' };
    user: { id: string; email: string; role: string; orgId: string; tv?: number; typ?: 'access' };
  }
}
