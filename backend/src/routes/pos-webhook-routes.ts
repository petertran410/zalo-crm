import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Readable } from 'node:stream';
import { handlePosWebhook } from '../controllers/pos-webhook.controller.js';

export async function posWebhookRoutes(app: FastifyInstance): Promise<void> {
  // Capture raw request body stream before JSON parsing
  app.addHook('preParsing', async (request: FastifyRequest, reply: FastifyReply, payload: Readable) => {
    if (request.url.startsWith('/api/v1/webhooks/pos')) {
      const chunks: Buffer[] = [];
      for await (const chunk of payload) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf-8') : chunk);
      }
      const rawBuffer = Buffer.concat(chunks);
      request.rawBody = rawBuffer;
      return Readable.from(rawBuffer);
    }
    return payload;
  });

  // POST /api/v1/webhooks/pos — Unauthenticated by JWT, secured by HMAC-SHA256 signature
  app.post('/api/v1/webhooks/pos', handlePosWebhook);
}
