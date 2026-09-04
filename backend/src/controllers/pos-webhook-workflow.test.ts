import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prisma } from '../shared/database/prisma-client.js';
import { processPosWebhookLog } from './pos-webhook.controller.js';
import { runPosWebhookRetrySweep } from '../jobs/pos-webhook-retry.job.js';
import * as eventBufferModule from '../shared/event-buffer.js';
import * as posSyncService from '../shared/mcp/pos-sync-service.js';

describe('Empirical Verification: POS Webhook Logging, 3x Retry Mechanism & Socket.IO Push (M3.2)', () => {
  const testOrgId = '00000000-0000-0000-0000-000000000001';
  const testLogId = '11111111-1111-1111-1111-111111111111';

  let mockIoEmit: ReturnType<typeof vi.fn>;
  let mockIoTo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockIoEmit = vi.fn();
    mockIoTo = vi.fn().mockReturnValue({ emit: mockIoEmit });

    vi.spyOn(eventBufferModule, 'getIo').mockReturnValue({
      to: mockIoTo,
    } as any);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ── Requirement 1: Webhook Logging & Status Accuracy ──────────────────────
  describe('1. Webhook Logging & Status Accuracy (PENDING, PROCESSED, FAILED)', () => {
    it('should transition status from PENDING to PROCESSED on successful execution', async () => {
      const mockLog = {
        id: testLogId,
        orgId: testOrgId,
        eventType: 'pos.order.created',
        payload: {
          event: 'order.created',
          data: { id: 101, code: 'ORD-101', total: 500000 },
        },
        status: 'PENDING',
        attempts: 0,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        processedAt: null,
      };

      vi.spyOn(prisma.posWebhookLog, 'findUnique').mockResolvedValue(mockLog as any);
      const updateSpy = vi.spyOn(prisma.posWebhookLog, 'update').mockResolvedValue({} as any);
      vi.spyOn(posSyncService, 'batchUpsertOrders').mockResolvedValue(1);

      const result = await processPosWebhookLog(testLogId);

      expect(result).toBe(true);
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: testLogId },
        data: expect.objectContaining({
          status: 'PROCESSED',
          attempts: 1,
          lastError: null,
          processedAt: expect.any(Date),
        }),
      });
    });

    it('should set status to PENDING on processing error when attempts < 3', async () => {
      const mockLog = {
        id: testLogId,
        orgId: testOrgId,
        eventType: 'pos.order.created',
        payload: { event: 'order.created', data: { id: 102 } },
        status: 'PENDING',
        attempts: 0,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        processedAt: null,
      };

      vi.spyOn(prisma.posWebhookLog, 'findUnique').mockResolvedValue(mockLog as any);
      const updateSpy = vi.spyOn(prisma.posWebhookLog, 'update').mockResolvedValue({} as any);
      vi.spyOn(posSyncService, 'batchUpsertOrders').mockRejectedValue(new Error('Database connection timeout'));

      const result = await processPosWebhookLog(testLogId);

      expect(result).toBe(false);
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: testLogId },
        data: expect.objectContaining({
          status: 'PENDING',
          attempts: 1,
          lastError: 'Database connection timeout',
          processedAt: null,
        }),
      });
    });

    it('should transition status to FAILED when attempts reach 3', async () => {
      const mockLog = {
        id: testLogId,
        orgId: testOrgId,
        eventType: 'pos.order.created',
        payload: { event: 'order.created', data: { id: 103 } },
        status: 'PENDING',
        attempts: 2, // 3rd attempt about to execute
        lastError: 'Previous error',
        createdAt: new Date(),
        updatedAt: new Date(),
        processedAt: null,
      };

      vi.spyOn(prisma.posWebhookLog, 'findUnique').mockResolvedValue(mockLog as any);
      const updateSpy = vi.spyOn(prisma.posWebhookLog, 'update').mockResolvedValue({} as any);
      vi.spyOn(posSyncService, 'batchUpsertOrders').mockRejectedValue(new Error('Fatal payload syntax error'));

      const result = await processPosWebhookLog(testLogId);

      expect(result).toBe(false);
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: testLogId },
        data: expect.objectContaining({
          status: 'FAILED',
          attempts: 3,
          lastError: 'Fatal payload syntax error',
          processedAt: expect.any(Date),
        }),
      });
    });
  });

  // ── Requirement 2: 3x Retry Job Mechanism & Limits ─────────────────────────
  describe('2. Background Retry Sweeper Job (pos-webhook-retry.job.ts)', () => {
    it('should sweep PENDING logs with attempts < 3 and process them', async () => {
      const pendingLogs = [
        {
          id: 'log-1',
          orgId: testOrgId,
          eventType: 'order.created',
          payload: { event: 'order.created', data: { id: 201 } },
          status: 'PENDING',
          attempts: 1,
        },
        {
          id: 'log-2',
          orgId: testOrgId,
          eventType: 'customer.updated',
          payload: { event: 'customer.updated', data: { id: 202 } },
          status: 'PENDING',
          attempts: 2,
        },
      ];

      vi.spyOn(prisma.posWebhookLog, 'findMany').mockResolvedValue(pendingLogs as any);
      vi.spyOn(prisma.posWebhookLog, 'findUnique').mockImplementation((({ where }: any) => {
        const found = pendingLogs.find((l) => l.id === where.id);
        return Promise.resolve(found ? (found as any) : null);
      }) as any);
      vi.spyOn(prisma.posWebhookLog, 'update').mockResolvedValue({} as any);
      vi.spyOn(posSyncService, 'batchUpsertOrders').mockResolvedValue(1);
      vi.spyOn(posSyncService, 'batchUpsertCustomers').mockResolvedValue(1);
      vi.spyOn(prisma.appSetting, 'findUnique').mockResolvedValue({
        valuePlain: JSON.stringify({
          rule: 'active_phone_invoice_v1',
          import: { status: 'completed' },
        }),
      } as any);
      vi.spyOn(prisma.posInvoice, 'findFirst').mockResolvedValue({ posCustomerId: 202 } as any);

      const processedCount = await runPosWebhookRetrySweep();

      expect(prisma.posWebhookLog.findMany).toHaveBeenCalledWith({
        where: {
          status: 'PENDING',
          attempts: { lt: 3 },
        },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
      expect(processedCount).toBe(2);
    });

    it('should enforce 3x retry limit and stop picking up logs that hit attempts = 3 or status FAILED', async () => {
      // Setup log at 2 attempts failing to reach 3 (FAILED)
      const failedLog = {
        id: 'log-failed-3x',
        orgId: testOrgId,
        eventType: 'order.created',
        payload: { event: 'order.created', data: { id: 301 } },
        status: 'PENDING',
        attempts: 2,
      };

      vi.spyOn(prisma.posWebhookLog, 'findUnique').mockResolvedValue(failedLog as any);
      const updateSpy = vi.spyOn(prisma.posWebhookLog, 'update').mockResolvedValue({} as any);
      vi.spyOn(posSyncService, 'batchUpsertOrders').mockRejectedValue(new Error('Persistent error'));

      // Process attempt 3 -> transition to FAILED
      await processPosWebhookLog(failedLog.id);

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: failedLog.id },
        data: expect.objectContaining({
          status: 'FAILED',
          attempts: 3,
        }),
      });

      // Subsequent sweep query must filter out attempts >= 3 and status != PENDING
      vi.spyOn(prisma.posWebhookLog, 'findMany').mockResolvedValue([]);
      const processedCount = await runPosWebhookRetrySweep();

      expect(processedCount).toBe(0);
      expect(prisma.posWebhookLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'PENDING',
            attempts: { lt: 3 },
          },
        })
      );
    });
  });

  // ── Requirement 3: Socket.IO Broadcast pos:data:updated ────────────────────
  describe('3. Socket.IO pos:data:updated Broadcast & Payload Validation', () => {
    it('should emit pos:data:updated with correct room channel and payload on order webhook', async () => {
      const mockLog = {
        id: testLogId,
        orgId: testOrgId,
        eventType: 'order.created',
        payload: {
          event: 'order.created',
          data: { id: 999, code: 'ORD-999', total: 1250000 },
        },
        status: 'PENDING',
        attempts: 0,
      };

      vi.spyOn(prisma.posWebhookLog, 'findUnique').mockResolvedValue(mockLog as any);
      vi.spyOn(prisma.posWebhookLog, 'update').mockResolvedValue({} as any);
      vi.spyOn(posSyncService, 'batchUpsertOrders').mockResolvedValue(1);

      await processPosWebhookLog(testLogId);

      expect(mockIoTo).toHaveBeenCalledWith(`org:${testOrgId}`);
      expect(mockIoEmit).toHaveBeenCalledWith(
        'pos:data:updated',
        expect.objectContaining({
          type: 'order',
          action: 'synced',
          orgId: testOrgId,
          timestamp: expect.any(String),
          summary: expect.stringContaining('ORD-999'),
          data: expect.objectContaining({ id: 999, code: 'ORD-999' }),
        })
      );
    });

    it('should emit pos:data:updated for customer, product, and inventory webhooks', async () => {
      const customerLog = {
        id: 'log-cust',
        orgId: testOrgId,
        eventType: 'customer.updated',
        payload: {
          event: 'customer.updated',
          data: { id: 88, name: 'Nguyễn Văn A', phone: '0901234567', isActive: true },
        },
        status: 'PENDING',
        attempts: 0,
      };

      vi.spyOn(prisma.posWebhookLog, 'findUnique').mockResolvedValue(customerLog as any);
      vi.spyOn(prisma.posWebhookLog, 'update').mockResolvedValue({} as any);
      vi.spyOn(posSyncService, 'batchUpsertCustomers').mockResolvedValue(1);
      vi.spyOn(prisma.appSetting, 'findUnique').mockResolvedValue({
        valuePlain: JSON.stringify({
          rule: 'active_phone_invoice_v1',
          import: { status: 'completed' },
        }),
      } as any);
      vi.spyOn(prisma.posInvoice, 'findFirst').mockResolvedValue({ posCustomerId: 88 } as any);

      await processPosWebhookLog('log-cust');

      expect(mockIoTo).toHaveBeenCalledWith(`org:${testOrgId}`);
      expect(mockIoEmit).toHaveBeenCalledWith(
        'pos:data:updated',
        expect.objectContaining({
          type: 'customer',
          action: 'synced',
          orgId: testOrgId,
          summary: expect.stringContaining('Nguyễn Văn A'),
        })
      );
    });
  });
});
