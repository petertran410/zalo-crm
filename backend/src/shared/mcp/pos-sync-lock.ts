import { logger } from '../utils/logger.js';

/**
 * Khoá chạy tuần tự cho các tiến trình đồng bộ POS.
 *
 * POS chặn ở mức 5000 request/giờ cho mỗi client OAuth. Nếu bấm đồng bộ thủ công
 * trong lúc cron đêm hoặc worker nền đang chạy, các luồng đó cùng tiêu hạn mức và
 * kéo nhau chạm trần. Khoá theo cặp `orgId + entity` để một loại dữ liệu chỉ có
 * đúng một tiến trình chạy tại một thời điểm; lần gọi trùng bị bỏ qua thay vì
 * xếp hàng, vì đồng bộ lại ngay lập tức không mang thêm dữ liệu mới.
 *
 * Phạm vi: trong một tiến trình Node. Khi chạy nhiều bản sao cần khoá ở tầng cơ
 * sở dữ liệu (advisory lock) hoặc Redis.
 */
const running = new Map<string, number>();

export type SyncEntity =
  | 'Customer'
  | 'Product'
  | 'Order'
  | 'Invoice'
  | 'BranchInventory'
  | 'ContactPull'
  | 'All';

export function isSyncRunning(orgId: string, entity: SyncEntity): boolean {
  return running.has(`${orgId}:${entity}`);
}

/**
 * Chạy `operation` nếu chưa có tiến trình cùng loại; nếu đang chạy thì bỏ qua và
 * trả `skipped: true` để phía gọi báo lại cho người dùng.
 */
export async function withSyncLock<T>(
  orgId: string,
  entity: SyncEntity,
  operation: () => Promise<T>,
): Promise<{ skipped: boolean; result?: T }> {
  const key = `${orgId}:${entity}`;
  if (running.has(key)) {
    logger.warn(`[sync-lock] ${key} đang chạy từ ${new Date(running.get(key)!).toISOString()}, bỏ qua lần gọi này`);
    return { skipped: true };
  }

  running.set(key, Date.now());
  try {
    return { skipped: false, result: await operation() };
  } finally {
    running.delete(key);
  }
}
