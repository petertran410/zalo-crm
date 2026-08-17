const locks = new Map<string, Promise<void>>();

/** Ném ra khi người dùng bấm hủy giữa chừng — không phải lỗi hệ thống. */
export class SyncCancelledError extends Error {
  constructor(message = 'Đồng bộ đã bị hủy') {
    super(message);
    this.name = 'SyncCancelledError';
  }
}

/**
 * Hàm kiểm tra hủy, truyền xuống các vòng phân trang dài.
 * Trả về true nghĩa là người dùng đã bấm hủy và vòng lặp phải dừng.
 */
export type ShouldCancel = () => Promise<boolean>;

/** Serialize one POS sync entity per organization inside this CRM process. */
export async function withPosSyncLock<T>(
  orgId: string,
  entity: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = `${orgId}:${entity}`;
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  locks.set(key, current);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (locks.get(key) === current) locks.delete(key);
  }
}
