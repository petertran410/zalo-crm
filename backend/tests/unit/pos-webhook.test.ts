import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { verifyPosWebhookSignature } from '../../src/controllers/pos-webhook.controller.js';
import { config } from '../../src/config/index.js';

describe('PosWebhookController — HMAC-SHA256 Verification', () => {
  const secret = config.posWebhookSecret || 'default_pos_webhook_secret_key_change_me_in_prod';

  it('should verify a valid HMAC-SHA256 signature successfully', () => {
    const payload = JSON.stringify({
      event: 'order.created',
      orgId: 'test-org-uuid',
      data: { orderId: 101, total: 250000 },
    });

    const rawBody = Buffer.from(payload, 'utf-8');
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const mockRequest = {
      headers: {
        'x-pos-signature': computedSignature,
      },
      rawBody,
    } as unknown as FastifyRequest;

    const result = verifyPosWebhookSignature(mockRequest);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('should verify signature with optional sha256= prefix', () => {
    const payload = JSON.stringify({ event: 'customer.updated', id: 50 });
    const rawBody = Buffer.from(payload, 'utf-8');
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const mockRequest = {
      headers: {
        'x-pos-signature': `sha256=${computedSignature}`,
      },
      rawBody,
    } as unknown as FastifyRequest;

    const result = verifyPosWebhookSignature(mockRequest);
    expect(result.valid).toBe(true);
  });

  it('should reject requests missing the x-pos-signature header', () => {
    const mockRequest = {
      headers: {},
      rawBody: Buffer.from('{}'),
    } as unknown as FastifyRequest;

    const result = verifyPosWebhookSignature(mockRequest);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Missing x-pos-signature header');
  });

  it('should reject invalid or tampered signatures', () => {
    const rawBody = Buffer.from('{"event":"inventory.updated"}', 'utf-8');
    const invalidSignature = crypto
      .createHmac('sha256', 'wrong_secret')
      .update(rawBody)
      .digest('hex');

    const mockRequest = {
      headers: {
        'x-pos-signature': invalidSignature,
      },
      rawBody,
    } as unknown as FastifyRequest;

    const result = verifyPosWebhookSignature(mockRequest);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Signature mismatch');
  });

  it('should reject when payload body was tampered after signing', () => {
    const originalBody = Buffer.from('{"total": 1000}', 'utf-8');
    const signature = crypto
      .createHmac('sha256', secret)
      .update(originalBody)
      .digest('hex');

    const tamperedBody = Buffer.from('{"total": 999999}', 'utf-8');

    const mockRequest = {
      headers: {
        'x-pos-signature': signature,
      },
      rawBody: tamperedBody,
    } as unknown as FastifyRequest;

    const result = verifyPosWebhookSignature(mockRequest);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Signature mismatch');
  });
});
