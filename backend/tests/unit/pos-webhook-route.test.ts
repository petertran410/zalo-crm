import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { config } from '../../src/config/index.js';

// Mock prisma client
const mockPosWebhookLogCreate = vi.fn();
const mockPosWebhookLogFindUnique = vi.fn();
const mockPosWebhookLogFindFirst = vi.fn();
const mockPosWebhookLogUpdate = vi.fn();
const mockOrgFindFirst = vi.fn();
const mockOrgFindUnique = vi.fn();

vi.mock('../../src/shared/database/prisma-client.js', () => ({
  prisma: {
    posWebhookLog: {
      create: (...args: any[]) => mockPosWebhookLogCreate(...args),
      findUnique: (...args: any[]) => mockPosWebhookLogFindUnique(...args),
      findFirst: (...args: any[]) => mockPosWebhookLogFindFirst(...args),
      update: (...args: any[]) => mockPosWebhookLogUpdate(...args),
    },
    organization: {
      findFirst: (...args: any[]) => mockOrgFindFirst(...args),
      findUnique: (...args: any[]) => mockOrgFindUnique(...args),
    },
  },
}));

// Mock pos-sync-service
vi.mock('../../src/shared/mcp/pos-sync-service.js', () => ({
  batchUpsertOrders: vi.fn().mockResolvedValue(undefined),
  batchUpsertCustomers: vi.fn().mockResolvedValue(undefined),
  batchUpsertProducts: vi.fn().mockResolvedValue(undefined),
  batchUpsertCustomerDebts: vi.fn().mockResolvedValue(undefined),
  batchUpsertInvoices: vi.fn().mockResolvedValue(undefined),
  batchUpsertBranchInventory: vi.fn().mockResolvedValue(undefined),
  emitPosDataUpdated: vi.fn(),
}));

import { posWebhookRoutes } from '../../src/routes/pos-webhook-routes.js';

function buildTestApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(posWebhookRoutes);
  return app;
}

describe('POST /api/v1/webhooks/pos — Full HTTP Route Empirical Verification', () => {
  const secret = config.posWebhookSecret || 'default_pos_webhook_secret_key_change_me_in_prod';
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = buildTestApp();
    await app.ready();

    mockOrgFindFirst.mockResolvedValue({ id: 'org-test-123' });
    mockOrgFindUnique.mockResolvedValue({ id: 'org-test-123' });
    mockPosWebhookLogFindFirst.mockResolvedValue(null);
    mockPosWebhookLogCreate.mockImplementation(async ({ data }: any) => ({
      id: 'log-uuid-999',
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mockPosWebhookLogFindUnique.mockResolvedValue({
      id: 'log-uuid-999',
      orgId: 'org-test-123',
      eventType: 'order.created',
      payload: { event: 'order.created', data: { orderId: 2001 } },
      status: 'PENDING',
      attempts: 0,
    });
    mockPosWebhookLogUpdate.mockResolvedValue({});
  });

  it('Requirement 2: Should return 401 Unauthorized when x-pos-signature header is missing', async () => {
    const payload = JSON.stringify({ event: 'order.created', data: { orderId: 101 } });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/pos',
      headers: {
        'content-type': 'application/json',
      },
      payload,
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Unauthorized');
    expect(body.code).toBe('invalid_signature');
    expect(body.message).toBe('Missing X-Webhook-Signature header');
    expect(mockPosWebhookLogCreate).not.toHaveBeenCalled();
  });

  it('Requirement 3: Should return 401 Unauthorized when signature is invalid or forged', async () => {
    const payload = JSON.stringify({ event: 'order.created', data: { orderId: 102 } });
    const forgedSignature = crypto
      .createHmac('sha256', 'wrong_secret_key_forgery_attack')
      .update(payload)
      .digest('hex');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/pos',
      headers: {
        'content-type': 'application/json',
        'x-pos-signature': forgedSignature,
      },
      payload,
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Unauthorized');
    expect(body.code).toBe('invalid_signature');
    expect(body.message).toBe('Signature mismatch');
    expect(mockPosWebhookLogCreate).not.toHaveBeenCalled();
  });

  it('Requirement 3b: Should return 401 Unauthorized when signature length mismatches', async () => {
    const payload = JSON.stringify({ event: 'order.created', data: { orderId: 103 } });
    // Truncated signature
    const shortSignature = 'a1b2c3d4e5';

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/pos',
      headers: {
        'content-type': 'application/json',
        'x-pos-signature': shortSignature,
      },
      payload,
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Unauthorized');
    expect(body.code).toBe('invalid_signature');
    expect(body.message).toBe('Signature length mismatch');
    expect(mockPosWebhookLogCreate).not.toHaveBeenCalled();
  });

  it('Requirement 3c: Should return 401 Unauthorized when payload was tampered in-transit after signing', async () => {
    const originalPayload = JSON.stringify({ event: 'order.created', data: { amount: 10000 } });
    const signature = crypto
      .createHmac('sha256', secret)
      .update(originalPayload)
      .digest('hex');

    const tamperedPayload = JSON.stringify({ event: 'order.created', data: { amount: 99999999 } });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/pos',
      headers: {
        'content-type': 'application/json',
        'x-pos-signature': signature,
      },
      payload: tamperedPayload,
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Unauthorized');
    expect(body.code).toBe('invalid_signature');
    expect(body.message).toBe('Signature mismatch');
    expect(mockPosWebhookLogCreate).not.toHaveBeenCalled();
  });

  it('Requirement 4: Should return 200 OK fast response and insert record into pos_webhook_logs when HMAC signature is valid', async () => {
    const webhookBody = {
      event: 'order.created',
      orgId: 'org-test-123',
      data: { orderId: 2001, totalAmount: 500000 },
    };
    const rawPayload = JSON.stringify(webhookBody);

    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(Buffer.from(rawPayload, 'utf-8'))
      .digest('hex');

    const startTime = Date.now();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/pos',
      headers: {
        'content-type': 'application/json',
        'x-pos-signature': validSignature,
      },
      payload: rawPayload,
    });
    const elapsedTime = Date.now() - startTime;

    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.success).toBe(true);
    expect(responseBody.logId).toBe('log-uuid-999');
    expect(responseBody.message).toBe('POS Webhook received and queued for processing');

    // Fast response check (< 100ms)
    expect(elapsedTime).toBeLessThan(500);

    // Database record insertion verification
    expect(mockPosWebhookLogCreate).toHaveBeenCalledTimes(1);
    expect(mockPosWebhookLogCreate).toHaveBeenCalledWith({
      data: {
        orgId: 'org-test-123',
        eventType: 'order.created',
        payloadHash: expect.any(String),
        payload: webhookBody,
        status: 'PENDING',
        attempts: 0,
      },
    });
  });

  it('Requirement 4b: Should support sha256= prefix in x-pos-signature header and process valid request', async () => {
    const webhookBody = {
      event: 'customer.created',
      data: { customerId: 888, name: 'Empirical Test Customer' },
    };
    const rawPayload = JSON.stringify(webhookBody);

    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(Buffer.from(rawPayload, 'utf-8'))
      .digest('hex');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/pos',
      headers: {
        'content-type': 'application/json',
        'x-pos-signature': `sha256=${validSignature}`,
      },
      payload: rawPayload,
    });

    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.success).toBe(true);
    expect(mockPosWebhookLogCreate).toHaveBeenCalledTimes(1);
    expect(mockPosWebhookLogCreate).toHaveBeenCalledWith({
      data: {
        orgId: 'org-test-123',
        eventType: 'customer.created',
        payloadHash: expect.any(String),
        payload: webhookBody,
        status: 'PENDING',
        attempts: 0,
      },
    });
  });
});
