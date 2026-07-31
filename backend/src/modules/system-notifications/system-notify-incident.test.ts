import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prisma } from '../../shared/database/prisma-client.js';
import { notifyAdminsOfIncidentAsync } from './system-notify-service.js';
import * as systemNotifyModule from './system-notify-service.js';
import { processPosWebhookLog } from '../../controllers/pos-webhook.controller.js';

describe('Empirical Verification: Admin Zalo Incident Notification System (M4.2)', () => {
  const testOrgId = 'org-test-12345';
  const testLogId = 'log-test-99999';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ── 1. notifyAdminsOfIncidentAsync core functionality ────────────────────────
  describe('1. notifyAdminsOfIncidentAsync in system-notify-service.ts', () => {
    it('should query active admins (admin or owner) and dispatch notifications with high priority & urgency 2', async () => {
      const mockAdmins = [
        { id: 'admin-user-1' },
        { id: 'owner-user-2' },
      ];

      vi.spyOn(prisma.user, 'findMany').mockResolvedValue(mockAdmins as any);
      const sendSpy = vi.spyOn(systemNotifyModule, 'sendSystemNotificationToUser').mockResolvedValue({} as any);

      notifyAdminsOfIncidentAsync({
        orgId: testOrgId,
        type: 'pos_webhook_failed',
        title: '⚠️ CẢNH BÁO: Webhook POS xử lý thất bại (3/3 lần thử)',
        errorMsg: 'Connection refused at 192.168.1.100',
        logOrJobId: testLogId,
        eventTypeOrEntity: 'order.created',
        recommendedAction: 'Check POS network connection',
      });

      // Wait for setImmediate to execute
      await new Promise((resolve) => setImmediate(resolve));

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          orgId: testOrgId,
          role: { in: ['admin', 'owner'] },
          isActive: true,
        },
        select: { id: true },
      });

      expect(sendSpy).toHaveBeenCalledTimes(2);
      expect(sendSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({
        orgId: testOrgId,
        targetUserId: 'admin-user-1',
        type: 'pos_webhook_failed',
        title: '⚠️ CẢNH BÁO: Webhook POS xử lý thất bại (3/3 lần thử)',
        priority: 'high',
        urgency: 2,
        content: expect.stringContaining('⚠️ CẢNH BÁO SỰ CỐ ĐỒNG BỘ POS'),
      }));
      expect(sendSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({
        orgId: testOrgId,
        targetUserId: 'owner-user-2',
        type: 'pos_webhook_failed',
        title: '⚠️ CẢNH BÁO: Webhook POS xử lý thất bại (3/3 lần thử)',
        priority: 'high',
        urgency: 2,
        content: expect.stringContaining('⚠️ CẢNH BÁO SỰ CỐ ĐỒNG BỘ POS'),
      }));
    });

    it('should format payload content with required header and field descriptions', async () => {
      const mockAdmins = [{ id: 'admin-1' }];
      vi.spyOn(prisma.user, 'findMany').mockResolvedValue(mockAdmins as any);
      const sendSpy = vi.spyOn(systemNotifyModule, 'sendSystemNotificationToUser').mockResolvedValue({} as any);

      notifyAdminsOfIncidentAsync({
        orgId: testOrgId,
        type: 'pos_sync_critical_error',
        title: '⚠️ CẢNH BÁO: Lỗi đồng bộ dữ liệu POS nghiêm trọng',
        errorMsg: 'Prisma Client Known Request Error P2002',
        logOrJobId: 'job-audit-777',
        eventTypeOrEntity: 'InventorySyncJob',
        recommendedAction: 'Bấm Retry thủ công trong Dashboard',
      });

      await new Promise((resolve) => setImmediate(resolve));

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const callArg = sendSpy.mock.calls[0][0];
      const content = callArg.content;

      expect(content).toContain('⚠️ CẢNH BÁO SỰ CỐ ĐỒNG BỘ POS');
      expect(content).toContain('----------------------------------------');
      expect(content).toContain('• Loại sự cố: Critical Sync Job Failure');
      expect(content).toContain('• Đối tượng / Event: InventorySyncJob');
      expect(content).toContain('• Mô tả lỗi: Prisma Client Known Request Error P2002');
      expect(content).toContain(`• Organization ID: ${testOrgId}`);
      expect(content).toContain('• Log/Job ID: job-audit-777');
      expect(content).toContain('• Hướng xử lý: Bấm Retry thủ công trong Dashboard');
    });

    it('should handle orgs with zero active admins gracefully without errors', async () => {
      vi.spyOn(prisma.user, 'findMany').mockResolvedValue([]);
      const sendSpy = vi.spyOn(systemNotifyModule, 'sendSystemNotificationToUser').mockResolvedValue({} as any);

      notifyAdminsOfIncidentAsync({
        orgId: 'empty-org',
        type: 'pos_webhook_failed',
        title: 'Test empty org',
        errorMsg: 'No admin test',
        logOrJobId: 'log-00',
        eventTypeOrEntity: 'test',
        recommendedAction: 'None',
      });

      await new Promise((resolve) => setImmediate(resolve));

      expect(prisma.user.findMany).toHaveBeenCalled();
      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  // ── 2. Simulated Webhook Retry Failure (attempts = 3) ──────────────────────
  describe('2. Webhook retry failure (attempts = 3) triggering incident alert', () => {
    it('should trigger notifyAdminsOfIncidentAsync when processPosWebhookLog reaches attempt 3 and fails', async () => {
      const mockLog = {
        id: testLogId,
        orgId: testOrgId,
        eventType: 'order.created',
        payload: { event: 'order.created', data: { id: 505 } },
        status: 'PENDING',
        attempts: 2, // Next attempt will be #3
        lastError: 'Previous timeout',
        createdAt: new Date(),
        updatedAt: new Date(),
        processedAt: null,
      };

      vi.spyOn(prisma.posWebhookLog, 'findUnique').mockResolvedValue(mockLog as any);
      vi.spyOn(prisma.posWebhookLog, 'update').mockResolvedValue({} as any);

      // Force failure during processing (e.g. database error inside batchUpsertOrders)
      const mockBatchUpsert = vi.fn().mockRejectedValue(new Error('Fatal API Connection Reset'));
      const posSyncService = await import('../../shared/mcp/pos-sync-service.js');
      vi.spyOn(posSyncService, 'batchUpsertOrders').mockImplementation(mockBatchUpsert);

      const notifySpy = vi.spyOn(systemNotifyModule, 'notifyAdminsOfIncidentAsync').mockImplementation(() => {});

      const result = await processPosWebhookLog(testLogId);

      expect(result).toBe(false);
      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(notifySpy).toHaveBeenCalledWith({
        orgId: testOrgId,
        type: 'pos_webhook_failed',
        title: '⚠️ CẢNH BÁO: Webhook POS xử lý thất bại (3/3 lần thử)',
        errorMsg: 'Fatal API Connection Reset',
        logOrJobId: testLogId,
        eventTypeOrEntity: 'order.created',
        recommendedAction:
          'Kiểm tra kết nối mạng/API POS. Sau khi khắc phục, truy cập CRM Admin Sync Dashboard để bấm Retry thủ công.',
      });
    });

    it('should NOT trigger notifyAdminsOfIncidentAsync when attempts < 3 on error', async () => {
      const mockLog = {
        id: testLogId,
        orgId: testOrgId,
        eventType: 'customer.updated',
        payload: { event: 'customer.updated', data: { id: 101 } },
        status: 'PENDING',
        attempts: 0, // Attempt will become 1 (< 3)
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        processedAt: null,
      };

      vi.spyOn(prisma.posWebhookLog, 'findUnique').mockResolvedValue(mockLog as any);
      vi.spyOn(prisma.posWebhookLog, 'update').mockResolvedValue({} as any);

      const posSyncService = await import('../../shared/mcp/pos-sync-service.js');
      vi.spyOn(posSyncService, 'batchUpsertCustomers').mockRejectedValue(new Error('Temporary lock error'));

      const notifySpy = vi.spyOn(systemNotifyModule, 'notifyAdminsOfIncidentAsync').mockImplementation(() => {});

      const result = await processPosWebhookLog(testLogId);

      expect(result).toBe(false);
      expect(notifySpy).not.toHaveBeenCalled();
    });
  });

  // ── 3. Non-blocking setImmediate execution ──────────────────────────────────
  describe('3. Non-blocking setImmediate execution', () => {
    it('should return synchronously immediately and execute callback asynchronously', async () => {
      let callbackExecuted = false;

      vi.spyOn(prisma.user, 'findMany').mockImplementation((() => {
        const fn = async () => {
          callbackExecuted = true;
          return [];
        };
        return fn;
      })() as any);

      const startTime = Date.now();
      notifyAdminsOfIncidentAsync({
        orgId: testOrgId,
        type: 'pos_webhook_failed',
        title: 'Async Non-blocking Test',
        errorMsg: 'Test error',
        logOrJobId: 'log-async',
        eventTypeOrEntity: 'test',
        recommendedAction: 'None',
      });
      const endTime = Date.now();

      // Synchronous return check: function finished in < 10ms and callback hasn't run yet synchronously
      expect(endTime - startTime).toBeLessThan(50);
      expect(callbackExecuted).toBe(false);

      // Now flush setImmediate queue
      await new Promise((resolve) => setImmediate(resolve));

      expect(callbackExecuted).toBe(true);
    });

    it('should handle internal database exceptions within setImmediate without crashing main thread', async () => {
      vi.spyOn(prisma.user, 'findMany').mockRejectedValue(new Error('Uncaught database offline error'));

      expect(() => {
        notifyAdminsOfIncidentAsync({
          orgId: testOrgId,
          type: 'pos_webhook_failed',
          title: 'DB Failure Test',
          errorMsg: 'Crash test',
          logOrJobId: 'log-crash',
          eventTypeOrEntity: 'test',
          recommendedAction: 'None',
        });
      }).not.toThrow();

      // Wait for async task to fail inside catch block
      await new Promise((resolve) => setImmediate(resolve));
      // No process crash occurs
    });
  });
});
