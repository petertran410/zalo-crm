import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../shared/database/prisma-client.js';
import {
  getPosDashboardStatsHandler,
  getPosWebhookLogsHandler,
  retryPosWebhookLogHandler,
  triggerPosSyncHandler,
} from './pos-sync-dashboard.controller.js';
import {
  executeInventoryAuditForOrg,
  formatInventoryAuditReportText,
} from '../jobs/pos-inventory-audit.cron.js';
import {
  getPreviousDayRange,
  aggregatePosMetricsForOrg,
  formatPosSummaryReportText,
} from '../jobs/pos-summary-report.cron.js';

describe('Admin Sync Dashboard & Zalo Alerts (Milestone 4 - R4)', () => {
  const testOrgId = 'org-123-abc';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. GET /api/v1/pos/dashboard/stats', () => {
    it('should return 401 if orgId is missing', async () => {
      const mockReq: any = { authCtx: {} };
      const mockReply: any = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      };

      await getPosDashboardStatsHandler(mockReq, mockReply);
      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should return aggregated stats and sync health metrics', async () => {
      const mockReq: any = { authCtx: { orgId: testOrgId } };
      const mockReply: any = {};

      vi.spyOn(prisma.posOrder, 'count').mockResolvedValue(1250 as any);
      vi.spyOn(prisma.posCustomerDebt, 'count').mockResolvedValue(340 as any);
      vi.spyOn(prisma.posWebhookLog, 'count')
        .mockResolvedValueOnce(4890 as any) // total
        .mockResolvedValueOnce(2 as any) // failed
        .mockResolvedValueOnce(5 as any) // pending
        .mockResolvedValueOnce(4883 as any); // processed
      vi.spyOn(prisma.syncJob, 'findFirst')
        .mockResolvedValueOnce(null as any) // activeJob
        .mockResolvedValueOnce({ endTime: new Date('2026-07-31T10:00:00Z') } as any); // lastCompletedJob

      const result = await getPosDashboardStatsHandler(mockReq, mockReply);

      expect(result).toEqual({
        success: true,
        data: {
          totalOrdersSynced: 1250,
          totalDebtRecords: 340,
          totalWebhookEvents: 4890,
          failedWebhooksCount: 2,
          pendingWebhooksCount: 5,
          processedWebhooksCount: 4883,
          syncHealth: 'warning',
          isSyncing: false,
          lastSyncedAt: '2026-07-31T10:00:00.000Z',
          activeJob: null,
        },
      });
    });
  });

  describe('2. GET /api/v1/pos/webhooks/logs', () => {
    it('should query paginated logs with status and search filters', async () => {
      const mockReq: any = {
        authCtx: { orgId: testOrgId },
        query: { page: '1', limit: '10', status: 'FAILED', search: 'order' },
      };
      const mockReply: any = {};

      const mockLogs = [
        {
          id: 'log-1',
          orgId: testOrgId,
          eventType: 'pos.order.created',
          status: 'FAILED',
          attempts: 3,
          lastError: 'Timeout error',
          createdAt: new Date(),
        },
      ];

      vi.spyOn(prisma.posWebhookLog, 'findMany').mockResolvedValue(mockLogs as any);
      vi.spyOn(prisma.posWebhookLog, 'count').mockResolvedValue(1 as any);

      const result = await getPosWebhookLogsHandler(mockReq, mockReply);

      expect(result.success).toBe(true);
      expect(result.data.items.length).toBe(1);
      expect(result.data.pagination).toEqual({
        page: 1,
        limit: 10,
        totalItems: 1,
        totalPages: 1,
      });
    });
  });

  describe('3. POST /api/v1/pos/webhooks/logs/:id/retry', () => {
    it('should return 404 when log record is not found', async () => {
      const mockReq: any = {
        authCtx: { orgId: testOrgId },
        params: { id: 'non-existent-id' },
        server: {},
      };
      const mockReply: any = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      };

      vi.spyOn(prisma.posWebhookLog, 'findFirst').mockResolvedValue(null);

      await retryPosWebhookLogHandler(mockReq, mockReply);
      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('4. POST /api/v1/pos/sync/trigger', () => {
    it('should return 409 conflict when a sync job is already running', async () => {
      const mockReq: any = { authCtx: { orgId: testOrgId } };
      const mockReply: any = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      };

      vi.spyOn(prisma.syncJob, 'findFirst').mockResolvedValue({ id: 'job-active-1', status: 'Running' } as any);

      await triggerPosSyncHandler(mockReq, mockReply);
      expect(mockReply.status).toHaveBeenCalledWith(409);
    });

    it('should return success 200 when triggering sync on demand', async () => {
      const mockReq: any = { authCtx: { orgId: testOrgId } };
      const mockReply: any = {};

      vi.spyOn(prisma.syncJob, 'findFirst').mockResolvedValue(null);

      const res = await triggerPosSyncHandler(mockReq, mockReply);
      expect(res.success).toBe(true);
    });
  });

  describe('5. 2:00 AM Inventory Audit Cron', () => {
    it('should scan inventory, classify statuses, and flag replenishment items', async () => {
      const mockInventoryItems = [
        {
          id: 'inv-1',
          orgId: testOrgId,
          posProductId: 101,
          productCode: 'SKU-101',
          productName: 'Sữa tươi Hi Sweetie',
          branchName: 'Chi nhánh Q1',
          onHand: 0,
          reserved: 0,
          available: 0,
          minStockLevel: 10,
          status: 'InStock', // Mismatched! Should be OutOfStock
        },
        {
          id: 'inv-2',
          orgId: testOrgId,
          posProductId: 102,
          productCode: 'SKU-102',
          productName: 'Bánh Ngọt',
          branchName: 'Chi nhánh Q1',
          onHand: 5,
          reserved: 0,
          available: 5,
          minStockLevel: 15,
          status: 'LowStock',
        },
      ];

      vi.spyOn(prisma.posBranchInventory, 'findMany').mockResolvedValue(mockInventoryItems as any);
      vi.spyOn(prisma.posBranchInventory, 'update').mockResolvedValue({} as any);

      const summary = await executeInventoryAuditForOrg(testOrgId, 'Hi Sweetie Store');

      expect(summary.totalScanned).toBe(2);
      expect(summary.outOfStockCount).toBe(1);
      expect(summary.lowStockCount).toBe(1);
      expect(summary.reconciledCount).toBe(1);
      expect(summary.replenishmentCount).toBe(2);

      const reportText = formatInventoryAuditReportText('Hi Sweetie Store', summary);
      expect(reportText).toContain('BÁO CÁO KIỂM KÊ KHO BAN ĐÊM (02:00 AM)');
      expect(reportText).toContain('Hi Sweetie Store');
      expect(reportText).toContain('SKU-101');
    });
  });

  describe('6. 8:00 AM Morning Summary Report Cron', () => {
    it('should calculate date range for previous day accurately', () => {
      const fixedDate = new Date('2026-07-31T12:00:00Z');
      const { startDate, endDate, dateStr } = getPreviousDayRange(fixedDate);

      expect(dateStr).toBe('30/07/2026');
      expect(startDate.getTime()).toBeLessThan(endDate.getTime());
    });

    it('should aggregate POS metrics for organization', async () => {
      vi.spyOn(prisma.posOrder, 'count')
        .mockResolvedValueOnce(50 as any) // created
        .mockResolvedValueOnce(45 as any) // completed
        .mockResolvedValueOnce(2 as any); // cancelled
      vi.spyOn(prisma.posOrder, 'aggregate').mockResolvedValue({ _sum: { grandTotal: 50000000 } } as any);

      vi.spyOn(prisma.posInvoice, 'count').mockResolvedValue(40 as any);
      vi.spyOn(prisma.posInvoice, 'aggregate')
        .mockResolvedValueOnce({ _sum: { paidAmount: 48000000 } } as any) // invoice sum
        .mockResolvedValueOnce({ _sum: { remainingDebt: 2000000 } } as any); // new debt sum

      vi.spyOn(prisma.posCustomerDebt, 'count')
        .mockResolvedValueOnce(15 as any) // active debts count
        .mockResolvedValueOnce(3 as any); // danger debts count
      vi.spyOn(prisma.posCustomerDebt, 'aggregate').mockResolvedValue({ _sum: { currentDebt: 35000000 } } as any);

      vi.spyOn(prisma.posWebhookLog, 'count')
        .mockResolvedValueOnce(100 as any) // total wh
        .mockResolvedValueOnce(98 as any) // processed
        .mockResolvedValueOnce(2 as any) // failed
        .mockResolvedValueOnce(0 as any); // pending

      const metrics = await aggregatePosMetricsForOrg(testOrgId, new Date('2026-07-31T12:00:00Z'));

      expect(metrics.posOrdersCreated).toBe(50);
      expect(metrics.totalOrderAmount).toBe(50000000);
      expect(metrics.totalInvoiceRevenue).toBe(48000000);
      expect(metrics.successRate).toBe(98);

      const reportText = formatPosSummaryReportText('Hi Sweetie Store', metrics);
      expect(reportText).toContain('BÁO CÁO TỔNG HỢP SÁNG (08:00 AM)');
      expect(reportText).toContain('50 đơn');
      expect(reportText).toContain('98%');
    });
  });
});
