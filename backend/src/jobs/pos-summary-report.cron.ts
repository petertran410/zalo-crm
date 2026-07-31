/**
 * pos-summary-report.cron.ts
 * 8:00 AM Daily Morning Summary Report Cron Job for Hi-CRM POS Sync.
 */
import cron from 'node-cron';
import { prisma } from '../shared/database/prisma-client.js';
import { logger } from '../shared/utils/logger.js';
import { sendSystemNotificationToUser } from '../modules/system-notifications/system-notify-service.js';
import { zaloPool } from '../modules/zalo/zalo-pool.js';

const CRON_SCHEDULE = '0 8 * * *'; // 8:00 AM Asia/Ho_Chi_Minh daily
let isReportRunning = false;
let cronTask: ReturnType<typeof cron.schedule> | null = null;

export interface PosSummaryMetrics {
  dateStr: string;
  // Orders
  posOrdersCreated: number;
  posOrdersCompleted: number;
  posOrdersCancelled: number;
  totalOrderAmount: number;
  // Invoices
  totalInvoicesCount: number;
  totalInvoiceRevenue: number;
  // Debts
  newDebtIncurred: number;
  totalActiveDebtsCount: number;
  totalOutstandingDebt: number;
  dangerDebtsCount: number;
  // Webhooks
  totalWebhooks: number;
  successfulWebhooks: number;
  failedWebhooks: number;
  pendingWebhooks: number;
  successRate: number;
}

export function getPreviousDayRange(now = new Date()): { startDate: Date; endDate: Date; dateStr: string } {
  const tzOffset = 7 * 60 * 60 * 1000; // VN +07:00
  const localNow = new Date(now.getTime() + tzOffset);

  const yesterdayLocal = new Date(localNow);
  yesterdayLocal.setUTCDate(yesterdayLocal.getUTCDate() - 1);

  const yyyy = yesterdayLocal.getUTCFullYear();
  const mm = String(yesterdayLocal.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(yesterdayLocal.getUTCDate()).padStart(2, '0');
  const dateStr = `${dd}/${mm}/${yyyy}`;

  const startDate = new Date(Date.UTC(yyyy, yesterdayLocal.getUTCMonth(), yesterdayLocal.getUTCDate(), 0, 0, 0, 0) - tzOffset);
  const endDate = new Date(Date.UTC(yyyy, yesterdayLocal.getUTCMonth(), yesterdayLocal.getUTCDate(), 23, 59, 59, 999) - tzOffset);

  return { startDate, endDate, dateStr };
}

export async function aggregatePosMetricsForOrg(orgId: string, targetDate = new Date()): Promise<PosSummaryMetrics> {
  const { startDate, endDate, dateStr } = getPreviousDayRange(targetDate);

  // 1. Orders
  const [ordersCreated, ordersCompleted, ordersCancelled, orderSum] = await Promise.all([
    prisma.posOrder.count({ where: { orgId, createdAt: { gte: startDate, lte: endDate } } }),
    prisma.posOrder.count({ where: { orgId, status: 'Completed', updatedAt: { gte: startDate, lte: endDate } } }),
    prisma.posOrder.count({ where: { orgId, status: 'Cancelled', updatedAt: { gte: startDate, lte: endDate } } }),
    prisma.posOrder.aggregate({
      where: { orgId, createdAt: { gte: startDate, lte: endDate } },
      _sum: { grandTotal: true },
    }),
  ]);

  // 2. Invoices
  const [invoicesCount, invoiceSum] = await Promise.all([
    prisma.posInvoice.count({ where: { orgId, invoiceDate: { gte: startDate, lte: endDate } } }),
    prisma.posInvoice.aggregate({
      where: { orgId, invoiceDate: { gte: startDate, lte: endDate } },
      _sum: { paidAmount: true },
    }),
  ]);

  // 3. Debts
  const [newDebtSum, activeDebtsCount, outstandingDebtSum, dangerCount] = await Promise.all([
    prisma.posInvoice.aggregate({
      where: { orgId, invoiceDate: { gte: startDate, lte: endDate }, remainingDebt: { gt: 0 } },
      _sum: { remainingDebt: true },
    }),
    prisma.posCustomerDebt.count({ where: { orgId, currentDebt: { gt: 0 } } }),
    prisma.posCustomerDebt.aggregate({
      where: { orgId, currentDebt: { gt: 0 } },
      _sum: { currentDebt: true },
    }),
    prisma.posCustomerDebt.count({
      where: { orgId, OR: [{ status: 'Danger' }, { overdueDebt: { gt: 0 } }] },
    }),
  ]);

  // 4. Webhooks
  const [totalWh, processedWh, failedWh, pendingWh] = await Promise.all([
    prisma.posWebhookLog.count({ where: { orgId, createdAt: { gte: startDate, lte: endDate } } }),
    prisma.posWebhookLog.count({ where: { orgId, createdAt: { gte: startDate, lte: endDate }, status: 'PROCESSED' } }),
    prisma.posWebhookLog.count({ where: { orgId, createdAt: { gte: startDate, lte: endDate }, status: 'FAILED' } }),
    prisma.posWebhookLog.count({ where: { orgId, createdAt: { gte: startDate, lte: endDate }, status: 'PENDING' } }),
  ]);

  const successRate = totalWh > 0 ? Number(((processedWh / totalWh) * 100).toFixed(1)) : 100;

  return {
    dateStr,
    posOrdersCreated: ordersCreated,
    posOrdersCompleted: ordersCompleted,
    posOrdersCancelled: ordersCancelled,
    totalOrderAmount: orderSum._sum.grandTotal ?? 0,
    totalInvoicesCount: invoicesCount,
    totalInvoiceRevenue: invoiceSum._sum.paidAmount ?? 0,
    newDebtIncurred: newDebtSum._sum.remainingDebt ?? 0,
    totalActiveDebtsCount: activeDebtsCount,
    totalOutstandingDebt: outstandingDebtSum._sum.currentDebt ?? 0,
    dangerDebtsCount: dangerCount,
    totalWebhooks: totalWh,
    successfulWebhooks: processedWh,
    failedWebhooks: failedWh,
    pendingWebhooks: pendingWh,
    successRate,
  };
}

export function formatPosSummaryReportText(orgName: string, m: PosSummaryMetrics): string {
  const fmt = (num: number) => new Intl.NumberFormat('vi-VN').format(Math.round(num));

  let text = `☀️ [HI-CRM POS] BÁO CÁO TỔNG HỢP SÁNG (08:00 AM)\n`;
  text += `📅 Ngày báo cáo: ${m.dateStr} (Dữ liệu ngày hôm qua)\n`;
  text += `🏢 Tổ chức: ${orgName}\n`;
  text += `==================================================\n\n`;

  text += `🛒 1. ĐƠN HÀNG POS (POS ORDERS):\n`;
  text += `   • Tổng đơn tạo mới: ${m.posOrdersCreated} đơn\n`;
  text += `   • Đơn hoàn tất: ${m.posOrdersCompleted} đơn\n`;
  text += `   • Đơn hủy: ${m.posOrdersCancelled} đơn\n`;
  text += `   • Tổng giá trị đơn: ${fmt(m.totalOrderAmount)} VNĐ\n\n`;

  text += `💳 2. DOANH THU HÓA ĐƠN (INVOICES):\n`;
  text += `   • Hóa đơn phát hành: ${m.totalInvoicesCount} hóa đơn\n`;
  text += `   • Thực thu (doanh thu): ${fmt(m.totalInvoiceRevenue)} VNĐ\n\n`;

  text += `💰 3. BIẾN ĐỘNG CÔNG NỢ (DEBTS):\n`;
  text += `   • Nợ mới phát sinh: ${fmt(m.newDebtIncurred)} VNĐ\n`;
  text += `   • Tổng dư nợ hiện tại: ${fmt(m.totalOutstandingDebt)} VNĐ (${m.totalActiveDebtsCount} KH)\n`;
  text += `   • Cảnh báo nợ quá hạn/nguy hiểm: ${m.dangerDebtsCount} khách hàng ${m.dangerDebtsCount > 0 ? '🔴' : '🟢'}\n\n`;

  text += `📡 4. TRẠNG THÁI WEBHOOK & ĐỒNG BỘ:\n`;
  text += `   • Webhook nhận: ${m.totalWebhooks} lượt\n`;
  text += `   • Xử lý thành công: ${m.successfulWebhooks} (${m.successRate}%)\n`;
  text += `   • Thất bại: ${m.failedWebhooks} lượt\n`;
  text += `   • Đang chờ xử lý: ${m.pendingWebhooks} lượt\n\n`;

  text += `==================================================\n`;
  text += `📌 Báo cáo tự động được khởi tạo lúc 08:00 AM bởi Hi-CRM POS System.`;
  return text;
}

export async function runPosSummaryReportNow(specificOrgId?: string, targetDate = new Date()): Promise<void> {
  logger.info('[pos-summary-report-cron] Generating morning summary reports...');
  const orgs = await prisma.organization.findMany({
    where: specificOrgId ? { id: specificOrgId } : {},
    select: { id: true, name: true, systemNotifyZaloAccountId: true, internalNotifyGroupThreadId: true },
  });

  for (const org of orgs) {
    try {
      const metrics = await aggregatePosMetricsForOrg(org.id, targetDate);
      const reportText = formatPosSummaryReportText(org.name, metrics);

      logger.info(
        `[pos-summary-report-cron] Org ${org.name}: orders=${metrics.posOrdersCreated}, revenue=${metrics.totalInvoiceRevenue}, whSuccess=${metrics.successRate}%`
      );

      const admins = await prisma.user.findMany({
        where: { orgId: org.id, role: { in: ['owner', 'admin'] } },
        select: { id: true },
      });

      for (const admin of admins) {
        await sendSystemNotificationToUser({
          orgId: org.id,
          targetUserId: admin.id,
          type: 'POS_MORNING_SUMMARY_REPORT',
          title: `☀️ [Báo cáo POS 08:00 AM] Tổng hợp ngày ${metrics.dateStr}`,
          content: reportText,
          priority: 'normal',
        });
      }

      if (org.systemNotifyZaloAccountId && org.internalNotifyGroupThreadId) {
        try {
          const api = zaloPool.getApi(org.systemNotifyZaloAccountId);
          if (api) {
            await api.sendMessage({ msg: reportText }, org.internalNotifyGroupThreadId, 1);
          }
        } catch (err: any) {
          logger.warn(`[pos-summary-report-cron] Failed group broadcast for org ${org.id}: ${err.message}`);
        }
      }
    } catch (err: any) {
      logger.error(`[pos-summary-report-cron] Exception generating summary for org ${org.id}:`, err);
    }
  }
}

export function startPosSummaryReportCron(): void {
  if (cronTask) return;
  cronTask = cron.schedule(
    CRON_SCHEDULE,
    async () => {
      if (isReportRunning) {
        logger.warn('[pos-summary-report-cron] Previous report cycle still running, skipping tick.');
        return;
      }
      isReportRunning = true;
      try {
        await runPosSummaryReportNow();
      } catch (err: any) {
        logger.error('[pos-summary-report-cron] Report cycle exception:', err);
      } finally {
        isReportRunning = false;
      }
    },
    { timezone: 'Asia/Ho_Chi_Minh' }
  );
  logger.info(`[pos-summary-report-cron] Started, schedule="${CRON_SCHEDULE}" (Asia/Ho_Chi_Minh)`);
}

export function stopPosSummaryReportCron(): void {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }
}
