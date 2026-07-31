import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prisma } from '../../src/shared/database/prisma-client.js';
import {
  executeInventoryAuditForOrg,
  formatInventoryAuditReportText,
  runPosInventoryAuditNow,
} from '../../src/jobs/pos-inventory-audit.cron.js';
import {
  getPreviousDayRange,
  aggregatePosMetricsForOrg,
  formatPosSummaryReportText,
  runPosSummaryReportNow,
} from '../../src/jobs/pos-summary-report.cron.js';
import * as systemNotifyModule from '../../src/modules/system-notifications/system-notify-service.js';

describe('Empirical Verification: 2:00 AM Inventory Audit & 8:00 AM Summary Cron (Criterion 5)', () => {
  const testOrgId = 'org-test-cron-123';
  const testOrgName = 'Cửa hàng Mỹ Phẩm Sweetie';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ── 1. 2:00 AM Inventory Audit Cron Verification ──────────────────────────
  describe('1. 2:00 AM Nightly Inventory Audit (pos-inventory-audit.cron.ts)', () => {
    it('should classify inventory items into InStock, LowStock, OutOfStock and reconcile mismatched statuses', async () => {
      const mockItems = [
        {
          id: 'item-1',
          orgId: testOrgId,
          posProductId: 101,
          productCode: 'SP-001',
          productName: 'Son Kem Lỳ',
          branchName: 'Chi nhánh 1',
          onHand: 50,
          available: 40,
          minStockLevel: 10,
          status: 'InStock',
        },
        {
          id: 'item-2',
          orgId: testOrgId,
          posProductId: 102,
          productCode: 'SP-002',
          productName: 'Phấn Nước Cushion',
          branchName: 'Chi nhánh 1',
          onHand: 5,
          available: 3,
          minStockLevel: 5,
          status: 'InStock', // Mismatch! Should be LowStock
        },
        {
          id: 'item-3',
          orgId: testOrgId,
          posProductId: 103,
          productCode: 'SP-003',
          productName: 'Nước Tẩy Trang 500ml',
          branchName: 'Chi nhánh 2',
          onHand: 0,
          available: 0,
          minStockLevel: 10,
          status: 'InStock', // Mismatch! Should be OutOfStock
        },
      ];

      vi.spyOn(prisma.posBranchInventory, 'findMany').mockResolvedValue(mockItems as any);
      const updateSpy = vi.spyOn(prisma.posBranchInventory, 'update').mockResolvedValue({} as any);

      const summary = await executeInventoryAuditForOrg(testOrgId, testOrgName);

      expect(summary.totalScanned).toBe(3);
      expect(summary.inStockCount).toBe(1);
      expect(summary.lowStockCount).toBe(1);
      expect(summary.outOfStockCount).toBe(1);
      expect(summary.reconciledCount).toBe(2);
      expect(summary.replenishmentCount).toBe(2);

      // Verify DB updates for reconciled items
      expect(updateSpy).toHaveBeenCalledTimes(2);
      expect(updateSpy).toHaveBeenNthCalledWith(1, {
        where: { id: 'item-2' },
        data: expect.objectContaining({ status: 'LowStock' }),
      });
      expect(updateSpy).toHaveBeenNthCalledWith(2, {
        where: { id: 'item-3' },
        data: expect.objectContaining({ status: 'OutOfStock' }),
      });
    });

    it('should format inventory audit report with mandatory fields and headings', () => {
      const summary = {
        orgId: testOrgId,
        totalScanned: 150,
        inStockCount: 130,
        lowStockCount: 15,
        outOfStockCount: 5,
        reconciledCount: 3,
        replenishmentCount: 20,
        replenishmentItems: [
          {
            posProductId: 103,
            productCode: 'SP-003',
            productName: 'Nước Tẩy Trang 500ml',
            branchName: 'Chi nhánh 2',
            onHand: 0,
            available: 0,
            minStockLevel: 10,
            status: 'OutOfStock',
          },
        ],
      };

      const reportText = formatInventoryAuditReportText(testOrgName, summary);

      expect(reportText).toContain('📦 [HI-CRM POS] BÁO CÁO KIỂM KÊ KHO BAN ĐÊM (02:00 AM)');
      expect(reportText).toContain(`Tổ chức: ${testOrgName}`);
      expect(reportText).toContain('Tổng mặt hàng kiểm tra: 150');
      expect(reportText).toContain('✅ Đủ tồn kho (InStock): 130');
      expect(reportText).toContain('⚠️ Sắp hết hàng (LowStock): 15');
      expect(reportText).toContain('❌ Hết hàng (OutOfStock): 5');
      expect(reportText).toContain('🔄 Sai lệch trạng thái tự sửa: 3');
      expect(reportText).toContain('🚨 DANH SÁCH CẦN BỔ SUNG (20 sản phẩm):');
      expect(reportText).toContain('[SP-003] Nước Tẩy Trang 500ml');
    });

    it('should trigger system notifications to Org Admins during full runPosInventoryAuditNow execution', async () => {
      const mockOrg = {
        id: testOrgId,
        name: testOrgName,
        systemNotifyZaloAccountId: null,
        internalNotifyGroupThreadId: null,
      };

      vi.spyOn(prisma.organization, 'findMany').mockResolvedValue([mockOrg] as any);
      vi.spyOn(prisma.posBranchInventory, 'findMany').mockResolvedValue([
        {
          id: 'item-out',
          posProductId: 201,
          productCode: 'SP-OUT',
          productName: 'Kem Chống Nắng',
          branchName: 'Chi nhánh 1',
          onHand: 0,
          available: 0,
          minStockLevel: 15,
          status: 'OutOfStock',
        },
      ] as any);
      vi.spyOn(prisma.posBranchInventory, 'update').mockResolvedValue({} as any);

      vi.spyOn(prisma.user, 'findMany').mockResolvedValue([{ id: 'admin-1' }] as any);
      const notifySpy = vi.spyOn(systemNotifyModule, 'sendSystemNotificationToUser').mockResolvedValue({} as any);

      await runPosInventoryAuditNow(testOrgId);

      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: testOrgId,
          targetUserId: 'admin-1',
          type: 'POS_INVENTORY_AUDIT_ALERT',
          priority: 'high',
          urgency: 2,
          title: expect.stringContaining('Tồn kho 02:00 AM'),
        })
      );
    });
  });

  // ── 2. 8:00 AM Morning Summary Cron Verification ──────────────────────────
  describe('2. 8:00 AM Daily Morning Summary (pos-summary-report.cron.ts)', () => {
    it('should calculate previous calendar day range correctly in VN Timezone (+07:00)', () => {
      // Mock fixed time: 2026-07-31T08:00:00+07:00 (01:00:00 UTC)
      const now = new Date('2026-07-31T01:00:00.000Z');
      const { startDate, endDate, dateStr } = getPreviousDayRange(now);

      expect(dateStr).toBe('30/07/2026');

      // Yesterday in VN (+07:00): 2026-07-30T00:00:00+07:00 -> 2026-07-29T17:00:00Z
      expect(startDate.toISOString()).toBe('2026-07-29T17:00:00.000Z');

      // Yesterday end in VN (+07:00): 2026-07-30T23:59:59.999+07:00 -> 2026-07-30T16:59:59.999Z
      expect(endDate.toISOString()).toBe('2026-07-30T16:59:59.999Z');
    });

    it('should aggregate all 4 metric dimensions accurately', async () => {
      vi.spyOn(prisma.posOrder, 'count')
        .mockResolvedValueOnce(50) // ordersCreated
        .mockResolvedValueOnce(45) // ordersCompleted
        .mockResolvedValueOnce(2); // ordersCancelled

      vi.spyOn(prisma.posOrder, 'aggregate').mockResolvedValue({ _sum: { grandTotal: 15000000 } } as any);

      vi.spyOn(prisma.posInvoice, 'count').mockResolvedValue(40);
      vi.spyOn(prisma.posInvoice, 'aggregate')
        .mockResolvedValueOnce({ _sum: { paidAmount: 14000000 } } as any) // invoice revenue
        .mockResolvedValueOnce({ _sum: { remainingDebt: 1000000 } } as any); // new debt

      vi.spyOn(prisma.posCustomerDebt, 'count')
        .mockResolvedValueOnce(15) // activeDebtsCount
        .mockResolvedValueOnce(3); // dangerDebtsCount

      vi.spyOn(prisma.posCustomerDebt, 'aggregate').mockResolvedValue({ _sum: { currentDebt: 5000000 } } as any);

      vi.spyOn(prisma.posWebhookLog, 'count')
        .mockResolvedValueOnce(100) // totalWh
        .mockResolvedValueOnce(95)  // processedWh
        .mockResolvedValueOnce(3)   // failedWh
        .mockResolvedValueOnce(2);  // pendingWh

      const metrics = await aggregatePosMetricsForOrg(testOrgId, new Date('2026-07-31T01:00:00.000Z'));

      expect(metrics.dateStr).toBe('30/07/2026');
      expect(metrics.posOrdersCreated).toBe(50);
      expect(metrics.posOrdersCompleted).toBe(45);
      expect(metrics.posOrdersCancelled).toBe(2);
      expect(metrics.totalOrderAmount).toBe(15000000);
      expect(metrics.totalInvoicesCount).toBe(40);
      expect(metrics.totalInvoiceRevenue).toBe(14000000);
      expect(metrics.newDebtIncurred).toBe(1000000);
      expect(metrics.totalActiveDebtsCount).toBe(15);
      expect(metrics.totalOutstandingDebt).toBe(5000000);
      expect(metrics.dangerDebtsCount).toBe(3);
      expect(metrics.totalWebhooks).toBe(100);
      expect(metrics.successfulWebhooks).toBe(95);
      expect(metrics.failedWebhooks).toBe(3);
      expect(metrics.pendingWebhooks).toBe(2);
      expect(metrics.successRate).toBe(95.0);
    });

    it('should format morning summary report text with exact section formatting', () => {
      const mockMetrics = {
        dateStr: '30/07/2026',
        posOrdersCreated: 50,
        posOrdersCompleted: 45,
        posOrdersCancelled: 2,
        totalOrderAmount: 15000000,
        totalInvoicesCount: 40,
        totalInvoiceRevenue: 14000000,
        newDebtIncurred: 1000000,
        totalActiveDebtsCount: 15,
        totalOutstandingDebt: 5000000,
        dangerDebtsCount: 3,
        totalWebhooks: 100,
        successfulWebhooks: 95,
        failedWebhooks: 3,
        pendingWebhooks: 2,
        successRate: 95.0,
      };

      const text = formatPosSummaryReportText(testOrgName, mockMetrics);

      expect(text).toContain('☀️ [HI-CRM POS] BÁO CÁO TỔNG HỢP SÁNG (08:00 AM)');
      expect(text).toContain('Ngày báo cáo: 30/07/2026 (Dữ liệu ngày hôm qua)');
      expect(text).toContain(`Tổ chức: ${testOrgName}`);
      expect(text).toContain('🛒 1. ĐƠN HÀNG POS (POS ORDERS):');
      expect(text).toContain('Tổng đơn tạo mới: 50 đơn');
      expect(text).toContain('Đơn hoàn tất: 45 đơn');
      expect(text).toContain('Tổng giá trị đơn: 15.000.000 VNĐ');
      expect(text).toContain('💳 2. DOANH THU HÓA ĐƠN (INVOICES):');
      expect(text).toContain('Hóa đơn phát hành: 40 hóa đơn');
      expect(text).toContain('Thực thu (doanh thu): 14.000.000 VNĐ');
      expect(text).toContain('💰 3. BIẾN ĐỘNG CÔNG NỢ (DEBTS):');
      expect(text).toContain('Nợ mới phát sinh: 1.000.000 VNĐ');
      expect(text).toContain('Tổng dư nợ hiện tại: 5.000.000 VNĐ (15 KH)');
      expect(text).toContain('Cảnh báo nợ quá hạn/nguy hiểm: 3 khách hàng 🔴');
      expect(text).toContain('📡 4. TRẠNG THÁI WEBHOOK & ĐỒNG BỘ:');
      expect(text).toContain('Webhook nhận: 100 lượt');
      expect(text).toContain('Xử lý thành công: 95 (95%)');
      expect(text).toContain('Thất bại: 3 lượt');
      expect(text).toContain('Đang chờ xử lý: 2 lượt');
    });

    it('should dispatch morning summary notification to active admins during runPosSummaryReportNow', async () => {
      const mockOrg = {
        id: testOrgId,
        name: testOrgName,
        systemNotifyZaloAccountId: null,
        internalNotifyGroupThreadId: null,
      };

      vi.spyOn(prisma.organization, 'findMany').mockResolvedValue([mockOrg] as any);
      vi.spyOn(prisma.user, 'findMany').mockResolvedValue([{ id: 'owner-1' }] as any);

      // Mock aggregate queries
      vi.spyOn(prisma.posOrder, 'count').mockResolvedValue(10);
      vi.spyOn(prisma.posOrder, 'aggregate').mockResolvedValue({ _sum: { grandTotal: 2000000 } } as any);
      vi.spyOn(prisma.posInvoice, 'count').mockResolvedValue(10);
      vi.spyOn(prisma.posInvoice, 'aggregate').mockResolvedValue({ _sum: { paidAmount: 2000000, remainingDebt: 0 } } as any);
      vi.spyOn(prisma.posCustomerDebt, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.posCustomerDebt, 'aggregate').mockResolvedValue({ _sum: { currentDebt: 0 } } as any);
      vi.spyOn(prisma.posWebhookLog, 'count').mockResolvedValue(20);

      const notifySpy = vi.spyOn(systemNotifyModule, 'sendSystemNotificationToUser').mockResolvedValue({} as any);

      await runPosSummaryReportNow(testOrgId, new Date('2026-07-31T01:00:00.000Z'));

      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: testOrgId,
          targetUserId: 'owner-1',
          type: 'POS_MORNING_SUMMARY_REPORT',
          priority: 'normal',
          title: expect.stringContaining('Báo cáo POS 08:00 AM'),
          content: expect.stringContaining('30/07/2026'),
        })
      );
    });
  });
});
