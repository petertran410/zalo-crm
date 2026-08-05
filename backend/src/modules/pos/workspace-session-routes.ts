/**
 * workspace-session-routes.ts
 * ─────────────────────────────────────────────────────────────────
 * REST API cho Sales Workspace Session sync.
 *
 * 3 endpoints:
 *   GET    /api/v1/workspace-sessions       — load all active sessions for current user
 *   PUT    /api/v1/workspace-sessions/:id   — upsert session (create or update)
 *   DELETE /api/v1/workspace-sessions/:id   — remove session
 *
 * Storage: Prisma (source of truth) + Redis (hot cache, optional).
 * Conflict resolution: Last Write Wins (LWW by updatedAt).
 * Graceful fallback: if table doesn't exist yet (migration pending),
 *   returns empty array instead of crashing.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { getRedis } from '../../shared/redis-client.js';
import { logger } from '../../shared/utils/logger.js';

// ── Redis cache helpers ────────────────────────────────────────────

const CACHE_TTL = 3600; // 1 hour

function cacheKey(orgId: string, userId: string) {
  return `ws_sessions:${orgId}:${userId}`;
}

async function invalidateCache(orgId: string, userId: string) {
  try {
    const redis = await getRedis();
    if (redis) await redis.del(cacheKey(orgId, userId));
  } catch { /* non-critical */ }
}

// ── Graceful error check (migration pending) ───────────────────────

function isMigrationPending(err: any): boolean {
  // Prisma P2021 = table does not exist
  return err?.code === 'P2021'
    || err?.message?.includes('does not exist')
    || err?.message?.includes('relation "workspace_sessions" does not exist');
}

// ── Route plugin ───────────────────────────────────────────────────

export async function workspaceSessionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ─── GET /api/v1/workspace-sessions ──────────────────────────────
  // Load all active sessions for current user.
  // Redis first, fallback Prisma.
  app.get('/api/v1/workspace-sessions', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    try {
      // Try Redis cache first
      const redis = await getRedis();
      if (redis) {
        const cached = await redis.get(cacheKey(user.orgId, user.id));
        if (cached) {
          return { success: true, sessions: JSON.parse(cached) };
        }
      }

      // Fallback to Prisma
      const sessions = await prisma.workspaceSession.findMany({
        where: { userId: user.id, orgId: user.orgId, isActive: true },
        orderBy: { updatedAt: 'desc' },
      });

      // Populate cache
      if (redis) {
        await redis.set(
          cacheKey(user.orgId, user.id),
          JSON.stringify(sessions),
          'EX',
          CACHE_TTL,
        ).catch(() => { /* non-critical */ });
      }

      return { success: true, sessions };
    } catch (err: any) {
      if (isMigrationPending(err)) {
        logger.warn('[workspace-sessions] Table not found — returning empty (migration pending)');
        return { success: true, sessions: [], _migrationPending: true };
      }
      logger.error('[workspace-sessions] GET failed:', err);
      return reply.status(500).send({ success: false, error: 'Failed to load workspace sessions' });
    }
  });

  // ─── PUT /api/v1/workspace-sessions/:id ──────────────────────────
  // Upsert session (create or update).
  // LWW: always accepts latest write.
  app.put('/api/v1/workspace-sessions/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = request.body as {
      contactId?: string;
      contactName?: string;
      sessionData: any;
    };

    if (!body?.sessionData) {
      return reply.status(400).send({ success: false, error: 'sessionData is required' });
    }

    try {
      // Check if session exists
      const existing = await prisma.workspaceSession.findUnique({
        where: { id },
      });

      let result;
      if (existing) {
        // Update — only if owned by this user
        if (existing.userId !== user.id || existing.orgId !== user.orgId) {
          return reply.status(403).send({ success: false, error: 'Not authorized' });
        }
        result = await prisma.workspaceSession.update({
          where: { id },
          data: {
            sessionData: body.sessionData,
            contactName: body.contactName || existing.contactName,
          },
        });
      } else {
        // Create
        result = await prisma.workspaceSession.create({
          data: {
            id,
            orgId: user.orgId,
            userId: user.id,
            contactId: body.contactId || null,
            contactName: body.contactName || 'Khách hàng',
            sessionData: body.sessionData,
          },
        });
      }

      // Invalidate cache
      await invalidateCache(user.orgId, user.id);

      return { success: true, session: result };
    } catch (err: any) {
      if (isMigrationPending(err)) {
        logger.warn('[workspace-sessions] Table not found — skipping upsert (migration pending)');
        return { success: true, session: null, _migrationPending: true };
      }
      // Unique constraint violation (P2002) — contact already has a session
      if (err?.code === 'P2002') {
        return reply.status(409).send({
          success: false,
          error: 'Session for this contact already exists',
        });
      }
      logger.error('[workspace-sessions] PUT failed:', err);
      return reply.status(500).send({ success: false, error: 'Failed to save workspace session' });
    }
  });

  // ─── DELETE /api/v1/workspace-sessions/:id ───────────────────────
  // Hard delete session.
  app.delete('/api/v1/workspace-sessions/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    try {
      // Verify ownership before delete
      const session = await prisma.workspaceSession.findUnique({
        where: { id },
      });
      if (!session) {
        return reply.status(404).send({ success: false, error: 'Session not found' });
      }
      if (session.userId !== user.id || session.orgId !== user.orgId) {
        return reply.status(403).send({ success: false, error: 'Not authorized' });
      }

      await prisma.workspaceSession.delete({ where: { id } });

      // Invalidate cache
      await invalidateCache(user.orgId, user.id);

      return { success: true };
    } catch (err: any) {
      if (isMigrationPending(err)) {
        logger.warn('[workspace-sessions] Table not found — skipping delete (migration pending)');
        return { success: true, _migrationPending: true };
      }
      logger.error('[workspace-sessions] DELETE failed:', err);
      return reply.status(500).send({ success: false, error: 'Failed to delete workspace session' });
    }
  });
}
