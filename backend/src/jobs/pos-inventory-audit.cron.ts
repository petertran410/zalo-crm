/**
 * pos-inventory-audit.cron.ts
 * 2:00 AM Daily Nightly Inventory Audit Cron Job for Hi-CRM POS Sync.
 */
import cron from 'node-cron';
import { prisma } from '../shared/database/prisma-client.js';
import { logger } from '../shared/utils/logger.js';
import { sendSystemNotificationToUser } from '../modules/system-notifications/system-notify-service.js';
import { zaloPool } from '../modules/zalo/zalo-pool.js';

const CRON_SCHEDULE = '0 2 * * *'; // 2:00 AM Asia/Ho_Chi_Minh daily
let isAuditRunning = false;
let cronTask: ReturnType<typeof cron.schedule> | null = null;

export interface InventoryAuditSummary {
  orgId: string;
  totalScanned: number;
  inStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  reconciledCount: number;
  replenishmentCount: number;
  replenishmentItems: Array<{
    posProductId: number;
    productCode: string;
    productName: string;
    branchName: string;
    onHand: number;
    available: number;
    minStockLevel: number;
    status: string;
  }>;
}

export async function executeInventoryAuditForOrg(orgId: string, orgName: string): Promise<InventoryAuditSummary> {
  const items = await prisma.posBranchInventory.findMany({
    where: { orgId },
    orderBy: [{ available: 'asc' }, { minStockLevel: 'desc' }],
  });

  let inStockCount = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let reconciledCount = 0;

  const replenishmentItems: InventoryAuditSummary['replenishmentItems'] = [];
  const statusUpdatesToMake: Array<{ id: string; status: string }> = [];

  for (const item of items) {
    const available = item.available ?? 0;
    const minStock = item.minStockLevel ?? 0;

    let expectedStatus = 'InStock';
    if (available <= 0) {
      expectedStatus = 'OutOfStock';
      outOfStockCount++;
    } else if (available <= minStock) {
      expectedStatus = 'LowStock';
      lowStockCount++;
    } else {
      inStockCount++;
    }

    if (item.status !== expectedStatus) {
      statusUpdatesToMake.push({ id: item.id, status: expectedStatus });
      reconciledCount++;
    }

    if (available <= minStock) {
      replenishmentItems.push({
        posProductId: item.posProductId,
        productCode: item.productCode || `PROD-${item.posProductId}`,
        productName: item.productName || 'Sản phẩm không tên',
        branchName: item.branchName || 'Chi nhánh mặc định',
        onHand: item.onHand,
        available: item.available,
        minStockLevel: item.minStockLevel,
        status: expectedStatus,
      });
    }
  }

  // Batch update status discrepancies
  if (statusUpdatesToMake.length > 0) {
    await Promise.all(
      statusUpdatesToMake.map((update) =>
        prisma.posBranchInventory.update({
          where: { id: update.id },
          data: { status: update.status, lastSyncedAt: new Date() },
        })
      )
    );
  }

  return {
    orgId,
    totalScanned: items.length,
    inStockCount,
    lowStockCount,
    outOfStockCount,
    reconciledCount,
    replenishmentCount: replenishmentItems.length,
    replenishmentItems,
  };
}

export function formatInventoryAuditReportText(orgName: string, summary: InventoryAuditSummary): string {
  const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const topReplenishment = summary.replenishmentItems.slice(0, 10);
  const remainingCount = summary.replenishmentItems.length - topReplenishment.length;

  let report = `📦 [HI-CRM POS] BÁO CÁO KIỂM KÊ KHO BAN ĐÊM (02:00 AM)\n`;
  report += `🏢 Tổ chức: ${orgName}\n`;
  report += `⏰ Thời gian kiểm tra: ${timestamp}\n`;
  report += `--------------------------------------------------\n`;
  report += `📊 TỔNG QUAN TỒN KHO:\n`;
  report += `- Tổng mặt hàng kiểm tra: ${summary.totalScanned}\n`;
  report += `- ✅ Đủ tồn kho (InStock): ${summary.inStockCount}\n`;
  report += `- ⚠️ Sắp hết hàng (LowStock): ${summary.lowStockCount}\n`;
  report += `- ❌ Hết hàng (OutOfStock): ${summary.outOfStockCount}\n`;
  report += `- 🔄 Sai lệch trạng thái tự sửa: ${summary.reconciledCount}\n`;
  report += `--------------------------------------------------\n`;
  report += `🚨 DANH SÁCH CẦN BỔ SUNG (${summary.replenishmentCount} sản phẩm):\n`;

  if (topReplenishment.length === 0) {
    report += `✅ Tất cả mặt hàng đều đạt định mức an toàn.\n`;
  } else {
    topReplenishment.forEach((item, idx) => {
      const emoji = item.status === 'OutOfStock' ? '🔴' : '🟡';
      report += `${idx + 1}. [${item.productCode}] ${item.productName}\n`;
      report += `   • Chi nhánh: ${item.branchName}\n`;
      report += `   • Khả dụng: ${item.available} | Tồn thực tế: ${item.onHand} | Định mức min: ${item.minStockLevel}\n`;
      report += `   • Trạng thái: ${emoji} ${item.status}\n`;
    });

    if (remainingCount > 0) {
      report += `\nℹ️ Và còn ${remainingCount} sản phẩm khác cần bổ sung. Vui lòng kiểm tra Admin Sync Dashboard.\n`;
    }
  }

  report += `--------------------------------------------------\n`;
  report += `📌 Báo cáo tự động từ Hệ thống Hi-CRM POS Sync.`;
  return report;
}

export async function runPosInventoryAuditNow(specificOrgId?: string): Promise<void> {
  logger.info('[pos-inventory-audit-cron] Executing inventory audit cycle...');
  const orgs = await prisma.organization.findMany({
    where: specificOrgId ? { id: specificOrgId } : {},
    select: { id: true, name: true, systemNotifyZaloAccountId: true, internalNotifyGroupThreadId: true },
  });

  for (const org of orgs) {
    try {
      const summary = await executeInventoryAuditForOrg(org.id, org.name);
      logger.info(
        `[pos-inventory-audit-cron] Org ${org.name}: scanned=${summary.totalScanned}, low=${summary.lowStockCount}, out=${summary.outOfStockCount}`
      );

      if (summary.replenishmentCount > 0 || summary.reconciledCount > 0) {
        const reportText = formatInventoryAuditReportText(org.name, summary);

        // Find Admins
        const admins = await prisma.user.findMany({
          where: { orgId: org.id, role: { in: ['owner', 'admin'] } },
          select: { id: true },
        });

        const priority = summary.outOfStockCount > 0 ? 'high' : 'normal';
        const urgency = summary.outOfStockCount > 0 ? 2 : 1;

        for (const admin of admins) {
          await sendSystemNotificationToUser({
            orgId: org.id,
            targetUserId: admin.id,
            type: 'POS_INVENTORY_AUDIT_ALERT',
            title: '📦 [Tồn kho 02:00 AM] Cảnh báo bổ sung hàng hóa',
            content: reportText,
            priority,
            urgency,
          });
        }

        // Send to Org Zalo Group if configured
        if (org.systemNotifyZaloAccountId && org.internalNotifyGroupThreadId) {
          try {
            const api = zaloPool.getApi(org.systemNotifyZaloAccountId);
            if (api) {
              await api.sendMessage({ msg: reportText }, org.internalNotifyGroupThreadId, 1);
            }
          } catch (err: any) {
            logger.warn(`[pos-inventory-audit-cron] Failed group broadcast for org ${org.id}: ${err.message}`);
          }
        }
      }
    } catch (err: any) {
      logger.error(`[pos-inventory-audit-cron] Error processing audit for org ${org.id}:`, err);
    }
  }
}

export function startPosInventoryAuditCron(): void {
  if (cronTask) return;
  cronTask = cron.schedule(
    CRON_SCHEDULE,
    async () => {
      if (isAuditRunning) {
        logger.warn('[pos-inventory-audit-cron] Previous audit cycle still running, skipping tick.');
        return;
      }
      isAuditRunning = true;
      try {
        await runPosInventoryAuditNow();
      } catch (err: any) {
        logger.error('[pos-inventory-audit-cron] Audit cycle exception:', err);
      } finally {
        isAuditRunning = false;
      }
    },
    { timezone: 'Asia/Ho_Chi_Minh' }
  );
  logger.info(`[pos-inventory-audit-cron] Started, schedule="${CRON_SCHEDULE}" (Asia/Ho_Chi_Minh)`);
}

export function stopPosInventoryAuditCron(): void {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }
}
