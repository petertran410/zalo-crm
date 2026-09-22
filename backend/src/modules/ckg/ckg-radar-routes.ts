/**
 * ckg-radar-routes.ts — Fastify REST API Routes cho Smart Customer Radar & Feedback Loop (Milestone 3 §R3, §R4)
 *
 * Khai báo các endpoints:
 *   - GET  /api/v1/contacts/:id/radar
 *   - POST /api/v1/contacts/:id/radar/feedback
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { ckgRadarController, CkgRadarController } from './ckg-radar-controller.js';

export async function ckgRadarRoutes(app: FastifyInstance): Promise<void> {
  // Toàn bộ route yêu cầu JWT Auth
  app.addHook('preHandler', authMiddleware);

  const controller = ckgRadarController || new CkgRadarController();

  // ── 1. GET /api/v1/contacts/:id/radar ───────────────────────────────────────
  app.get(
    '/api/v1/contacts/:id/radar',
    {
      config: {
        contentClass: 'mixed' as const,
        rbacResource: 'contact' as const,
        rbacAction: 'access' as const,
      },
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', minLength: 1 },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            forceRefresh: { type: 'string', enum: ['true', 'false'] },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return controller.getCustomerRadar(request, reply);
    }
  );

  // ── 2. POST /api/v1/contacts/:id/radar/feedback ─────────────────────────────
  app.post(
    '/api/v1/contacts/:id/radar/feedback',
    {
      config: {
        contentClass: 'mixed' as const,
        rbacResource: 'contact' as const,
        rbacAction: 'access' as const,
      },
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', minLength: 1 },
          },
        },
        body: {
          type: 'object',
          required: ['action'],
          properties: {
            action: {
              type: 'string',
              enum: ['CONFIRM', 'REJECT', 'OVERRIDE', 'EDIT', 'confirm', 'reject', 'override', 'edit'],
            },
            targetCluster: { type: 'string' },
            note: { type: 'string' },
            confirmedPersonaId: { type: 'string' },
            reason: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return controller.submitFeedback(request, reply);
    }
  );
}
